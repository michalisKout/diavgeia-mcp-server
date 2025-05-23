import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  GET_DECISIONS_TOOL_DESCRIPTION,
  GET_DECISIONS_TOOL_NAME,
} from "./modules/decision/constants.js";
import { decisionRawSchema } from "./modules/decision/schema.js";
import { decisionTool } from "./modules/decision/tool.js";
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
import { searchDecisionsTool } from "./modules/search/tool.js";
import { BASE_PROMPT_EN } from "./prompts/template.js";

export class DiavgeiaMCPServer {
  server: McpServer;

  constructor() {
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

  async init() {
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
      decisionTool
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
      searchDecisionsTool
    );

    this.server.resource(
      DIAVGEIA_API_RESOURCE.uri,
      DIAVGEIA_API_RESOURCE.description,
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
