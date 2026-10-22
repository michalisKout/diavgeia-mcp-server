import type { ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DiavgeiaApiClient } from "../../api/diavgeia.js";
import { resolveDocumentLimits } from "../../config.js";
import { operationScope } from "../../platform/pdf-extractor.js";
import {
  createDecisionDetails,
  createDecisionError,
  createDecisionNotFound,
  createMissingAdaParameter,
} from "../../prompts/feedbackToLLM.js";
import { DECISION_PROMPT } from "../../prompts/template.js";
import { logger } from "../../utils/logger.js";
import { createResponse } from "../../utils/response.js";
import {
  type DecisionEvidenceDependencies,
  type DecisionEvidenceService,
  createDecisionEvidenceService,
} from "./evidence.js";
import type { decisionRawSchema } from "./schema.js";

export function createDecisionTool(
  apiClient: DiavgeiaApiClient,
  options: Partial<Omit<DecisionEvidenceDependencies, "apiClient">> & {
    evidenceService?: DecisionEvidenceService;
  } = {}
): ToolCallback<typeof decisionRawSchema> {
  const limits = resolveDocumentLimits(options.limits);
  const evidenceService =
    options.evidenceService ??
    createDecisionEvidenceService({ apiClient, ...options });
  return async ({ ada, query, maxExcerpts }, extra) => {
    const scope = operationScope(
      {
        signal: extra?.signal ?? new AbortController().signal,
        deadlineAt: Date.now() + limits.deadlineMs,
      },
      limits.deadlineMs
    );
    try {
      if (!ada) {
        const message = createMissingAdaParameter(DECISION_PROMPT);
        return createResponse(message, "text", {
          found: false,
          message,
          decision: null,
        });
      }

      const decision = await apiClient.getDecisionByAda(ada, scope);

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

      const evidence = await evidenceService.evidenceForDecision(
        { ada, query, maxExcerpts },
        decision,
        scope
      );
      details.push(
        "",
        "## Document Content",
        `**Extraction**: ${evidence.extraction.state}`
      );
      for (const excerpt of evidence.excerpts)
        details.push(`**Page ${excerpt.page}**`, excerpt.text);
      for (const limitation of evidence.extraction.limitations)
        details.push(`**Limitation**: ${limitation}`);

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
        evidence,
        ...(evidence.extraction.state === "failed" ||
        evidence.extraction.state === "unsupported"
          ? {
              errorCode: scope.signal.aborted
                ? Date.now() >= scope.deadlineAt
                  ? "DEADLINE_EXCEEDED"
                  : "ABORTED"
                : (evidenceService.errorCodeFor(evidence) ?? "DOCUMENT_FAILED"),
            }
          : {}),
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
        errorCode: scope.signal.aborted
          ? Date.now() >= scope.deadlineAt
            ? "DEADLINE_EXCEEDED"
            : "ABORTED"
          : "UPSTREAM_ERROR",
      });
    } finally {
      scope.dispose();
    }
  };
}

export const decisionTool = createDecisionTool(new DiavgeiaApiClient());
