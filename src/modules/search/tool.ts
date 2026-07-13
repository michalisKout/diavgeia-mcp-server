import type { ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import dayjs from "dayjs";
import { DiavgeiaApiClient } from "../../api/diavgeia.js";
import {
  DEFAULT_CONFIG,
  type ResolvedDiavgeiaConfig,
  resolveDefaultDateRange,
} from "../../config.js";
import {
  MISSING_Q_PARAMETER,
  createDetectedOrganizationsInfo,
  createErrorMessage,
  createMissingMinistryParameter,
  createNoResultsFound,
  createSearchResults,
} from "../../prompts/feedbackToLLM.js";
import { SEARCH_PROMPT } from "../../prompts/template.js";
import type {
  DiavgeiaDecision,
  DiavgeiaSearchResponse,
  Organization,
} from "../../types/diavgeia.js";
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
  return async ({
    q,
    ministryIdOrName,
    type,
    from_date,
    to_date,
    page,
    size,
  }) => {
    try {
      if (!q) {
        return createResponse(MISSING_Q_PARAMETER);
      }

      if (!ministryIdOrName) {
        const organizationsContext =
          await orgContext.generateOrganizationContext();

        return createResponse(
          createMissingMinistryParameter(organizationsContext)
        );
      }

      if (!from_date && !to_date) {
        const dateRange = resolveDefaultDateRange(config.defaultDateRange);
        from_date = dateRange.from;
        to_date = dateRange.to;
      }

      let detectedMinistries: Organization[] = [];
      if (q && ministryIdOrName && typeof ministryIdOrName === "string") {
        detectedMinistries = await orgContext.detectMinistryInQuery(
          ministryIdOrName || q
        );
      }

      const safeSize = Math.min(
        Math.max(size ?? config.defaultPageSize, 1),
        500
      );

      const searchParams: DiavgeiaSearchParams = {
        q: q || undefined,
        ministryIdOrName: ministryIdOrName || undefined,
        type: type || undefined,
        from_date: from_date || undefined,
        to_date: to_date || undefined,
        page: page ?? 0,
        size: safeSize,
      };
      const baseSearchPromise = apiClient.searchDecisions(searchParams);

      const ministrySearchPromises: Promise<DiavgeiaSearchResponse>[] = [];
      if (detectedMinistries.length > 0) {
        const topMinistries = detectedMinistries.slice(0, 3);

        for (const ministry of topMinistries) {
          const ministrySearchParams: DiavgeiaSearchParams = {
            ...searchParams,
            ministryIdOrName: ministry.uid,
            size: Math.min(
              Math.max(Math.floor(safeSize / topMinistries.length), 1),
              10
            ),
          };
          ministrySearchPromises.push(
            apiClient.searchDecisions(ministrySearchParams)
          );
        }
      }

      const isOrgRelatedSearch =
        !ministryIdOrName &&
        (q?.toLowerCase().includes("υπουργείο") ||
          q?.toLowerCase().includes("οργανισμό") ||
          q?.toLowerCase().includes("δήμο") ||
          q?.toLowerCase().includes("φορέα") ||
          detectedMinistries.length > 0);

      const orgContextPromise = isOrgRelatedSearch
        ? orgContext.generateOrganizationContext()
        : Promise.resolve("");

      const [baseResponse, ...ministryResponses] = await Promise.all([
        baseSearchPromise,
        ...ministrySearchPromises,
        orgContextPromise,
      ]);

      const organizationsContext = await orgContextPromise;

      let allDecisions: DiavgeiaDecision[] = [
        ...(baseResponse.decisions || []),
      ];

      const seenDecisions = new Set(allDecisions.map((d) => d.ada));

      ministryResponses.forEach((response) => {
        if (typeof response !== "string" && response?.decisions) {
          response.decisions.forEach((decision) => {
            if (!seenDecisions.has(decision.ada)) {
              allDecisions.push(decision);
              seenDecisions.add(decision.ada);
            }
          });
        }
      });

      allDecisions.sort((a, b) => {
        const dateA = dayjs(a.issueDate).valueOf();
        const dateB = dayjs(b.issueDate).valueOf();
        return dateB - dateA;
      });

      allDecisions = allDecisions.slice(0, safeSize);

      if (allDecisions.length === 0) {
        return createResponse(
          createNoResultsFound(
            SEARCH_PROMPT,
            isOrgRelatedSearch,
            organizationsContext
          )
        );
      }

      const formattedDecisions = allDecisions.map((decision) => ({
        ada: decision.ada || "N/A",
        subject: decision.subject || "N/A",
        issue_date: decision.issueDate || "N/A",
        organization:
          decision.organizationName || decision.organizationId || "N/A",
        type: decision.decisionTypeName || decision.decisionTypeId || "N/A",
        url: decision.documentUrl || "#",
      }));

      let ministryInfo = "";
      if (detectedMinistries.length > 0 && !ministryIdOrName) {
        ministryInfo = createDetectedOrganizationsInfo(
          detectedMinistries.map((m) => m.label)
        );
      }

      const resultText = createSearchResults(
        allDecisions.length,
        ministryInfo,
        formattedDecisions,
        isOrgRelatedSearch,
        organizationsContext
      );

      return createResponse(resultText);
    } catch (error) {
      logger.error(`Error searching decisions: ${error}`);
      return createResponse(createErrorMessage((error as Error).message));
    }
  };
}

const defaultApiClient = new DiavgeiaApiClient();

export const searchDecisionsTool = createSearchDecisionsTool({
  apiClient: defaultApiClient,
  orgContext: OrganizationContext.getInstance(),
  config: DEFAULT_CONFIG,
});
