import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DiavgeiaApiClient } from "./api/diavgeia.js";
import {
  type DiavgeiaConfigOverrides,
  type ResolvedDiavgeiaConfig,
  loadConfig,
} from "./config.js";
import {
  GET_DECISIONS_TOOL_DESCRIPTION,
  GET_DECISIONS_TOOL_NAME,
} from "./modules/decision/constants.js";
import { decisionRawSchema } from "./modules/decision/schema.js";
import { createDecisionTool } from "./modules/decision/tool.js";
import {
  SEARCH_EXAMPLES_PROMPT,
  getSearchExamplesPrompt,
} from "./modules/prompts/search-examples.js";
import {
  DIAVGEIA_API_RESOURCE,
  getApiDocumentation,
} from "./modules/resources/api-documentation.js";
import {
  SEARCH_DECISIONS_TOOL_DESCRIPTION,
  SEARCH_DECISIONS_TOOL_NAME,
} from "./modules/search/constants.js";
import { searchRawSchema } from "./modules/search/schema.js";
import { createSearchDecisionsTool } from "./modules/search/tool.js";
import { BASE_PROMPT_EN } from "./prompts/template.js";
import { OrganizationContext } from "./utils/context.js";

export class DiavgeiaMCPServer {
  server: McpServer;
  private config: ResolvedDiavgeiaConfig;

  constructor(configOverrides?: DiavgeiaConfigOverrides) {
    this.config = loadConfig(configOverrides);
    this.server = new McpServer({
      name: "diavgeia-mcp-server",
      version: "1.0.0",
      capabilities: {
        resources: {},
        tools: {},
        prompts: {},
      },
      server: {
        keepAlive: true,
        timeout: 120000,
      },
      systemPrompt: BASE_PROMPT_EN,
    });
  }

  async init(configOverrides?: DiavgeiaConfigOverrides) {
    if (configOverrides) {
      this.config = loadConfig(configOverrides);
    }

    const apiClient = new DiavgeiaApiClient({
      baseUrl: this.config.apiBaseUrl,
      timeout: this.config.timeout,
    });
    const orgContext = new OrganizationContext(apiClient, {
      cacheEnabled: this.config.cacheEnabled,
      maxOrganizations: this.config.maxOrganizations,
    });

    // Register tools with annotations for better MCP quality score
    this.server.registerTool(
      GET_DECISIONS_TOOL_NAME,
      {
        description: GET_DECISIONS_TOOL_DESCRIPTION,
        inputSchema: decisionRawSchema,
        annotations: {
          readOnlyHint: true,
          idempotentHint: true,
          destructiveHint: false,
        },
      },
      createDecisionTool(apiClient)
    );

    this.server.registerTool(
      SEARCH_DECISIONS_TOOL_NAME,
      {
        description: SEARCH_DECISIONS_TOOL_DESCRIPTION,
        inputSchema: searchRawSchema,
        annotations: {
          readOnlyHint: true,
          idempotentHint: true,
          destructiveHint: false,
        },
      },
      createSearchDecisionsTool({
        apiClient,
        orgContext,
        config: this.config,
      })
    );

    this.server.resource(
      DIAVGEIA_API_RESOURCE.name,
      DIAVGEIA_API_RESOURCE.uri,
      {
        description: DIAVGEIA_API_RESOURCE.description,
        mimeType: DIAVGEIA_API_RESOURCE.mimeType,
      },
      async () => ({
        contents: [
          {
            uri: DIAVGEIA_API_RESOURCE.uri,
            mimeType: DIAVGEIA_API_RESOURCE.mimeType,
            text: getApiDocumentation(),
          },
        ],
      })
    );

    this.server.prompt(
      SEARCH_EXAMPLES_PROMPT.name,
      SEARCH_EXAMPLES_PROMPT.description,
      async () => ({
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: getSearchExamplesPrompt(),
            },
          },
        ],
      })
    );
  }
}
