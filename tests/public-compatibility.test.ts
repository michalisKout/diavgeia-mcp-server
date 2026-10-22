import { request } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Unstable_DevWorker, unstable_dev } from "wrangler";
import { SEARCH_EXAMPLES_PROMPT } from "../src/modules/prompts/search-examples.js";
import { DIAVGEIA_API_RESOURCE } from "../src/modules/resources/api-documentation.js";
import { SMITHERY_SERVER_CARD } from "../src/server-card.js";

let worker: Unstable_DevWorker;
let client: Client;
beforeAll(async () => {
  worker = await unstable_dev("src/index.ts", {
    local: true,
    port: 0,
    ip: "127.0.0.1",
    inspectorPort: 0,
    persist: false,
    logLevel: "error",
    experimental: {
      disableExperimentalWarning: true,
      disableDevRegistry: true,
    },
  });
  client = new Client({ name: "legacy-worker-client", version: "1" });
  await client.connect(
    new StreamableHTTPClientTransport(
      new URL(`http://${worker.address}:${worker.port}/mcp`)
    )
  );
}, 60000);
afterAll(async () => {
  await client?.close();
  await worker?.stop();
});

describe("real public Worker compatibility", () => {
  it("preserves legacy tools, schemas, resources, prompts and Smithery card", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "get-decision",
      "search-decisions",
    ]);
    const search = tools.find((t) => t.name === "search-decisions");
    if (!search) throw new Error("Missing search tool");
    expect(Object.keys(search.inputSchema.properties ?? {})).toEqual(
      expect.arrayContaining([
        "q",
        "org",
        "ministryIdOrName",
        "organizationUid",
        "type",
        "decisionType",
        "rawQuery",
      ])
    );
    expect(Object.keys(search.outputSchema?.properties ?? {})).toEqual(
      expect.arrayContaining(["message", "total", "decisions", "coverage"])
    );
    expect(
      (await client.readResource({ uri: DIAVGEIA_API_RESOURCE.uri }))
        .contents[0]
    ).toHaveProperty("text");
    expect(
      (await client.getPrompt({ name: SEARCH_EXAMPLES_PROMPT.name }))
        .messages[0].content.type
    ).toBe("text");
    const result = await client.callTool({
      name: "get-decision",
      arguments: { ada: null },
    });
    expect(result.structuredContent).toMatchObject({
      found: false,
      decision: null,
      message: expect.any(String),
    });
    const card = await worker.fetch("/.well-known/mcp/server-card.json");
    expect(await card.json()).toEqual(SMITHERY_SERVER_CARD);
  });
  it("rejects structural overflow through the existing Agents transport", async () => {
    const result = await client.callTool({
      name: "get-decision",
      arguments: { ada: null, junk: Array.from({ length: 257 }, () => 1) },
    });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toMatch(/element|complex|limit/i);
  });
  it.each(["/mcp", "/sse/message"])(
    "bounds actual chunked bytes before Agents parses %s",
    async (path) => {
      const status = await new Promise<number>((resolve, reject) => {
        const req = request(
          `http://${worker.address}:${worker.port}${path}`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              accept: "application/json, text/event-stream",
            },
          },
          (res) => {
            res.resume();
            resolve(res.statusCode ?? 0);
          }
        );
        req.on("error", reject);
        req.write('{"padding":"');
        req.write("x".repeat(65536));
        req.end('"}');
      });
      expect(status).toBe(413);
    }
  );
});
