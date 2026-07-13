import type { ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { PDFDocument } from "pdf-lib";
// @ts-ignore
import pdf from "pdf-parse/lib/pdf-parse.js";
import { DiavgeiaApiClient } from "../../api/diavgeia.js";
import {
  createDecisionDetails,
  createDecisionError,
  createDecisionNotFound,
  createMissingAdaParameter,
} from "../../prompts/feedbackToLLM.js";
import { DECISION_PROMPT } from "../../prompts/template.js";
import { logger } from "../../utils/logger.js";
import { createResponse } from "../../utils/response.js";
import type { decisionRawSchema } from "./schema.js";

async function downloadPDF(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return await response.arrayBuffer();
}

export function createDecisionTool(
  apiClient: DiavgeiaApiClient
): ToolCallback<typeof decisionRawSchema> {
  return async ({ ada }) => {
    try {
      if (!ada) {
        const message = createMissingAdaParameter(DECISION_PROMPT);
        return createResponse(message, "text", {
          found: false,
          message,
          decision: null,
        });
      }

      const decision = await apiClient.getDecisionByAda(ada);

      if (!decision) {
        const message = createDecisionNotFound(DECISION_PROMPT, ada);
        return createResponse(message, "text", {
          found: false,
          message,
          decision: null,
        });
      }

      const details = [
        "# Decision Details",
        "",
        "## Basic Information",
        `- **ADA**: ${decision.ada || "N/A"}`,
        `- **Subject**: ${decision.subject || "N/A"}`,
        `- **Protocol Number**: ${decision.protocolNumber || "N/A"}`,
        `- **Issue Date**: ${decision.issueDate || "N/A"}`,
        `- **Status**: ${decision.status || "N/A"}`,
        "",
        "## Organization",
        `- **Name**: ${decision.organizationName || "N/A"}`,
        `- **ID**: ${decision.organizationId || "N/A"}`,
        "",
        "## Decision Type",
        `- **Type**: ${decision.decisionTypeName || "N/A"}`,
        `- **Code**: ${decision.decisionTypeId || "N/A"}`,
        "",
        "## Links",
        `- **Decision URL**: ${decision.url || "N/A"}`,
        `- **Document URL**: ${decision.documentUrl || "N/A"}`,
      ];

      if (decision.documentUrl) {
        try {
          logger.info(`Downloading PDF from: ${decision.documentUrl}`);
          const rawPdf = await downloadPDF(decision.documentUrl);
          const pdfFile = await PDFDocument.create();
          const pdfDoc = await PDFDocument.load(rawPdf);
          const copiedPages = await pdfFile.copyPages(
            pdfDoc,
            pdfDoc.getPageIndices()
          );
          copiedPages.forEach((page) => pdfFile.addPage(page));
          const buffer = Buffer.from(await pdfFile.save());

          // Suppress console warnings from pdf-parse
          const originalWarn = console.warn;
          const originalError = console.error;
          console.warn = () => {};
          console.error = () => {};

          const res = await pdf(buffer);

          // Restore console methods
          console.warn = originalWarn;
          console.error = originalError;

          if (res.text) {
            const excerpt = res.text.substring(0, 1000).trim();
            details.push("");
            details.push("## Document Content");
            details.push("**Excerpt** (first 1000 characters):");
            details.push("```");
            details.push(excerpt);
            details.push("```");
            logger.info("PDF content extracted successfully");
          }
        } catch (pdfError) {
          logger.warn(
            `Failed to extract PDF content: ${pdfError instanceof Error ? pdfError.message : "Unknown error"}`
          );
          details.push("");
          details.push("## Document Content");
          details.push("**Status**: Unable to extract PDF content");
        }
      }

      if (
        decision.signers &&
        Array.isArray(decision.signers) &&
        decision.signers.length > 0
      ) {
        details.push("");
        details.push("## Signers");
        decision.signers.forEach((signer, index) => {
          if (signer) {
            details.push(
              `${index + 1}. **${signer.name || "N/A"}** - ${signer.title || "N/A"} (${signer.position || "N/A"})`
            );
          }
        });
      }

      if (decision.extraFieldValues) {
        details.push("");
        details.push("## Additional Fields");
        Object.entries(decision.extraFieldValues).forEach(([key, value]) => {
          let stringValue = "";
          try {
            stringValue =
              typeof value === "string" ? value : JSON.stringify(value);
          } catch (e) {
            stringValue = "N/A";
          }
          details.push(`- **${key}**: ${stringValue}`);
        });
      }

      const message = createDecisionDetails(DECISION_PROMPT, details);
      return createResponse(message, "text", {
        found: true,
        message,
        decision: {
          ada: decision.ada || "N/A",
          subject: decision.subject || "N/A",
          protocolNumber: decision.protocolNumber || "N/A",
          issueDate: decision.issueDate || "N/A",
          status: decision.status || "N/A",
          organizationId: decision.organizationId || "N/A",
          organizationName: decision.organizationName || "N/A",
          decisionTypeId: decision.decisionTypeId || "N/A",
          decisionTypeName: decision.decisionTypeName || "N/A",
          url: decision.url || "N/A",
          documentUrl: decision.documentUrl || "N/A",
        },
      });
    } catch (error) {
      logger.error(`Error retrieving decision: ${error}`);
      const message = createDecisionError(
        error instanceof Error ? error.message : "Unknown error"
      );
      return createResponse(message, "text", {
        found: false,
        message,
        decision: null,
      });
    }
  };
}

export const decisionTool = createDecisionTool(new DiavgeiaApiClient());
