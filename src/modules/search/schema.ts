import dayjs from "dayjs";
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
  ministryIdOrName: z
    .union([z.string(), z.number()])
    .nullable()
    .optional()
    .transform((val) => val?.toString()?.trim())
    .describe(
      "Organization ID or name - will be automatically detected from ministry name if not provided. Use organization context to find valid IDs."
    ),
  type: z
    .union([z.string(), z.number()])
    .nullable()
    .optional()
    .transform((val) => val?.toString())
    .describe(
      "Decision type identifier (e.g., 'Β.1.1' for appointments, 'Β.2.1' for budgets)"
    ),
  from_date: z
    .string()
    .nullable()
    .optional()
    .default(dayjs().subtract(1, "year").format("YYYY-MM-DD"))
    .transform((val) => val?.trim())
    .describe(
      "Start date in YYYY-MM-DD format. Accepts natural language dates like 'last year', 'this year', 'January 2024' and converts them to ISO 8601 format for searching Diavgeia decisions."
    ),
  to_date: z
    .string()
    .nullable()
    .optional()
    .default(dayjs().format("YYYY-MM-DD"))
    .transform((val) => val?.trim())
    .describe(
      "End date in YYYY-MM-DD format. Accepts natural language dates like 'today', 'December 2024' and converts them to ISO 8601 format for searching Diavgeia decisions."
    ),
  page: z
    .union([z.string(), z.number()])
    .transform((val) => {
      const convertedVal = Number(val);
      if (Number.isNaN(convertedVal) || convertedVal < 0) return 0;
      return convertedVal;
    })
    .default(0)
    .describe("Page number for pagination (starts from 0, default: 0)"),
  size: z
    .union([z.string(), z.number()])
    .transform((val) => {
      const convertedVal = Number(val);
      if (Number.isNaN(convertedVal) || convertedVal < 0 || convertedVal > 500)
        return 10;
      return convertedVal;
    })
    .default(10)
    .describe("Results per page (minimum: 1, maximum: 500, default: 10)"),
};

export const searchSchema = z.object(searchRawSchema);

export type DiavgeiaSearchParams = z.infer<typeof searchSchema>;
