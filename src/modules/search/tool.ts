import type { ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import dayjs from "dayjs";
import { DiavgeiaApiClient } from "../../api/diavgeia.js";
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

const apiClient = new DiavgeiaApiClient();
const orgContext = OrganizationContext.getInstance();

export const searchDecisionsTool: ToolCallback<
  typeof searchRawSchema
> = async ({ q, ministryIdOrName, type, from_date, to_date, page, size }) => {
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
      from_date = dayjs().subtract(1, "month").format("YYYY-MM-DD");
      to_date = dayjs().format("YYYY-MM-DD");
    }

    let detectedMinistries: Organization[] = [];
    if (q && ministryIdOrName && typeof ministryIdOrName === "string") {
      detectedMinistries = await orgContext.detectMinistryInQuery(
        ministryIdOrName || q
      );
    }

    const searchParams: DiavgeiaSearchParams = {
      q: q || undefined,
      ministryIdOrName: ministryIdOrName || undefined,
      type: type || undefined,
      from_date: from_date || undefined,
      to_date: to_date || undefined,
      page: page ?? 0,
      size: size ?? 10,
    };
    const baseSearchPromise = apiClient.searchDecisions(searchParams);

    const ministrySearchPromises: Promise<DiavgeiaSearchResponse>[] = [];
    if (detectedMinistries.length > 0) {
      const topMinistries = detectedMinistries.slice(0, 3);

      for (const ministry of topMinistries) {
        const ministrySearchParams: DiavgeiaSearchParams = {
          ...searchParams,
          ministryIdOrName: ministry.uid,
          size: Math.min((size ?? 10) / topMinistries.length, 10),
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

    let allDecisions: DiavgeiaDecision[] = [...(baseResponse.decisions || [])];
    let totalCount = baseResponse.total || 0;

    const seenDecisions = new Set(allDecisions.map((d) => d.ada));

    ministryResponses.forEach((response) => {
      if (typeof response !== "string" && response?.decisions) {
        response.decisions.forEach((decision) => {
          if (!seenDecisions.has(decision.ada)) {
            allDecisions.push(decision);
            seenDecisions.add(decision.ada);
          }
        });
        totalCount += response.total || 0;
      }
    });

    allDecisions.sort((a, b) => {
      const dateA = dayjs(a.issueDate).valueOf();
      const dateB = dayjs(b.issueDate).valueOf();
      return dateB - dateA; // desc
    });

    allDecisions = allDecisions.slice(0, size ? +size : 10);

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
