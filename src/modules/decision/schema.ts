import { z } from "zod";

export const decisionRawSchema = {
  ada: z
    .string()
    .nullable()
    .describe(
      "The ADA (unique identifier) of the government decision. This is a required parameter to retrieve detailed information about a specific decision."
    ),
};

export const decisionOutputRawSchema = {
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
