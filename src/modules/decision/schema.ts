import { z } from "zod";

export const documentEvidenceSchema = z.object({
  contractVersion: z.literal(1),
  ada: z.string(),
  fetchedAt: z.string().datetime(),
  version: z.string().nullable(),
  checksum: z.string().nullable(),
  publicationStatus: z.string(),
  extraction: z.object({
    state: z.enum([
      "native",
      "partial",
      "ocr_needed",
      "missing",
      "unsupported",
      "failed",
    ]),
    totalPages: z.number().int().min(1).max(200).nullable(),
    extractedPages: z.array(z.number().int().min(1).max(200)),
    unreadablePages: z.array(z.number().int().min(1).max(200)),
    searchedPages: z.array(z.number().int().min(1).max(200)),
    limitations: z.array(z.string()),
  }),
  excerpts: z
    .array(
      z.object({
        id: z.string(),
        page: z.number().int().min(1).max(200),
        text: z.string().max(1200),
      })
    )
    .max(6),
});
export const decisionRawSchema = {
  query: z
    .string()
    .max(500)
    .optional()
    .describe("Optional relevance query; all readable pages are searched."),
  maxExcerpts: z.number().int().min(1).max(6).optional(),
  ada: z
    .string()
    .nullable()
    .describe(
      "The ADA (unique identifier) of the government decision. This is a required parameter to retrieve detailed information about a specific decision."
    ),
};

export const decisionOutputRawSchema = {
  evidence: documentEvidenceSchema.optional(),
  errorCode: z.string().optional(),
  found: z
    .boolean()
    .describe("Whether a decision was found for the requested ADA."),
  message: z
    .string()
    .describe("Human-readable Markdown summary returned to the user."),
  decision: z
    .object({
      ada: z.string().describe("Diavgeia ADA identifier."),
      subject: z.string().describe("Decision subject/title."),
      protocolNumber: z.string().describe("Protocol number, when available."),
      issueDate: z.string().describe("Decision issue date, when available."),
      status: z.string().describe("Decision publication status."),
      organizationId: z.string().describe("Publishing organization UID."),
      organizationName: z.string().describe("Publishing organization name."),
      decisionTypeId: z.string().describe("Decision type UID/code."),
      decisionTypeName: z.string().describe("Decision type name."),
      url: z.string().describe("Canonical decision page URL."),
      documentUrl: z.string().describe("Decision document URL."),
    })
    .nullable()
    .describe("Structured decision details, or null when not found."),
};
