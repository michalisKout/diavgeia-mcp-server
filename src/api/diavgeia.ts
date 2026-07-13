import axios from "axios";
import dayjs from "dayjs";
import { DEFAULT_CONFIG } from "../config.js";
import {
  type DiavgeiaSearchParams,
  searchSchema,
} from "../modules/search/schema.js";
import type {
  DiavgeiaDecision,
  DiavgeiaSearchResponse,
  Organization,
} from "../types/diavgeia.js";

export interface DiavgeiaApiClientOptions {
  baseUrl?: string;
  timeout?: number;
}

export class DiavgeiaApiClient {
  private baseUrl: string;
  private client;

  constructor(options: DiavgeiaApiClientOptions | string = {}) {
    const resolvedOptions =
      typeof options === "string" ? { baseUrl: options } : options;

    this.baseUrl = resolvedOptions.baseUrl ?? DEFAULT_CONFIG.apiBaseUrl;
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: resolvedOptions.timeout ?? DEFAULT_CONFIG.timeout,
      headers: {
        Accept: "application/json",
      },
    });
  }

  async searchDecisions(
    params: DiavgeiaSearchParams
  ): Promise<DiavgeiaSearchResponse> {
    try {
      try {
        searchSchema.parse(params);
      } catch (error) {
        throw new Error(
          `Σφαλμα επικαιροποίησης παραμέτρων, ${(error as Error).message}`
        );
      }

      const queryParams: Record<string, string | number | string[]> = {};
      const filterQueries: string[] = [];

      if (params.rawQuery) queryParams.query = params.rawQuery;
      if (params.thematicCategory)
        queryParams.query = quoteFilter(
          "thematicCategory",
          params.thematicCategory
        );

      // Don't send wildcard queries - let other filters do the work
      if (params.q && params.q !== "*" && params.q.trim() !== "")
        queryParams.q = params.q;

      if (params.subject)
        filterQueries.push(quoteFilter("subject", params.subject));

      if (params.decisionTypes?.length)
        filterQueries.push(listFilter("decisionType", params.decisionTypes));

      const organizationUid = params.organizationUid ?? params.ministryIdOrName;
      if (organizationUid)
        filterQueries.push(quoteFilter("organizationUid", organizationUid));

      if (params.unitUid)
        filterQueries.push(quoteFilter("unitUid", params.unitUid));

      const decisionType = params.decisionType ?? params.type;
      if (decisionType)
        if (params.rawQuery || params.thematicCategory) {
          filterQueries.push(quoteFilter("decisionType", decisionType));
        } else {
          queryParams.q = quoteFilter("decisionType", decisionType);
        }

      if (params.from_date || params.to_date) {
        const fromDate = params.from_date
          ? dayjs(params.from_date).format("YYYY-MM-DD")
          : "*";
        const toDate = params.to_date
          ? dayjs(params.to_date).format("YYYY-MM-DD")
          : "*";
        filterQueries.push(rangeFilter("issueDate", fromDate, toDate));
      }

      if (filterQueries.length > 0) queryParams.fq = filterQueries;
      if (queryParams.query) queryParams.advanced = "";

      queryParams.page = params.page || 0;
      queryParams.size = Math.min(params.size || 500, 500);
      queryParams.sort = "relative";

      const response = await this.client.get(`${this.baseUrl}/search`, {
        params: queryParams,
        paramsSerializer: serializeSearchParams,
      });

      if (!response.data)
        throw new Error("Μη αναμενόμενη μορφή απάντησης από το API");

      if (response.data.decisions)
        return {
          ...response.data,
          decisions: response.data.decisions.map(normalizeDecision),
          total: response.data.info?.total ?? response.data.total ?? 0,
        };

      if (response.data.results)
        return {
          decisions: response.data.results.map(normalizeDecision),
          total: response.data.total || response.data.results.length,
        };

      return {
        decisions: [],
        total: 0,
      };
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        throw new Error(
          `Σφάλμα API: ${error.response.status} - ${JSON.stringify(error.response.data)}`
        );
      }

      throw new Error(
        `Αποτυχία αναζήτησης αποφάσεων από το API της Διαύγειας, ${(error as Error).message}`
      );
    }
  }

  async getDecisionByAda(ada: string): Promise<DiavgeiaDecision> {
    try {
      if (!ada || ada.trim() === "") {
        throw new Error("Απαιτείται έγκυρο ΑΔΑ");
      }

      const response = await this.client.get(
        `${this.baseUrl}/decisions/${encodeURIComponent(ada)}`
      );

      return response.data;
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

  async getOrganizations(): Promise<Organization[]> {
    try {
      const response = await this.client.get(
        `${this.baseUrl}/organizations.json?category=MINISTRY`
      );

      if (!response.data || !response.data.organizations) {
        throw new Error("Μη αναμενόμενη μορφή απάντησης από το API");
      }

      return response.data.organizations;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        throw new Error(
          `Σφάλμα API: ${error.response.status} - ${JSON.stringify(error.response.data)}`
        );
      }

      throw new Error("Αποτυχία λήψης οργανισμών από το API της Διαύγειας");
    }
  }
}

function serializeSearchParams(
  params: Record<string, string | number | string[]>
): string {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        searchParams.append(key, item);
      }
      continue;
    }

    searchParams.append(key, value.toString());
  }

  return searchParams.toString();
}

function quoteFilter(field: string, value: string | number): string {
  const stringValue = value.toString().trim();
  if (stringValue.startsWith(`${field}:`)) return stringValue;
  return `${field}:"${stringValue}"`;
}

function listFilter(field: string, values: Array<string | number>): string {
  const quotedValues = values.map((value) => `"${value.toString()}"`);
  return `${field}:[${quotedValues.join(",")}]`;
}

function rangeFilter(field: string, from: string, to: string): string {
  return `${field}:[${from} TO ${to}]`;
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
    organizationId: decision.organizationId ?? organization?.uid ?? "",
    organizationName: decision.organizationName ?? organization?.label ?? "",
    decisionTypeId: decision.decisionTypeId ?? decisionType?.uid ?? "",
    decisionTypeName: decision.decisionTypeName ?? decisionType?.label ?? "",
  };
}
