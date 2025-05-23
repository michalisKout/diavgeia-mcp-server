import { tmpdir } from "node:os";
import { join } from "node:path";
import pino from "pino";

// Determine if we're running in stdio mode (for Claude Desktop)
// In stdio mode, we MUST NOT write to stdout/stderr as it interferes with JSON-RPC
const isStdioMode =
  process.env.MCP_TRANSPORT === "stdio" || !process.stdout.isTTY;

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport: isStdioMode
    ? {
        // In stdio mode, write logs to a file
        target: "pino/file",
        options: {
          destination: join(tmpdir(), "diavgeia-mcp-server.log"),
          mkdir: true,
        },
      }
    : process.env.NODE_ENV !== "production"
      ? {
          // In development (non-stdio), use pretty printing
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname",
          },
        }
      : undefined,
});

export { logger };
