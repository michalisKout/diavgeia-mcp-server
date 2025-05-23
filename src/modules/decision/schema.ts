import { z } from "zod";

export const decisionRawSchema = {
  ada: z
    .string()
    .nullable()
    .describe(
      "The ADA (unique identifier) of the government decision. This is a required parameter to retrieve detailed information about a specific decision."
    ),
};
