export const MISSING_Q_PARAMETER = `# Missing Parameter

**Parameter**: "q" (search query)

**Action Required**:
- Provide a search query value for the "q" parameter
- To enable automatic ministry detection, omit both "ministryIdOrName" and date parameters`;

export const createMissingMinistryParameter = (
  organizationsContext: string
) => `# Missing Parameter

**Parameter**: "ministryIdOrName"

## Option 1: Automatic Detection
Retry the search without "ministryIdOrName" and date parameters to automatically detect relevant organizations from the query.

## Option 2: Manual Selection
Select an organization from the list below:

${organizationsContext}`;

export const createNoResultsFound = (
  searchPrompt: string,
  isOrgRelatedSearch: boolean,
  organizationsContext: string
) => {
  const base = `# Search Result

**Status**: No decisions found

**Action Required**: Re-evaluate search criteria and extract relevant parameters according to the Diavgeia API requirements.

${searchPrompt}`;

  const orgContext = isOrgRelatedSearch
    ? `\n\n## Relevant Organizations\n${organizationsContext}`
    : "";

  return `${base}${orgContext}`;
};

export const createDetectedOrganizationsInfo = (ministries: string[]) =>
  `\n**Detected Organizations**: ${ministries.join(", ")}
**Note**: Results include decisions from all detected organizations listed above.\n\n`;

export const createSearchResults = (
  count: number,
  ministryInfo: string,
  formattedDecisions: Array<{
    ada: string;
    subject: string;
    issue_date: string;
    organization: string;
    type: string;
    url: string;
  }>,
  isOrgRelatedSearch: boolean,
  organizationsContext: string
) => {
  const header = `# Search Results\n\n**Total**: ${count} decision${count !== 1 ? "s" : ""} found${ministryInfo}\n`;

  const results = formattedDecisions
    .map(
      (d, index) =>
        `## Decision ${index + 1}
- **ADA**: ${d.ada}
- **Subject**: ${d.subject}
- **Date**: ${d.issue_date}
- **Organization**: ${d.organization}
- **Type**: ${d.type}
- **URL**: ${d.url}`
    )
    .join("\n\n");

  const footer = isOrgRelatedSearch
    ? `\n\n---\n\n## Relevant Organizations\n${organizationsContext}`
    : "";

  return `${header}${results}${footer}`;
};

export const createErrorMessage = (errorMessage: string) =>
  `# Error

**Status**: Search operation failed

**Details**: ${errorMessage}

**Action Required**: Review the error message and adjust search parameters accordingly.`;

// Decision-related prompts
export const createMissingAdaParameter = (decisionPrompt: string) =>
  `${decisionPrompt}

# Missing Parameter

**Parameter**: "ada" (decision identifier)

**Action Required**: Provide a valid ADA (unique decision identifier).`;

export const createDecisionNotFound = (decisionPrompt: string, ada: string) =>
  `${decisionPrompt}

# Decision Not Found

**ADA**: ${ada}

**Status**: No decision found with the specified ADA.

**Action Required**: Verify the ADA and try again.`;

export const createDecisionError = (errorMessage: string) =>
  `# Error

**Status**: Failed to retrieve decision

**Details**: ${errorMessage}

**Action Required**: Review the error message and verify the ADA is correct.`;

export const createDecisionDetails = (
  decisionPrompt: string,
  details: string[]
) => `${decisionPrompt}

${details.join("\n")}`;

// Organization context prompts
export const NO_ORGANIZATION_DATA = `ORGANIZATION DATA: No organizations available

NOTE: Unable to retrieve organization data at this time.`;

export const createOrganizationContext = (
  topOrgs: Array<{ label: string; uid: string; status?: string }>,
  totalCount: number
) => {
  const contextParts = [
    "AVAILABLE ORGANIZATIONS",
    "The following organizations can be used to refine your search:\n",
  ];

  topOrgs.forEach((org) => {
    const statusNote = org.status !== "ACTIVE" ? " [INACTIVE]" : "";
    contextParts.push(`- ${org.label} (ID: ${org.uid})${statusNote}`);
  });

  contextParts.push(
    "",
    `SUMMARY: Displaying ${topOrgs.length} of ${totalCount} total organizations.`,
    "",
    "TIP: Include the organization ID in search queries for more accurate results."
  );

  return contextParts.join("\n");
};

export const NO_ORGANIZATIONS_FOUND = `ORGANIZATION DATA: No organizations match the request

ACTION REQUIRED: Try broadening your search criteria or verify the organization name.`;
