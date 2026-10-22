import {
  type DiavgeiaSearchParams,
  searchSchema,
} from "../modules/search/schema.js";
import type { DiavgeiaDecision } from "../types/diavgeia.js";

export class SearchError extends Error {
  constructor(
    message: string,
    public readonly code = "INVALID_INPUT"
  ) {
    super(message);
  }
}
export function normalizeSearchParams(
  input: DiavgeiaSearchParams
): DiavgeiaSearchParams & { page: number; size: number } {
  const p = searchSchema.parse(input);
  const orgs = [p.organizationUid, p.ministryIdOrName, p.org].filter(Boolean);
  if (new Set(orgs).size > 1)
    throw new SearchError("Conflicting organization aliases");
  if (p.type && p.decisionType && p.type !== p.decisionType)
    throw new SearchError("Conflicting decision type aliases");
  if (p.from_date && p.to_date && p.from_date > p.to_date)
    throw new SearchError("Invalid issue date range");
  return {
    ...p,
    q: p.q === "*" ? undefined : p.q,
    organizationUid: orgs[0],
    ministryIdOrName: undefined,
    org: undefined,
    decisionType: p.decisionType || p.type,
    type: undefined,
    page: p.page ?? 0,
    size: p.size ?? 500,
  };
}
export const isTypeUid = (value: string) => /^\d+(?:\.\d+)*$/.test(value);
export function quote(field: string, value: string): string {
  return `${field}:"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
export function dateClause(from: string, to: string): string {
  return `issueDate:[${from === "*" ? "*" : `DT(${from}T00:00:00)`} TO ${to === "*" ? "*" : `DT(${to}T23:59:59)`}]`;
}
export function buildSearchRequest(input: DiavgeiaSearchParams): {
  path: "/search" | "/search/advanced";
  params: URLSearchParams;
} {
  return buildNormalizedSearchRequest(normalizeSearchParams(input));
}
export function buildNormalizedSearchRequest(p: DiavgeiaSearchParams): {
  path: "/search" | "/search/advanced";
  params: URLSearchParams;
} {
  const types = [p.decisionType, ...(p.decisionTypes ?? [])].filter(
    (x): x is string => !!x
  );
  if (types.some((t) => !isTypeUid(t)))
    throw new SearchError(
      "Decision type label must resolve to an official type UID"
    );
  const params = new URLSearchParams({
    page: String(p.page ?? 0),
    size: String(p.size ?? 500),
    sort: "relative",
  });
  const advanced = !!(
    p.rawQuery ||
    p.subject ||
    p.unitUid ||
    p.decisionType ||
    p.decisionTypes?.length ||
    p.thematicCategory
  );
  if (!advanced) {
    if (p.q) params.set("term", p.q);
    if (p.organizationUid) params.set("org", p.organizationUid);
    if (p.from_date) params.set("from_issue_date", p.from_date);
    if (p.to_date) params.set("to_issue_date", p.to_date);
    return { path: "/search", params };
  }
  const clauses = [
    p.rawQuery,
    p.q && quote("q", p.q),
    p.subject && quote("subject", p.subject),
    p.organizationUid && quote("organizationUid", p.organizationUid),
    p.unitUid && quote("unitUid", p.unitUid),
    p.decisionType && quote("decisionTypeUid", p.decisionType),
    p.decisionTypes?.length &&
      `(${p.decisionTypes.map((t) => quote("decisionTypeUid", t)).join(" OR ")})`,
    p.thematicCategory &&
      quote(
        /^\d+$/.test(p.thematicCategory)
          ? "thematicCategoryUid"
          : "thematicCategory",
        p.thematicCategory
      ),
    (p.from_date || p.to_date) &&
      dateClause(p.from_date ?? "*", p.to_date ?? "*"),
  ].filter(Boolean);
  params.set("q", clauses.map((c) => `(${c})`).join(" AND "));
  return { path: "/search/advanced", params };
}

export function requestedFilters(
  p: DiavgeiaSearchParams
): Record<string, string | string[] | number> {
  const filters: Record<string, string | string[] | number> = {};
  const keys: Array<keyof DiavgeiaSearchParams> = [
    "q",
    "rawQuery",
    "subject",
    "organizationUid",
    "unitUid",
    "decisionType",
    "decisionTypes",
    "thematicCategory",
    "from_date",
    "to_date",
  ];
  for (const key of keys) {
    const value = p[key];
    if (
      value !== undefined &&
      value !== "" &&
      (!Array.isArray(value) || value.length > 0)
    )
      filters[key] = value;
  }
  return filters;
}

/** Echoes are corroboration, never an executable query parser. Verify structured metadata too. */
export function verifySearchFilters(
  p: DiavgeiaSearchParams,
  echo: string,
  rows: Array<DiavgeiaDecision & Record<string, unknown>>
): Set<string> {
  const verified = new Set<string>();
  const clauses = conjunctiveClauses(echo);
  const hasClause = (clause: string) => clauses.includes(unwrap(clause));
  const expected: Record<string, string> = {
    q: p.q ? quote("q", p.q) : "",
    rawQuery: p.rawQuery ?? "",
    subject: p.subject ? quote("subject", p.subject) : "",
    organizationUid: p.organizationUid
      ? quote("organizationUid", p.organizationUid)
      : "",
    unitUid: p.unitUid ? quote("unitUid", p.unitUid) : "",
    decisionType: p.decisionType
      ? quote("decisionTypeUid", p.decisionType)
      : "",
    thematicCategory: p.thematicCategory
      ? quote(
          /^\d+$/.test(p.thematicCategory)
            ? "thematicCategoryUid"
            : "thematicCategory",
          p.thematicCategory
        )
      : "",
  };
  for (const [key, clause] of Object.entries(expected))
    if (clause && hasClause(clause)) verified.add(key);
  if (
    p.organizationUid &&
    hasClause(quote("organizationLatinName", p.organizationUid))
  )
    verified.add("organizationUid");
  if (
    p.decisionTypes?.length &&
    hasClause(
      p.decisionTypes.map((t) => quote("decisionTypeUid", t)).join(" OR ")
    )
  )
    verified.add("decisionTypes");
  const dateEcho = /^issueDate:\[DT\(([^)]+)\) TO DT\(([^)]+)\)\]$/.exec(
    clauses.find((clause) => clause.startsWith("issueDate:")) ?? ""
  );
  if (dateEcho) {
    if (
      (p.from_date && dateEcho[1].slice(0, 10) !== p.from_date) ||
      (p.to_date && dateEcho[2].slice(0, 10) !== p.to_date)
    )
      throw new SearchError(
        "Issue date filter echo mismatch",
        "FILTER_MISMATCH"
      );
    // Exact zone-free boundaries preserve the request's own time semantics.
    // Explicit offsets or clipped hours need interval semantics we cannot establish here.
    if (p.from_date && dateEcho[1] === `${p.from_date}T00:00:00`)
      verified.add("from_date");
    if (p.to_date && dateEcho[2] === `${p.to_date}T23:59:59`)
      verified.add("to_date");
  }
  for (const [key, clause] of Object.entries(expected)) {
    const field = clause.split(":")[0];
    if (
      clause &&
      key !== "rawQuery" &&
      !verified.has(key) &&
      clauses.some((value) => value.startsWith(`${field}:`))
    )
      throw new SearchError(`Echoed ${key} filter mismatch`, "FILTER_MISMATCH");
  }
  const checks: Array<
    [
      string,
      (r: DiavgeiaDecision & Record<string, unknown>) => boolean | undefined,
    ]
  > = [
    [
      "organizationUid",
      (r) =>
        !p.organizationUid
          ? undefined
          : r.organizationId
            ? r.organizationId === p.organizationUid ||
              (!!r.organization &&
                typeof r.organization === "object" &&
                "latinName" in r.organization &&
                r.organization.latinName === p.organizationUid)
            : undefined,
    ],
    [
      "decisionType",
      (r) =>
        !p.decisionType || !r.decisionTypeId
          ? undefined
          : r.decisionTypeId === p.decisionType,
    ],
    [
      "decisionTypes",
      (r) =>
        !p.decisionTypes?.length || !r.decisionTypeId
          ? undefined
          : p.decisionTypes.includes(r.decisionTypeId),
    ],
    [
      "unitUid",
      (r) =>
        !p.unitUid || !Array.isArray(r.unitIds)
          ? undefined
          : r.unitIds.includes(p.unitUid),
    ],
    [
      "thematicCategory",
      (r) =>
        !p.thematicCategory ||
        !/^\d+$/.test(p.thematicCategory) ||
        !Array.isArray(r.thematicCategoryIds)
          ? undefined
          : r.thematicCategoryIds.includes(p.thematicCategory),
    ],
    [
      "from_date",
      (r) =>
        !p.from_date || !r.issueDate
          ? undefined
          : r.issueDate.slice(0, 10) >= p.from_date,
    ],
    [
      "to_date",
      (r) =>
        !p.to_date || !r.issueDate
          ? undefined
          : r.issueDate.slice(0, 10) <= p.to_date,
    ],
  ];
  for (const [key, check] of checks) {
    const results = rows.map(check);
    if (results.includes(false))
      throw new SearchError(
        `Returned ${key} filter mismatch`,
        "FILTER_MISMATCH"
      );
    // Returned dates can disprove a filter, but cannot prove that boundary-hour rows were not omitted.
    if (
      key !== "from_date" &&
      key !== "to_date" &&
      results.length &&
      results.every((result) => result === true)
    )
      verified.add(key);
  }
  return verified;
}

// Recognize only literal top-level conjunctions. Unknown/rewritten syntax stays unverified.
function conjunctiveClauses(expression: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quoted = false;
  let escaped = false;
  let start = 0;
  for (let index = 0; index < expression.length; index++) {
    const char = expression[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (quoted) continue;
    if (char === "(") depth++;
    if (char === ")") depth--;
    if (depth < 0) return [];
    if (depth === 0 && expression.slice(index, index + 4) === " OR ") return [];
    if (depth === 0 && expression.slice(index, index + 5) === " AND ") {
      parts.push(unwrap(expression.slice(start, index).trim()));
      start = index + 5;
      index += 4;
    }
  }
  if (quoted || escaped || depth !== 0) return [];
  parts.push(unwrap(expression.slice(start).trim()));
  return parts;
}
function unwrap(expression: string): string {
  let result = expression;
  while (result.startsWith("(") && result.endsWith(")")) {
    let depth = 0;
    let quoted = false;
    let escaped = false;
    let whole = true;
    for (let index = 0; index < result.length; index++) {
      const char = result[index];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') {
        quoted = !quoted;
        continue;
      }
      if (quoted) continue;
      if (char === "(") depth++;
      if (char === ")") depth--;
      if (depth === 0 && index < result.length - 1) {
        whole = false;
        break;
      }
    }
    if (!whole || depth !== 0 || quoted) break;
    result = result.slice(1, -1).trim();
  }
  return result;
}
