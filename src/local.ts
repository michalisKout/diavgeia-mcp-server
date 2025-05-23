#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { DiavgeiaMCPServer } from "./mcp-server.js";
import { logger } from "./utils/logger.js";

async function main() {
  try {
    const transport = new StdioServerTransport();
    const serverInstance = new DiavgeiaMCPServer();
    await serverInstance.init();
    await serverInstance.server.connect(transport);

    logger.info("Diavgeia MCP Server started successfully on stdio transport");
  } catch (error) {
    logger.error(`Failed to start Diavgeia MCP Server: ${error}`);
    throw error;
  }
}

main().catch((error) => {
  logger.error("Fatal error in main()", error);
  process.exit(1);
});
