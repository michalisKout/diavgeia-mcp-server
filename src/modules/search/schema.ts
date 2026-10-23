import { z } from "zod";

function normalizeDate(
  value: string | number | null | undefined,
  ctx: z.RefinementCtx
) {
  if (value == null || `${value}`.trim() === "") return undefined;
  const raw = `${value}`.trim();
  const date = /^\d{11,13}$/.test(raw)
    ? new Date(Number(raw))
    : new Date(`${raw}T00:00:00Z`);
  const result = Number.isFinite(date.getTime())
    ? date.toISOString().slice(0, 10)
    : "";
  if (!result || (!/^\d{11,13}$/.test(raw) && result !== raw)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Invalid issue date; use YYYY-MM-DD or epoch milliseconds",
    });
    return z.NEVER;
  }
  return result;
}
const dateInput = z
  .union([z.string(), z.number()])
  .nullable()
  .optional()
  .transform(normalizeDate);
function integerInput(min: number) {
  return z
    .union([z.string(), z.number()])
    .optional()
    .transform((value, ctx) => {
      if (value === undefined || `${value}`.trim() === "") return undefined;
      const number = Number(value);
      if (min === 1 && Number.isFinite(number) && number >= 1)
        return Math.min(Math.floor(number), 500);
      if (!Number.isSafeInteger(number) || number < min) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Expected a finite integer >= ${min}`,
        });
        return z.NEVER;
      }
      return min === 1 ? Math.min(number, 500) : number;
    });
}

export const searchRawSchema = {
  org: z
    .string()
    .optional()
    .describe("Legacy organization alias; exact UID or Latin name."),
  q: z
    .union([z.string(), z.number()])
    .nullable()
    .optional()
    .transform((val) => val?.toString()?.trim())
    .describe(
      "Main search query keyword (e.g., 'education', 'health', 'economy'). This is the primary search term for finding relevant government decisions."
    ),
  rawQuery: z
    .union([z.string(), z.number()])
    .nullable()
    .optional()
    .transform((val) => val?.toString()?.trim())
    .describe(
      'Raw Diavgeia advanced query expression. Composed into /search/advanced?q=..., e.g. thematicCategory:"ΑΠΑΣΧΟΛΗΣΗ ΚΑΙ ΕΡΓΑΣΙΑ" or q:"ΠΕ60".'
    ),
  subject: z
    .union([z.string(), z.number()])
    .nullable()
    .optional()
    .transform((val) => val?.toString()?.trim())
    .describe(
      'Exact or phrase subject filter. Advanced subject clause subject:"..." for precise searches.'
    ),
  ministryIdOrName: z
    .union([z.string(), z.number()])
    .nullable()
    .optional()
    .transform((val) => val?.toString()?.trim())
    .describe(
      "Organization UID or exact ministry name/Latin name. Unknown or ambiguous names require an exact UID; no fuzzy organization expansion."
    ),
  organizationUid: z
    .union([z.string(), z.number()])
    .nullable()
    .optional()
    .transform((val) => val?.toString()?.trim())
    .describe(
      'Exact Diavgeia organization UID. Advanced clause organizationUid:"...".'
    ),
  unitUid: z
    .union([z.string(), z.number()])
    .nullable()
    .optional()
    .transform((val) => val?.toString()?.trim())
    .describe('Exact Diavgeia unit UID. Advanced clause unitUid:"...".'),
  type: z
    .union([z.string(), z.number()])
    .nullable()
    .optional()
    .transform((val) => val?.toString()?.trim())
    .describe(
      "Decision type UID alias (e.g., '2.4.7.1'); known labels resolve through official metadata."
    ),
  decisionType: z
    .union([z.string(), z.number()])
    .nullable()
    .optional()
    .transform((val) => val?.toString()?.trim())
    .describe(
      'Exact Diavgeia decision type UID or label. Resolved through official type metadata; advanced clause decisionTypeUid:"...".'
    ),
  decisionTypes: z
    .array(z.union([z.string(), z.number()]))
    .nullable()
    .optional()
    .transform((val) =>
      val
        ?.map((item) => item.toString().trim())
        .filter((item) => item.trim().length > 0)
    )
    .describe(
      "Multiple Diavgeia decision type labels. Resolved through official type metadata; alternatives use grouped decisionTypeUid clauses with OR."
    ),
  thematicCategory: z
    .union([z.string(), z.number()])
    .nullable()
    .optional()
    .transform((val) => val?.toString()?.trim())
    .describe(
      'Exact thematic category label. Advanced clause thematicCategory:"...".'
    ),
  from_date: dateInput.describe(
    "Issue-date start: YYYY-MM-DD or epoch milliseconds."
  ),
  to_date: dateInput.describe(
    "Issue-date end: YYYY-MM-DD or epoch milliseconds."
  ),
  page: integerInput(0).describe("Zero-based page number."),
  size: integerInput(1).describe("Results per response, capped at 500."),
};

export const searchSchema = z.object(searchRawSchema);

export type DiavgeiaSearchParams = z.infer<typeof searchSchema>;

export const searchOutputRawSchema = {
  errorCode: z.string().optional(),
  coverage: z
    .object({
      contractVersion: z.literal(1),
      requestedFilters: z.record(
        z.union([z.string(), z.array(z.string()), z.number()])
      ),
      appliedFilters: z.record(
        z.union([z.string(), z.array(z.string()), z.number()])
      ),
      windows: z.array(
        z.object({ from: z.string(), to: z.string(), complete: z.boolean() })
      ),
      upstreamTotal: z.number().nullable(),
      hasMore: z.boolean().nullable(),
      completeness: z.enum(["complete", "limited", "unknown"]),
      limitations: z.array(z.string()),
    })
    .optional(),
  status: z
    .enum(["ok", "needs_input", "empty", "error"])
    .describe("Machine-readable status of the search result."),
  message: z
    .string()
    .describe("Human-readable Markdown summary returned to the user."),
  total: z
    .number()
    .int()
    .nonnegative()
    .describe("Number of decisions returned in this MCP response."),
  decisions: z
    .array(
      z.object({
        ada: z.string().describe("Diavgeia ADA identifier."),
        subject: z.string().describe("Decision subject/title."),
        issueDate: z.string().describe("Decision issue date, when available."),
        organization: z
          .string()
          .describe("Publishing organization name or UID, when available."),
        type: z.string().describe("Decision type name or identifier."),
        url: z.string().describe("URL to the decision document or page."),
      })
    )
    .describe("Structured list of decisions returned by the search."),
};
