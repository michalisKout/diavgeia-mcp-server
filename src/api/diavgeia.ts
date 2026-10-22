import axios from "axios";
import { DEFAULT_CONFIG } from "../config.js";
import {
  SEARCH_LIMITS,
  type SearchLimits,
  searchLimitsSchema,
} from "../config.js";
import type { DiavgeiaSearchParams } from "../modules/search/schema.js";
import { operationScope } from "../platform/pdf-extractor.js";
import type {
  DiavgeiaDecision,
  DiavgeiaSearchResponse,
  Organization,
} from "../types/diavgeia.js";
import type { OperationContext, SearchCoverage } from "../types/evidence.js";
import {
  SearchError,
  buildNormalizedSearchRequest,
  isTypeUid,
  normalizeSearchParams,
  requestedFilters,
  verifySearchFilters,
} from "./search-request.js";

interface SearchApiPayload {
  organizations?: Organization[];
  decisions?: Array<DiavgeiaDecision & Record<string, unknown>>;
  results?: Array<DiavgeiaDecision & Record<string, unknown>>;
  decisionTypes?: Array<{
    uid: string;
    label: string;
    allowedInDecisions?: boolean;
  }>;
  info?: { query?: string; total?: number; actualSize?: number; page?: number };
  total?: number;
}

export interface DiavgeiaApiClientOptions {
  baseUrl?: string;
  timeout?: number;
  searchLimits?: Partial<SearchLimits>;
}

export class DiavgeiaApiClient {
  private baseUrl: string;
  private client;
  private limits: SearchLimits;

  constructor(options: DiavgeiaApiClientOptions | string = {}) {
    const resolvedOptions =
      typeof options === "string" ? { baseUrl: options } : options;

    this.limits = searchLimitsSchema.parse({
      ...SEARCH_LIMITS,
      ...resolvedOptions.searchLimits,
    });
    this.baseUrl = resolvedOptions.baseUrl ?? DEFAULT_CONFIG.apiBaseUrl;
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: resolvedOptions.timeout ?? DEFAULT_CONFIG.timeout,
      maxContentLength: 4 * 1024 * 1024,
      maxRedirects: 0,
      proxy: false,
      // Axios fetch defaults to cache:"default", which workerd rejects.
      fetchOptions: { cache: "no-store" },
      headers: {
        Accept: "application/json",
      },
    });
  }

  async searchDecisions(
    input: DiavgeiaSearchParams,
    context?: OperationContext
  ): Promise<DiavgeiaSearchResponse> {
    const params = normalizeSearchParams(input);
    const requested = requestedFilters(params);
    const controller = new AbortController();
    const deadlineAt = Math.min(
      context?.deadlineAt ?? Number.POSITIVE_INFINITY,
      Date.now() + this.limits.deadlineMs
    );
    if (!Number.isFinite(deadlineAt) || deadlineAt <= Date.now())
      throw new SearchError("Search deadline exceeded", "DEADLINE_EXCEEDED");
    const abort = () => controller.abort(context?.signal.reason);
    if (context?.signal.aborted) abort();
    context?.signal.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(
      () => controller.abort(new Error("Search deadline exceeded")),
      deadlineAt - Date.now()
    );
    const operation = { signal: controller.signal, deadlineAt };
    try {
      if (params.organizationUid && !/^\d+$/.test(params.organizationUid)) {
        const data = await this.searchGet(
          "/organizations.json",
          new URLSearchParams({ category: "MINISTRY" }),
          operation
        );
        if (!Array.isArray(data.organizations))
          throw new SearchError(
            "Invalid organization metadata response",
            "UPSTREAM_RESPONSE"
          );
        const name = normalizeOrganizationName(params.organizationUid);
        const matches = data.organizations.filter((org) =>
          [org.label, org.latinName, org.abbreviation].some(
            (value) => value && normalizeOrganizationName(value) === name
          )
        );
        if (matches.length !== 1)
          throw new SearchError(
            "Unresolved or ambiguous organization name; provide an exact organization UID"
          );
        params.organizationUid = matches[0].uid;
      }
      const labels = [
        params.decisionType,
        ...(params.decisionTypes ?? []),
      ].filter((v): v is string => !!v && !isTypeUid(v));
      if (labels.length) {
        const data = await this.searchGet(
          "/types.json",
          new URLSearchParams(),
          operation
        );
        if (!Array.isArray(data.decisionTypes))
          throw new SearchError(
            "Invalid decision type metadata response",
            "UPSTREAM_RESPONSE"
          );
        const typeMetadata = data.decisionTypes;
        const resolve = (value: string) => {
          if (isTypeUid(value)) return value;
          const matches = typeMetadata.filter(
            (t) => t.label === value && t.allowedInDecisions !== false
          );
          if (matches.length !== 1 || !isTypeUid(matches[0].uid))
            throw new SearchError(
              `Unresolved or ambiguous decision type label: ${value}`
            );
          return matches[0].uid as string;
        };
        if (params.decisionType)
          params.decisionType = resolve(params.decisionType);
        if (params.decisionTypes)
          params.decisionTypes = params.decisionTypes.map(resolve);
      }
      const windows: Array<{ from: string; to: string; complete: boolean }> =
        [];
      let omittedWindows = false;
      if (params.from_date && params.to_date) {
        let start = Date.parse(params.from_date);
        const end = Date.parse(params.to_date);
        while (start <= end && windows.length < this.limits.maxWindows) {
          const last = Math.min(end, start + 179 * 86400000);
          windows.push({
            from: new Date(start).toISOString().slice(0, 10),
            to: new Date(last).toISOString().slice(0, 10),
            complete: false,
          });
          start = last + 86400000;
        }
        omittedWindows = start <= end;
      } else
        windows.push({
          from: params.from_date ?? "*",
          to: params.to_date ?? "*",
          complete: false,
        });
      const coverage: SearchCoverage = {
        contractVersion: 1,
        requestedFilters: requested,
        appliedFilters: {},
        windows,
        upstreamTotal: null,
        hasMore: null,
        completeness: "unknown",
        limitations: [],
      };
      if (!params.from_date || !params.to_date)
        coverage.limitations.push(
          "Upstream applies a default/clamped 180-day issue-date window; open date bounds are not exhaustive."
        );
      if ((params.page ?? 0) > 0)
        coverage.limitations.push("Earlier pages were not searched.");
      if (omittedWindows)
        coverage.limitations.push(
          "Date coverage stopped at the four-window limit."
        );
      const decisions = new Map<string, DiavgeiaDecision>();
      const verified = new Set(Object.keys(coverage.requestedFilters));
      let upstreamTotal: number | null = null;
      let anyMore = omittedWindows;
      let unknownMore = false;
      for (const window of windows) {
        if (decisions.size >= params.size) {
          anyMore = true;
          continue;
        }
        for (let offset = 0; offset < this.limits.maxPages; offset++) {
          const scoped = {
            ...params,
            from_date: window.from === "*" ? undefined : window.from,
            to_date: window.to === "*" ? undefined : window.to,
            page: params.page + offset,
          };
          const request = buildNormalizedSearchRequest(scoped);
          const data = await this.searchGet(
            request.path,
            request.params,
            operation
          );
          const rows = data.decisions ?? data.results;
          if (
            !Array.isArray(rows) ||
            rows.some(
              (row: unknown) =>
                !row ||
                typeof row !== "object" ||
                typeof (row as DiavgeiaDecision).ada !== "string" ||
                !(row as DiavgeiaDecision).ada
            )
          )
            throw new SearchError(
              "Invalid JSON search response: decisions array required",
              "UPSTREAM_RESPONSE"
            );
          const normalized = rows.map(normalizeDecision);
          const echo =
            typeof data.info?.query === "string" ? data.info.query : "";
          const submissionLimited = /submissionTimestamp:/.test(echo);
          if (
            submissionLimited &&
            !coverage.limitations.some((value) =>
              value.includes("submission-time")
            )
          )
            coverage.limitations.push(
              "Upstream also restricted submission-time coverage; historical issue dates may be incomplete."
            );
          const pageVerified = verifySearchFilters(scoped, echo, normalized);
          if (
            ((scoped.from_date && !pageVerified.has("from_date")) ||
              (scoped.to_date && !pageVerified.has("to_date"))) &&
            !coverage.limitations.some((value) => value.includes("full-day"))
          ) {
            coverage.limitations.push(
              "Full-day issue-date coverage could not be verified from upstream time/zone bounds."
            );
          }
          for (const key of verified)
            if (!pageVerified.has(key)) verified.delete(key);
          const total = data.info?.total ?? data.total;
          if (
            rows.length > params.size ||
            (typeof total === "number" &&
              (!Number.isSafeInteger(total) ||
                total <
                  (rows.length
                    ? scoped.page * params.size + rows.length
                    : 0))) ||
            (data.info?.actualSize !== undefined &&
              data.info.actualSize !== rows.length) ||
            (data.info?.page !== undefined && data.info.page !== scoped.page)
          )
            throw new SearchError(
              "Invalid search response pagination/total",
              "UPSTREAM_RESPONSE"
            );
          const knownTotal =
            typeof total === "number" &&
            Number.isSafeInteger(total) &&
            total >= 0
              ? total
              : null;
          if (windows.length === 1) upstreamTotal = knownTotal;
          let discardedUniqueRows = false;
          for (const row of normalized) {
            if (decisions.has(row.ada)) continue;
            if (decisions.size < params.size) decisions.set(row.ada, row);
            else discardedUniqueRows = true;
          }
          if (discardedUniqueRows) anyMore = true;
          const more =
            knownTotal === null
              ? null
              : scoped.page * params.size + rows.length < knownTotal;
          if (more === false) {
            window.complete =
              !discardedUniqueRows &&
              !submissionLimited &&
              Object.keys(requestedFilters(scoped)).every((key) =>
                pageVerified.has(key)
              );
            break;
          }
          if (more === null) {
            unknownMore = true;
            break;
          }
          if (
            decisions.size >= params.size ||
            offset + 1 === this.limits.maxPages ||
            rows.length === 0
          ) {
            anyMore = true;
            break;
          }
        }
      }
      for (const key of verified)
        coverage.appliedFilters[key] = requestedFilters(params)[key];
      if (verified.size !== Object.keys(coverage.requestedFilters).length)
        coverage.limitations.push(
          "Some requested filters could not be verified from upstream echoes or returned metadata."
        );
      coverage.upstreamTotal = upstreamTotal;
      coverage.hasMore = anyMore ? true : unknownMore ? null : false;
      if (anyMore)
        coverage.limitations.push(
          "Result/page/window limit reached; additional matches may exist."
        );
      if (unknownMore)
        coverage.limitations.push(
          "Upstream total is unknown; pagination completeness cannot be established."
        );
      coverage.completeness =
        coverage.limitations.length === 0 && windows.every((w) => w.complete)
          ? "complete"
          : verified.size === 0
            ? "unknown"
            : "limited";
      return {
        decisions: [...decisions.values()],
        total: decisions.size,
        coverage,
      };
    } finally {
      clearTimeout(timer);
      context?.signal.removeEventListener("abort", abort);
    }
  }

  private async searchGet(
    path: string,
    params: URLSearchParams,
    context: OperationContext
  ): Promise<SearchApiPayload> {
    for (let attempt = 0; attempt < this.limits.maxAttempts; attempt++) {
      if (Date.now() >= context.deadlineAt)
        throw new SearchError("Search deadline exceeded", "DEADLINE_EXCEEDED");
      if (context.signal.aborted)
        throw new SearchError("Search aborted", "ABORTED");
      try {
        const response = await this.client.get<SearchApiPayload>(path, {
          params,
          signal: context.signal,
          timeout: Math.min(
            this.client.defaults.timeout ?? DEFAULT_CONFIG.timeout,
            context.deadlineAt - Date.now()
          ),
          maxContentLength: 4 * 1024 * 1024,
        });
        if (
          typeof response.data !== "object" ||
          response.data === null ||
          Array.isArray(response.data) ||
          !String(response.headers["content-type"] ?? "").includes("json")
        )
          throw new SearchError(
            "Invalid JSON response from search API",
            "UPSTREAM_RESPONSE"
          );
        return response.data;
      } catch (error) {
        if (Date.now() >= context.deadlineAt)
          throw new SearchError(
            "Search deadline exceeded",
            "DEADLINE_EXCEEDED"
          );
        if (context.signal.aborted)
          throw new SearchError("Search aborted", "ABORTED");
        const status = axios.isAxiosError(error)
          ? error.response?.status
          : undefined;
        const transient =
          axios.isAxiosError(error) &&
          ((!status &&
            error.code !== "ERR_BAD_RESPONSE" &&
            error.code !== "ERR_BAD_REQUEST") ||
            status === 429 ||
            (status !== undefined && status >= 500));
        if (!transient || attempt + 1 === this.limits.maxAttempts) {
          if (status)
            throw new SearchError(`Search API HTTP ${status}`, "UPSTREAM_HTTP");
          throw error;
        }
        const retryAfter = error.response?.headers["retry-after"];
        const seconds = retryAfter === undefined ? 0.1 : Number(retryAfter);
        const delay = Math.min(
          this.limits.retryAfterMs,
          Math.max(
            0,
            Number.isFinite(seconds)
              ? seconds * 1000
              : Date.parse(String(retryAfter)) - Date.now()
          )
        );
        await new Promise<void>((resolve, reject) => {
          const remaining = context.deadlineAt - Date.now();
          const retryDelay = Number.isFinite(delay) ? delay : 100;
          const abort = () => {
            clearTimeout(timer);
            reject(
              new SearchError(
                Date.now() >= context.deadlineAt
                  ? "Search deadline exceeded"
                  : "Search aborted",
                Date.now() >= context.deadlineAt
                  ? "DEADLINE_EXCEEDED"
                  : "ABORTED"
              )
            );
          };
          const timer = setTimeout(
            () => {
              context.signal.removeEventListener("abort", abort);
              // A deadline-capped wait cannot authorize another attempt,
              // even if the timer wakes just before Date.now() reaches it.
              if (retryDelay >= remaining)
                reject(
                  new SearchError(
                    "Search deadline exceeded",
                    "DEADLINE_EXCEEDED"
                  )
                );
              else resolve();
            },
            Math.min(retryDelay, remaining)
          );
          context.signal.addEventListener("abort", abort, { once: true });
          if (context.signal.aborted) {
            context.signal.removeEventListener("abort", abort);
            abort();
          }
        });
      }
    }
    throw new SearchError("Search failed", "UPSTREAM_HTTP");
  }

  async getDecisionByAda(
    ada: string,
    context?: OperationContext
  ): Promise<DiavgeiaDecision> {
    try {
      if (!ada || ada.trim() === "") {
        throw new Error("Απαιτείται έγκυρο ΑΔΑ");
      }

      const scope = operationScope(
        context ?? {
          signal: new AbortController().signal,
          deadlineAt: Date.now() + SEARCH_LIMITS.deadlineMs,
        },
        SEARCH_LIMITS.deadlineMs
      );
      try {
        const data = await this.searchGet(
          `/decisions/${encodeURIComponent(ada)}`,
          new URLSearchParams(),
          scope
        );
        return normalizeDecision(
          data as unknown as DiavgeiaDecision & Record<string, unknown>
        );
      } finally {
        scope.dispose();
      }
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        throw new Error(
          `Σφάλμα API: ${error.response.status} - ${error.response.statusText}`
        );
      }

      throw new Error(
        `Αποτυχία λήψης απόφασης με ΑΔΑ ${ada}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  async getOrganizations(context?: OperationContext): Promise<Organization[]> {
    const scope = operationScope(
      context ?? {
        signal: new AbortController().signal,
        deadlineAt: Date.now() + SEARCH_LIMITS.deadlineMs,
      },
      SEARCH_LIMITS.deadlineMs
    );
    try {
      const data = await this.searchGet(
        "/organizations.json",
        new URLSearchParams({ category: "MINISTRY" }),
        scope
      );
      if (!Array.isArray(data.organizations))
        throw new SearchError(
          "Invalid organization metadata response",
          "UPSTREAM_RESPONSE"
        );
      return data.organizations;
    } finally {
      scope.dispose();
    }
  }
}

function normalizeDecision(
  decision: DiavgeiaDecision & Record<string, unknown>
) {
  const organization = decision.organization as
    | { uid?: string; label?: string }
    | undefined;
  const decisionType = decision.decisionType as
    | { uid?: string; label?: string }
    | undefined;

  return {
    ...decision,
    issueDate: normalizeIssueDate(decision.issueDate),
    organizationId: decision.organizationId ?? organization?.uid ?? "",
    organizationName: decision.organizationName ?? organization?.label ?? "",
    decisionTypeId: decision.decisionTypeId ?? decisionType?.uid ?? "",
    decisionTypeName: decision.decisionTypeName ?? decisionType?.label ?? "",
  };
}

function normalizeIssueDate(value: unknown): string {
  if (
    typeof value === "number" ||
    (typeof value === "string" && /^\d{11,13}$/.test(value))
  ) {
    const date = new Date(Number(value));
    if (Number.isFinite(date.getTime())) return date.toISOString().slice(0, 10);
  }
  return typeof value === "string" ? value : "";
}

function normalizeOrganizationName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleUpperCase("el-GR")
    .replace(/\s+/g, " ")
    .trim();
}
