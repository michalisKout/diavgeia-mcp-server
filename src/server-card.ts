export const SMITHERY_CONFIG_SCHEMA = {
  type: "object",
  properties: {
    apiBaseUrl: {
      type: "string",
      description:
        "Base URL for the Diavgeia API. Can also be set with DIAVGEIA_API_BASE_URL or the legacy DIAVGEIA_URL environment variable.",
      default: "https://diavgeia.gov.gr/opendata",
      format: "uri",
      examples: ["https://diavgeia.gov.gr/opendata"],
    },
    defaultPageSize: {
      type: "number",
      description:
        "Default number of results per page for search queries. Can also be set with DIAVGEIA_DEFAULT_PAGE_SIZE.",
      default: 10,
      minimum: 1,
      maximum: 500,
    },
    maxOrganizations: {
      type: "number",
      description:
        "Maximum number of organizations to display in context. Can also be set with DIAVGEIA_MAX_ORGANIZATIONS.",
      default: 50,
      minimum: 10,
      maximum: 200,
    },
    defaultDateRange: {
      type: "string",
      description:
        "Default date range for searches when the user does not provide dates. Can also be set with DIAVGEIA_DEFAULT_DATE_RANGE.",
      default: "1year",
      enum: ["1month", "3months", "6months", "1year", "2years"],
    },
    language: {
      type: "string",
      description:
        "Preferred language for responses (Greek or English). Can also be set with DIAVGEIA_LANGUAGE.",
      default: "en",
      enum: ["el", "en"],
    },
    timeout: {
      type: "number",
      description:
        "Request timeout in milliseconds. Can also be set with DIAVGEIA_TIMEOUT.",
      default: 30000,
      minimum: 5000,
      maximum: 120000,
    },
    cacheEnabled: {
      type: "boolean",
      description:
        "Enable caching of organization data. Can also be set with DIAVGEIA_CACHE_ENABLED.",
      default: true,
      examples: [true, false],
    },
  },
  additionalProperties: false,
};

export const SMITHERY_SERVER_CARD = {
  serverInfo: {
    name: "diavgeia-mcp-server",
    version: "1.0.0",
  },
  authentication: {
    required: false,
  },
  configSchema: SMITHERY_CONFIG_SCHEMA,
  tools: [
    {
      name: "search-decisions",
      description:
        "Search for government decisions in the Diavgeia transparency platform by keywords, subject, organization, unit, thematic category, decision type, dates, and advanced Diavgeia query expressions.",
      inputSchema: {
        type: "object",
        properties: {
          q: {
            type: ["string", "number", "null"],
            description: "Free text search query.",
          },
          rawQuery: {
            type: ["string", "number", "null"],
            description:
              'Raw Diavgeia advanced query expression, e.g. thematicCategory:"ΑΠΑΣΧΟΛΗΣΗ ΚΑΙ ΕΡΓΑΣΙΑ" or q:"ΠΕ60".',
          },
          subject: {
            type: ["string", "number", "null"],
            description:
              'Exact or phrase subject filter. Maps to fq=subject:"...".',
          },
          ministryIdOrName: {
            type: ["string", "number", "null"],
            description: "Organization ID or name.",
          },
          organizationUid: {
            type: ["string", "number", "null"],
            description:
              'Exact Diavgeia organization UID. Maps to fq=organizationUid:"...".',
          },
          unitUid: {
            type: ["string", "number", "null"],
            description: 'Exact Diavgeia unit UID. Maps to fq=unitUid:"...".',
          },
          type: {
            type: ["string", "number", "null"],
            description: "Decision type identifier or label.",
          },
          decisionType: {
            type: ["string", "number", "null"],
            description:
              'Exact decision type label. Maps to q=decisionType:"..." or fq=decisionType:"..." in advanced searches.',
          },
          decisionTypes: {
            type: ["array", "null"],
            items: {
              type: ["string", "number"],
            },
            description:
              'Multiple decision type labels. Maps to fq=decisionType:["...", "..."].',
          },
          thematicCategory: {
            type: ["string", "number", "null"],
            description:
              'Exact thematic category label. Maps to query=thematicCategory:"...".',
          },
          from_date: {
            type: ["string", "number", "null"],
            description: "Start date in YYYY-MM-DD format.",
          },
          to_date: {
            type: ["string", "number", "null"],
            description: "End date in YYYY-MM-DD format.",
          },
          page: {
            type: ["string", "number"],
            description: "Page number for pagination, starting from 0.",
          },
          size: {
            type: ["string", "number"],
            description: "Results per page, maximum 500.",
          },
        },
      },
    },
    {
      name: "get-decision",
      description:
        "Retrieve detailed information about a specific government decision using its ADA identifier.",
      inputSchema: {
        type: "object",
        properties: {
          ada: {
            type: "string",
            description: "Unique Diavgeia decision identifier (ADA).",
          },
        },
        required: ["ada"],
      },
    },
  ],
  resources: [
    {
      uri: "https://diavgeia.gov.gr/api/help",
      name: "Diavgeia API Documentation",
      description:
        "Official Diavgeia API documentation including endpoints, parameters, and usage examples",
      mimeType: "text/html",
    },
  ],
  prompts: [
    {
      name: "diavgeia-search-examples",
      description:
        "Example queries and best practices for searching Diavgeia decisions effectively",
    },
  ],
};
