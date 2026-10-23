import { readFile } from "node:fs/promises";
import { createServer, request } from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DiavgeiaApiClient } from "../src/api/diavgeia.js";
import { type HttpServerOptions, startHttpServer } from "../src/http.js";
import { createDecisionEvidenceService } from "../src/modules/decision/evidence.js";
import { createNodePdfExtractor } from "../src/platform/node-pdf-extractor.js";
import type { PdfExtractor } from "../src/platform/pdf-extractor.js";
import { workerUrl } from "./fixtures/compiled-worker.js";

const credential = "synthetic-test-credential";
const close: Array<() => Promise<unknown>> = [];
afterEach(async () => {
  for (const cleanup of close.splice(0).reverse()) await cleanup();
});
async function host(
  extractor?: PdfExtractor,
  options: Partial<HttpServerOptions> = {}
) {
  let metadataRequests = 0;
  let downloads = 0;
  const upstream = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url?.startsWith("/decisions/")) {
      metadataRequests++;
      res.end(
        JSON.stringify({
          ada: decodeURIComponent(req.url.slice("/decisions/".length)),
          subject: "Synthetic decision",
          versionId: "1",
          status: "published",
          documentUrl: `https://diavgeia.gov.gr/doc/${req.url.slice("/decisions/".length)}`,
        })
      );
    } else
      res.end(
        JSON.stringify({
          decisions: [
            {
              ada: "SYNTHETIC",
              subject: "Synthetic decision",
              organizationId: "1",
              issueDate: "2026-09-01",
            },
          ],
          total: 1,
        })
      );
  });
  await new Promise<void>((r) => upstream.listen(0, "127.0.0.1", r));
  close.push(
    () =>
      new Promise<void>((r) => {
        upstream.closeAllConnections();
        upstream.close(() => r());
      })
  );
  const apiBaseUrl = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
  const bytes = await readFile(
    new URL("./fixtures/multipage-greek.pdf", import.meta.url)
  );
  const evidenceService = createDecisionEvidenceService({
    apiClient: new DiavgeiaApiClient({ baseUrl: apiBaseUrl }),
    extractor: extractor ?? createNodePdfExtractor({ workerUrl }),
    fetch: async () => {
      downloads++;
      return new Response(bytes, {
        headers: { "Content-Type": "application/pdf" },
      });
    },
  });
  const server = await startHttpServer({
    port: 0,
    host: "127.0.0.1",
    token: credential,
    config: { apiBaseUrl },
    evidenceService,
    ...options,
  });
  close.push(server.close);
  const url = new URL(`http://127.0.0.1:${server.port}/mcp`);
  return {
    server,
    url,
    metadataRequests: () => metadataRequests,
    downloads: () => downloads,
  };
}
const transports = new WeakMap<Client, StreamableHTTPClientTransport>();
async function connect(url: URL) {
  const client = new Client({ name: "http-regression", version: "1" });
  close.push(() => client.close());
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: { headers: { Authorization: `Bearer ${credential}` } },
  });
  transports.set(client, transport);
  await client.connect(transport);
  return client;
}
async function post(
  url: URL,
  body: string,
  headers: Record<string, string> = {}
) {
  return fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${credential}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...headers,
    },
    body,
  });
}

describe("private HTTP MCP boundary", () => {
  it("requires a nonempty credential before listening", async () => {
    await expect(
      startHttpServer({ port: 0, host: "127.0.0.1", token: "" })
    ).rejects.toThrow(/credential/i);
  });
  it("serves health without credentials and rejects missing/wrong bearer without disclosure", async () => {
    const { url } = await host();
    expect((await fetch(new URL("/health", url))).status).toBe(200);
    for (const Authorization of ["", "Bearer wrong", `Basic ${credential}`]) {
      const response = await post(url, "{}", { Authorization });
      expect(response.status).toBe(401);
      expect(await response.text()).not.toContain(credential);
    }
  });
  it("rejects foreign or malformed Origin while supporting non-browser clients", async () => {
    const { url } = await host();
    for (const Origin of ["https://evil.example", "null", "not-a-url"])
      expect((await post(url, "{}", { Origin })).status).toBe(403);
    expect((await post(url, "{}", { Origin: url.origin })).status).not.toBe(
      403
    );
    expect((await connect(url)).getServerVersion()?.name).toBe(
      "diavgeia-mcp-server"
    );
  });
  it("rejects malformed JSON and actual oversized chunked input before parsing", async () => {
    const { url } = await host();
    expect((await post(url, "{")).status).toBe(400);
    const status = await new Promise<number>((resolve) => {
      const req = request(
        url,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${credential}`,
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
          },
        },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        }
      );
      req.write('{"padding":"');
      req.write("x".repeat(65536));
      req.end('"}');
    });
    expect(status).toBe(413);
  });
  it("rejects structural overflow before stripping unknown tool arguments", async () => {
    const { url } = await host();
    const client = await connect(url);
    const result = await client.callTool({
      name: "get-decision",
      arguments: {
        ada: "SYNTHETIC",
        junk: Array.from({ length: 257 }, () => 1),
      },
    });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toMatch(/element|complex|limit/i);
  });
  it("roundtrips search and page evidence while sharing cached extraction across fresh HTTP requests", async () => {
    const fixture = await host();
    const client = await connect(fixture.url);
    const search = await client.callTool({
      name: "search-decisions",
      arguments: {
        q: "synthetic",
        org: "1",
        from_date: "2026-09-01",
        to_date: "2026-09-30",
      },
    });
    expect(search.structuredContent).toMatchObject({
      total: 1,
      decisions: [{ ada: "SYNTHETIC" }],
      coverage: { contractVersion: 1 },
    });
    for (let i = 0; i < 2; i++) {
      const freshClient = await connect(fixture.url);
      const result = await freshClient.callTool({
        name: "get-decision",
        arguments: { ada: "SYNTHETIC", query: "προθεσμία" },
      });
      expect(result.structuredContent).toMatchObject({
        found: true,
        decision: { ada: "SYNTHETIC" },
        evidence: {
          contractVersion: 1,
          extraction: { state: "native", totalPages: 3 },
        },
      });
    }
    expect(fixture.metadataRequests()).toBe(2);
    expect(fixture.downloads()).toBe(1);
  });
  it.each(["abort", "shutdown"])(
    "%s terminates active extraction and releases the HTTP connection",
    async (mode) => {
      let started!: () => void;
      let aborted!: () => void;
      const extracting = new Promise<void>((r) => {
        started = r;
      });
      const stopped = new Promise<void>((r) => {
        aborted = r;
      });
      const { url, server } = await host({
        extract: async (_bytes, context) => {
          started();
          return new Promise((_resolve, reject) =>
            context.signal.addEventListener(
              "abort",
              () => {
                aborted();
                reject(new Error("aborted"));
              },
              { once: true }
            )
          );
        },
      });
      const client = await connect(url);
      const controller = new AbortController();
      const call = client
        .callTool(
          { name: "get-decision", arguments: { ada: "SYNTHETIC" } },
          undefined,
          { signal: controller.signal }
        )
        .catch(() => undefined);
      await extracting;
      if (mode === "abort") controller.abort();
      else await server.close();
      await Promise.race([
        stopped,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Extraction did not abort")), 1500)
        ),
      ]);
      if (mode === "shutdown") await client.close();
      await call;
    }
  );
  it("bounds sessions and releases capacity on SDK transport close", async () => {
    const { url } = await host(undefined, { maxSessions: 1 });
    const client = await connect(url);
    await expect(connect(url)).rejects.toMatchObject({ code: 503 });
    await client.close();
    await vi.waitFor(
      async () => {
        const replacement = await connect(url);
        expect((await replacement.listTools()).tools).toHaveLength(2);
      },
      { timeout: 2000, interval: 50 }
    );
  });
  it("expires idle sessions and permits a fresh client", async () => {
    const { url } = await host(undefined, {
      maxSessions: 1,
      sessionIdleMs: 150,
    });
    const client = await connect(url);
    const id = transports.get(client)?.sessionId;
    if (!id) throw new Error("Missing initialized session");
    await new Promise((r) => setTimeout(r, 250));
    const stale = await post(
      url,
      JSON.stringify({ jsonrpc: "2.0", id: 99, method: "tools/list" }),
      { "mcp-session-id": id }
    );
    expect(stale.status).toBe(404);
    expect((await (await connect(url)).listTools()).tools).toHaveLength(2);
  });
  it("DELETE closes the session and frees its slot", async () => {
    const { url } = await host(undefined, { maxSessions: 1 });
    const client = await connect(url);
    await transports.get(client)?.terminateSession();
    expect((await (await connect(url)).listTools()).tools).toHaveLength(2);
  });
  it("cancellation IDs cannot cross sessions, and a cancelled client can call again", async () => {
    const signals: AbortSignal[] = [];
    const releases: Array<() => void> = [];
    const { url } = await host({
      extract: async (_bytes, ctx) => {
        signals.push(ctx.signal);
        return new Promise((resolve, reject) => {
          releases.push(() =>
            resolve({
              totalPages: 1,
              pages: [{ page: 1, text: "Synthetic readable passage." }],
            })
          );
          ctx.signal.addEventListener(
            "abort",
            () => reject(new Error("cancelled")),
            { once: true }
          );
        });
      },
    });
    const one = await connect(url);
    const two = await connect(url);
    const controller = new AbortController();
    const first = one
      .callTool(
        { name: "get-decision", arguments: { ada: "FIRST" } },
        undefined,
        { signal: controller.signal }
      )
      .catch(() => undefined);
    const second = two.callTool({
      name: "get-decision",
      arguments: { ada: "SECOND" },
    });
    await vi.waitFor(() => expect(signals).toHaveLength(2));
    controller.abort();
    await vi.waitFor(() => expect(signals[0].aborted).toBe(true));
    expect(signals[1].aborted).toBe(false);
    releases[1]();
    expect((await second).structuredContent).toHaveProperty("found", true);
    await first;
    expect((await one.listTools()).tools).toHaveLength(2);
  });
  it("premature tool-response disconnect aborts only that request", async () => {
    let signal: AbortSignal | undefined;
    const { url } = await host({
      extract: async (_bytes, ctx) => {
        signal = ctx.signal;
        return new Promise((_resolve, reject) =>
          ctx.signal.addEventListener(
            "abort",
            () => reject(new Error("disconnected")),
            { once: true }
          )
        );
      },
    });
    const client = await connect(url);
    const sessionId = transports.get(client)?.sessionId;
    if (!sessionId) throw new Error("Missing initialized session");
    const controller = new AbortController();
    const response = fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${credential}`,
        "mcp-session-id": sessionId,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 999,
        method: "tools/call",
        params: { name: "get-decision", arguments: { ada: "DISCONNECT" } },
      }),
    })
      .then((r) => r.text())
      .catch(() => undefined);
    await vi.waitFor(() => expect(signal).toBeDefined());
    controller.abort();
    await vi.waitFor(() => expect(signal?.aborted).toBe(true));
    expect((await client.listTools()).tools).toHaveLength(2);
    await response;
  });
});
