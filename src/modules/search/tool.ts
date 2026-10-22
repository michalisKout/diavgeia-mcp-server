import type { ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import dayjs from "dayjs";
import { DiavgeiaApiClient } from "../../api/diavgeia.js";
import { SearchError } from "../../api/search-request.js";
import {
  DEFAULT_CONFIG,
  type ResolvedDiavgeiaConfig,
  resolveDefaultDateRange,
} from "../../config.js";
import { operationScope } from "../../platform/pdf-extractor.js";
import {
  MISSING_Q_PARAMETER,
  createErrorMessage,
  createMissingMinistryParameter,
  createNoResultsFound,
  createSearchResults,
} from "../../prompts/feedbackToLLM.js";
import { SEARCH_PROMPT } from "../../prompts/template.js";
import { OrganizationContext } from "../../utils/context.js";
import { logger } from "../../utils/logger.js";
import { createResponse } from "../../utils/response.js";
import type { DiavgeiaSearchParams, searchRawSchema } from "./schema.js";

interface SearchToolDeps {
  apiClient: DiavgeiaApiClient;
  orgContext: OrganizationContext;
  config: ResolvedDiavgeiaConfig;
}

export function createSearchDecisionsTool({
  apiClient,
  orgContext,
  config,
}: SearchToolDeps): ToolCallback<typeof searchRawSchema> {
  return async (
    {
      org,
      q,
      rawQuery,
      subject,
      ministryIdOrName,
      organizationUid,
      unitUid,
      type,
      decisionType,
      decisionTypes,
      thematicCategory,
      from_date,
      to_date,
      page,
      size,
    },
    extra
  ) => {
    const scope = operationScope(
      {
        signal: extra?.signal ?? new AbortController().signal,
        deadlineAt: Date.now() + 30_000,
      },
      30_000
    );
    try {
      if (
        !q &&
        !rawQuery &&
        !subject &&
        !type &&
        !decisionType &&
        !decisionTypes?.length &&
        !thematicCategory
      ) {
        return createResponse(MISSING_Q_PARAMETER, "text", {
          status: "needs_input",
          message: MISSING_Q_PARAMETER,
          total: 0,
          decisions: [],
        });
      }

      const organizationFilter = organizationUid || ministryIdOrName || org;

      if (!organizationFilter) {
        const organizationsContext =
          await orgContext.generateOrganizationContext(scope);

        const message = createMissingMinistryParameter(organizationsContext);
        return createResponse(message, "text", {
          status: "needs_input",
          message,
          total: 0,
          decisions: [],
        });
      }

      if (
        !from_date &&
        !to_date &&
        !subject &&
        !type &&
        !decisionType &&
        !decisionTypes?.length &&
        !rawQuery &&
        !thematicCategory
      ) {
        const dateRange = resolveDefaultDateRange(config.defaultDateRange);
        from_date = dateRange.from;
        to_date = dateRange.to;
      }

      const safeSize = size ?? config.defaultPageSize;
      const searchParams: DiavgeiaSearchParams = {
        org,
        q,
        rawQuery,
        subject,
        ministryIdOrName,
        organizationUid,
        unitUid,
        type,
        decisionType,
        decisionTypes,
        thematicCategory,
        from_date,
        to_date,
        page: page ?? 0,
        size: safeSize,
      };
      const baseResponse = await apiClient.searchDecisions(searchParams, scope);
      const allDecisions = baseResponse.decisions.sort(
        (a, b) => dayjs(b.issueDate).valueOf() - dayjs(a.issueDate).valueOf()
      );
      const isOrgRelatedSearch = false;
      const organizationsContext = "";
      if (allDecisions.length === 0) {
        const message = createNoResultsFound(
          SEARCH_PROMPT,
          isOrgRelatedSearch,
          organizationsContext
        );
        return createResponse(message, "text", {
          status: "empty",
          coverage: baseResponse.coverage,
          message,
          total: 0,
          decisions: [],
        });
      }

      const structuredDecisions = allDecisions.map((decision) => ({
        ada: decision.ada || "N/A",
        subject: decision.subject || "N/A",
        issueDate: decision.issueDate || "N/A",
        organization:
          decision.organizationName || decision.organizationId || "N/A",
        type: decision.decisionTypeName || decision.decisionTypeId || "N/A",
        url: decision.documentUrl || "#",
      }));
      const formattedDecisions = structuredDecisions.map((decision) => ({
        ...decision,
        issue_date: decision.issueDate,
      }));

      const ministryInfo = "";

      const resultText = createSearchResults(
        allDecisions.length,
        ministryInfo,
        formattedDecisions,
        isOrgRelatedSearch,
        organizationsContext
      );

      return createResponse(resultText, "text", {
        status: "ok",
        coverage: baseResponse.coverage,
        message: resultText,
        total: allDecisions.length,
        decisions: structuredDecisions,
      });
    } catch (error) {
      if (!(error instanceof SearchError && error.code === "INVALID_INPUT"))
        logger.error(`Error searching decisions: ${error}`);
      const message = createErrorMessage((error as Error).message);
      return createResponse(message, "text", {
        status:
          error instanceof SearchError && error.code === "INVALID_INPUT"
            ? "needs_input"
            : "error",
        errorCode: error instanceof SearchError ? error.code : "SEARCH_FAILED",
        message,
        total: 0,
        decisions: [],
      });
    } finally {
      scope.dispose();
    }
  };
}

const defaultApiClient = new DiavgeiaApiClient();

export const searchDecisionsTool = createSearchDecisionsTool({
  apiClient: defaultApiClient,
  orgContext: OrganizationContext.getInstance(),
  config: DEFAULT_CONFIG,
});
