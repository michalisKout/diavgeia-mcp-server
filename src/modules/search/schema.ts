import { z } from "zod";

export const searchRawSchema = {
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
      'Raw Diavgeia advanced query expression. Maps directly to query=..., e.g. thematicCategory:"ΑΠΑΣΧΟΛΗΣΗ ΚΑΙ ΕΡΓΑΣΙΑ" or q:"ΠΕ60".'
    ),
  subject: z
    .union([z.string(), z.number()])
    .nullable()
    .optional()
    .transform((val) => val?.toString()?.trim())
    .describe(
      'Exact or phrase subject filter. Maps to Diavgeia fq=subject:"..." for precise searches.'
    ),
  ministryIdOrName: z
    .union([z.string(), z.number()])
    .nullable()
    .optional()
    .transform((val) => val?.toString()?.trim())
    .describe(
      "Organization ID or name - will be automatically detected from ministry name if not provided. Use organization context to find valid IDs."
    ),
  organizationUid: z
    .union([z.string(), z.number()])
    .nullable()
    .optional()
    .transform((val) => val?.toString()?.trim())
    .describe(
      'Exact Diavgeia organization UID. Maps to Diavgeia fq=organizationUid:"...".'
    ),
  unitUid: z
    .union([z.string(), z.number()])
    .nullable()
    .optional()
    .transform((val) => val?.toString()?.trim())
    .describe('Exact Diavgeia unit UID. Maps to Diavgeia fq=unitUid:"...".'),
  type: z
    .union([z.string(), z.number()])
    .nullable()
    .optional()
    .transform((val) => val?.toString())
    .describe(
      "Decision type identifier (e.g., 'Β.1.1' for appointments, 'Β.2.1' for budgets)"
    ),
  decisionType: z
    .union([z.string(), z.number()])
    .nullable()
    .optional()
    .transform((val) => val?.toString()?.trim())
    .describe(
      'Exact Diavgeia decision type label or query expression. Maps to q=decisionType:"...".'
    ),
  decisionTypes: z
    .array(z.union([z.string(), z.number()]))
    .nullable()
    .optional()
    .transform((val) =>
      val
        ?.map((item) => item.toString())
        .filter((item) => item.trim().length > 0)
    )
    .describe(
      'Multiple Diavgeia decision type labels. Maps to fq=decisionType:["...", "..."].'
    ),
  thematicCategory: z
    .union([z.string(), z.number()])
    .nullable()
    .optional()
    .transform((val) => val?.toString()?.trim())
    .describe(
      'Exact thematic category label. Maps to Diavgeia query=thematicCategory:"...".'
    ),
  from_date: z
    .union([z.string(), z.number()])
    .nullable()
    .optional()
    .transform((val) => {
      if (val === null || val === undefined) return undefined;
      const stringValue = val.toString().trim();
      return stringValue.length > 0 ? stringValue : undefined;
    })
    .describe(
      "Start date in YYYY-MM-DD format. Accepts natural language dates like 'last year', 'this year', 'January 2024' and converts them to ISO 8601 format for searching Diavgeia decisions."
    ),
  to_date: z
    .union([z.string(), z.number()])
    .nullable()
    .optional()
    .transform((val) => {
      if (val === null || val === undefined) return undefined;
      const stringValue = val.toString().trim();
      return stringValue.length > 0 ? stringValue : undefined;
    })
    .describe(
      "End date in YYYY-MM-DD format. Accepts natural language dates like 'today', 'December 2024' and converts them to ISO 8601 format for searching Diavgeia decisions."
    ),
  page: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => {
      if (val === undefined || val === null || `${val}`.trim() === "")
        return undefined;
      const convertedVal = Number(val);
      if (Number.isNaN(convertedVal) || convertedVal < 0) return 0;
      return Math.floor(convertedVal);
    })
    .describe("Page number for pagination (starts from 0, default: 0)"),
  size: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => {
      if (val === undefined || val === null || `${val}`.trim() === "")
        return undefined;
      const convertedVal = Number(val);
      if (Number.isNaN(convertedVal) || convertedVal < 1) return undefined;
      if (convertedVal > 500) return 500;
      return Math.floor(convertedVal);
    })
    .describe("Results per page (minimum: 1, maximum: 500, default: 10)"),
};

export const searchSchema = z.object(searchRawSchema);

export type DiavgeiaSearchParams = z.infer<typeof searchSchema>;

export const searchOutputRawSchema = {
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
