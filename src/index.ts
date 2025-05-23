import { McpAgent } from "agents/mcp";
import { DiavgeiaMCPServer } from "./mcp-server.js";

export class DiavgeiaMCP extends McpAgent {
  server = new DiavgeiaMCPServer().server;

  async init() {
    const mcpServer = new DiavgeiaMCPServer();
    this.server = mcpServer.server;
    await mcpServer.init();
  }
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, mcp-session-id",
  "Access-Control-Expose-Headers": "mcp-session-id",
  "Access-Control-Max-Age": "86400",
};

function addCorsHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  Object.entries(CORS_HEADERS).forEach(([key, value]) => {
    headers.set(key, value);
  });
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    try {
      const url = new URL(request.url);

      const corsOptions = {
        origin: CORS_HEADERS["Access-Control-Allow-Origin"],
        methods: CORS_HEADERS["Access-Control-Allow-Methods"],
        headers: CORS_HEADERS["Access-Control-Allow-Headers"],
        exposeHeaders: CORS_HEADERS["Access-Control-Expose-Headers"],
        maxAge: Number(CORS_HEADERS["Access-Control-Max-Age"]),
      };

      if (request.method === "OPTIONS") {
        return addCorsHeaders(new Response("ok", { status: 200 }));
      }

      // Handle SSE endpoint and all sub-paths
      if (url.pathname.startsWith("/sse")) {
        try {
          const response = await DiavgeiaMCP.serveSSE("/sse", {
            corsOptions,
          }).fetch(request, env, ctx);

          return addCorsHeaders(response);
        } catch (error) {
          return addCorsHeaders(
            new Response(JSON.stringify({ error: String(error) }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            })
          );
        }
      }

      // Handle MCP endpoint
      if (url.pathname.startsWith("/mcp")) {
        const response = await DiavgeiaMCP.serve("/mcp", {
          corsOptions,
        }).fetch(request, env, ctx);
        response.headers.set("Content-Type", "text/event-stream");
        response.headers.set("Cache-Control", "no-cache, no-transform");
        response.headers.set("Connection", "keep-alive");
        response.headers.set("X-Accel-Buffering", "no");
        return addCorsHeaders(response);
      }

      // Health check endpoint
      if (url.pathname === "/health") {
        return addCorsHeaders(
          new Response("OK", {
            status: 200,
            headers: { "Content-Type": "text/plain" },
          })
        );
      }

      return addCorsHeaders(
        new Response("Not found", {
          status: 404,
          headers: { "Content-Type": "text/plain" },
        })
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return addCorsHeaders(
        new Response(`Internal Server Error: ${errorMessage}`, {
          status: 500,
          headers: { "Content-Type": "text/plain" },
        })
      );
    }
  },
};
