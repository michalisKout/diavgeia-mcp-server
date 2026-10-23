#!/usr/bin/env node
import { randomUUID, timingSafeEqual } from "node:crypto";
import {
  type IncomingMessage,
  type ServerResponse,
  createServer,
} from "node:http";
import type { AddressInfo } from "node:net";
import { pathToFileURL } from "node:url";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { DiavgeiaApiClient } from "./api/diavgeia.js";
import { type DiavgeiaConfigOverrides, loadConfig } from "./config.js";
import { DiavgeiaMCPServer } from "./mcp-server.js";
import {
  type DecisionEvidenceService,
  createDecisionEvidenceService,
} from "./modules/decision/evidence.js";
import { createNodePdfExtractor } from "./platform/node-pdf-extractor.js";
import { MAX_MCP_BODY_BYTES, RequestBodyError } from "./utils/request-body.js";

// A single cache and extraction service for the entire process, independent of sessions.
let processEvidenceService: DecisionEvidenceService | undefined;
function sharedEvidenceService() {
  if (!processEvidenceService) {
    const config = loadConfig();
    processEvidenceService = createDecisionEvidenceService({
      apiClient: new DiavgeiaApiClient({
        baseUrl: config.apiBaseUrl,
        timeout: config.timeout,
      }),
      extractor: createNodePdfExtractor(),
    });
  }
  return processEvidenceService;
}
export type HttpServerOptions = {
  port: number;
  host: string;
  token: string;
  config?: DiavgeiaConfigOverrides;
  evidenceService?: DecisionEvidenceService;
  /** May only reduce the production bounds. */
  maxSessions?: number;
  sessionIdleMs?: number;
};
type Session = {
  instance: DiavgeiaMCPServer;
  transport: StreamableHTTPServerTransport;
  timer?: ReturnType<typeof setTimeout>;
};
function reply(res: ServerResponse, status: number, error: string) {
  if (res.headersSent || res.destroyed) return;
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error }));
}
async function readJson(req: IncomingMessage): Promise<unknown> {
  if (
    req.headers["content-type"]?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  )
    throw new RequestBodyError(415, "Content-Type must be application/json");
  const chunks: Buffer[] = [];
  let size = 0;
  // destroyOnReturn:false lets us send a 413 before closing an oversized upload.
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > MAX_MCP_BODY_BYTES)
      throw new RequestBodyError(413, "MCP request exceeds 64 KiB");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks, size).toString("utf8"));
  } catch {
    throw new RequestBodyError(400, "Malformed JSON");
  }
}
function validOrigin(req: IncomingMessage): boolean {
  if (req.headers.origin === undefined) return true;
  try {
    const origin = new URL(req.headers.origin);
    return (
      ["http:", "https:"].includes(origin.protocol) &&
      origin.origin === req.headers.origin &&
      origin.host === req.headers.host
    );
  } catch {
    return false;
  }
}
function bounded(value: number | undefined, maximum: number): number {
  const result = value ?? maximum;
  if (!Number.isSafeInteger(result) || result < 1 || result > maximum)
    throw new Error("Invalid HTTP resource limit");
  return result;
}
export async function startHttpServer(
  options: HttpServerOptions
): Promise<{ port: number; close(): Promise<void> }> {
  if (!options.token || !options.token.trim() || /[\r\n]/.test(options.token))
    throw new Error("DIAVGEIA_MCP_CREDENTIAL is required");
  if (
    !Number.isSafeInteger(options.port) ||
    options.port < 0 ||
    options.port > 65535
  )
    throw new Error("Invalid HTTP port");
  const expectedAuth = Buffer.from(`Bearer ${options.token}`);
  const maxSessions = bounded(options.maxSessions, 64);
  const idleMs = bounded(options.sessionIdleMs, 5 * 60_000);
  const evidenceService = options.evidenceService ?? sharedEvidenceService();
  const sessions = new Map<string, Session>();
  const allocated = new Set<Session>();
  let closing = false;
  const dispose = async (session: Session) => {
    clearTimeout(session.timer);
    if (!allocated.delete(session)) return;
    if (session.transport.sessionId)
      sessions.delete(session.transport.sessionId);
    await session.instance.server.close();
  };
  const touch = (session: Session) => {
    clearTimeout(session.timer);
    session.timer = setTimeout(() => {
      void dispose(session);
    }, idleMs);
    session.timer.unref();
  };
  const http = createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");
    const pathname = req.url?.split("?")[0];
    if (pathname === "/health" && req.method === "GET") {
      res.writeHead(closing ? 503 : 200);
      res.end(closing ? "Stopping" : "OK");
      return;
    }
    if (pathname !== "/mcp") {
      reply(res, 404, "Not found");
      return;
    }
    const supplied = Buffer.from(req.headers.authorization ?? "");
    if (
      supplied.length !== expectedAuth.length ||
      !timingSafeEqual(supplied, expectedAuth)
    ) {
      reply(res, 401, "Unauthorized");
      return;
    }
    if (!validOrigin(req)) {
      reply(res, 403, "Origin not allowed");
      return;
    }
    if (closing) {
      reply(res, 503, "Server stopping");
      return;
    }
    if (!["POST", "GET", "DELETE"].includes(req.method ?? "")) {
      res.setHeader("Allow", "POST, GET, DELETE");
      reply(res, 405, "Method not allowed");
      return;
    }
    let session: Session | undefined;
    let fresh = false;
    try {
      const body = req.method === "POST" ? await readJson(req) : undefined;
      if (closing || res.destroyed) return;
      const sessionId = req.headers["mcp-session-id"];
      if (typeof sessionId === "string") {
        session = sessions.get(sessionId);
        if (!session) {
          reply(res, 404, "Session not found");
          return;
        }
      } else if (req.method === "POST" && isInitializeRequest(body)) {
        if (allocated.size >= maxSessions) {
          reply(res, 503, "Session capacity reached");
          return;
        }
        const instance = new DiavgeiaMCPServer(options.config, {
          evidenceService,
        });
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: randomUUID,
          maxRequestBodySize: MAX_MCP_BODY_BYTES,
          onsessioninitialized: (id) => {
            if (session) sessions.set(id, session);
          },
        });
        session = { instance, transport };
        allocated.add(session);
        fresh = true;
        await instance.init();
        await instance.server.connect(transport);
        const onclose = transport.onclose;
        const owned = session;
        transport.onclose = () => {
          clearTimeout(owned.timer);
          allocated.delete(owned);
          if (transport.sessionId) sessions.delete(transport.sessionId);
          onclose?.();
        };
      } else {
        reply(res, 400, "Initialize a session first");
        return;
      }
      if (closing || res.destroyed) {
        if (fresh) await dispose(session);
        return;
      }
      const owned = session;
      touch(owned);
      const requestId =
        body && typeof body === "object" && "id" in body ? body.id : undefined;
      res.once("close", () => {
        if (res.writableFinished) return;
        if (typeof requestId === "string" || typeof requestId === "number")
          owned.transport.onmessage?.({
            jsonrpc: "2.0",
            method: "notifications/cancelled",
            params: { requestId },
          });
        // The SDK client owns one standalone SSE stream; closing its transport releases the session.
        if (req.method === "GET") void dispose(owned);
      });
      await owned.transport.handleRequest(req, res, body);
      if (fresh && !owned.transport.sessionId) await dispose(owned);
    } catch (error) {
      if (fresh && session) await dispose(session);
      const status = error instanceof RequestBodyError ? error.status : 500;
      reply(
        res,
        status,
        error instanceof RequestBodyError ? error.message : "MCP request failed"
      );
      if (status === 413) {
        res.once("finish", () => req.destroy());
      }
    }
  });
  http.requestTimeout = 10_000;
  http.headersTimeout = 10_000;
  http.maxConnections = 256;
  await new Promise<void>((resolve, reject) => {
    http.once("error", reject);
    http.listen(options.port, options.host, () => {
      http.removeListener("error", reject);
      resolve();
    });
  });
  let closePromise: Promise<void> | undefined;
  return {
    port: (http.address() as AddressInfo).port,
    close() {
      closePromise ??= (async () => {
        closing = true;
        const stopped = new Promise<void>((resolve, reject) =>
          http.close((error) => (error ? reject(error) : resolve()))
        );
        await Promise.all([...allocated].map(dispose));
        http.closeAllConnections();
        await stopped;
      })();
      return closePromise;
    },
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  startHttpServer({
    port: Number(process.env.PORT ?? "3001"),
    host: "::",
    token: process.env.DIAVGEIA_MCP_CREDENTIAL ?? "",
  })
    .then((server) => {
      console.info(`Diavgeia MCP HTTP listening on [::]:${server.port}`);
      for (const signal of ["SIGINT", "SIGTERM"] as const)
        process.once(signal, () => {
          void server.close().catch(() => {
            process.exitCode = 1;
          });
        });
    })
    .catch(() => {
      console.error(
        "HTTP startup failed; check PORT and DIAVGEIA_MCP_CREDENTIAL configuration."
      );
      process.exitCode = 1;
    });
}
