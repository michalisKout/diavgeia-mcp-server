import {
  type IncomingMessage,
  type ServerResponse,
  createServer,
} from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage, Tool } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DiavgeiaMCPServer } from "../src/mcp-server.js";
import { GET_DECISIONS_TOOL_NAME } from "../src/modules/decision/constants.js";
import { SEARCH_EXAMPLES_PROMPT } from "../src/modules/prompts/search-examples.js";
import { DIAVGEIA_API_RESOURCE } from "../src/modules/resources/api-documentation.js";
import { SEARCH_DECISIONS_TOOL_NAME } from "../src/modules/search/constants.js";

class InMemoryTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;
  peer?: InMemoryTransport;
  closed = false;

  async start(): Promise<void> {}

  async send(message: JSONRPCMessage): Promise<void> {
    if (this.closed) {
      throw new Error("Transport is closed");
    }

    queueMicrotask(() => this.peer?.onmessage?.(message));
  }

  async close(): Promise<void> {
    this.closed = true;
    this.onclose?.();
  }
}

function createTransportPair() {
  const clientTransport = new InMemoryTransport();
  const serverTransport = new InMemoryTransport();
  clientTransport.peer = serverTransport;
  serverTransport.peer = clientTransport;
  return { clientTransport, serverTransport };
}

type RecordedRequest = {
  pathname: string;
  searchParams: URLSearchParams;
};

function writeJson(response: ServerResponse, body: unknown) {
  response.writeHead(200, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

async function startDiavgeiaApiStub() {
  const requests: RecordedRequest[] = [];

  const server = createServer(
    (request: IncomingMessage, response: ServerResponse) => {
      const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
      requests.push({
        pathname: requestUrl.pathname,
        searchParams: requestUrl.searchParams,
      });

      if (requestUrl.pathname === "/search") {
        writeJson(response, {
          decisions: [
            {
              ada: "ΨΧ465Κ8Ω-123",
              subject: "Προμήθεια εκπαιδευτικού εξοπλισμού",
              issueDate: "2026-06-30",
              organizationId: "100001",
              organizationName: "Υπουργείο Παιδείας",
              decisionTypeId: "Β.2.2",
              decisionTypeName: "Procurement contracts",
              documentUrl: "",
            },
          ],
          total: 1,
        });
        return;
      }

      if (
        decodeURIComponent(requestUrl.pathname) === "/decisions/ΨΧ465Κ8Ω-123"
      ) {
        writeJson(response, {
          ada: "ΨΧ465Κ8Ω-123",
          subject: "Προμήθεια εκπαιδευτικού εξοπλισμού",
          protocolNumber: "42/2026",
          issueDate: "2026-06-30",
          status: "published",
          organizationId: "100001",
          organizationName: "Υπουργείο Παιδείας",
          decisionTypeId: "Β.2.2",
          decisionTypeName: "Procurement contracts",
          url: "https://diavgeia.gov.gr/decision/ΨΧ465Κ8Ω-123",
          documentUrl: "",
          signers: [
            {
              name: "Example Signer",
              title: "Minister",
              position: "1",
            },
          ],
        });
        return;
      }

      if (requestUrl.pathname === "/organizations.json") {
        writeJson(response, {
          organizations: [
            {
              uid: "100001",
              label: "ΥΠΟΥΡΓΕΙΟ ΠΑΙΔΕΙΑΣ",
            },
          ],
        });
        return;
      }

      response.writeHead(404, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "Not found" }));
    }
  );

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function textContent(result: {
  content?: Array<{ type: string; text?: string }>;
}) {
  return result.content
    ?.filter((item) => item.type === "text")
    .map((item) => item.text ?? "")
    .join("\n");
}

describe("Diavgeia MCP server usage flows", () => {
  let apiStub: Awaited<ReturnType<typeof startDiavgeiaApiStub>>;
  let client: Client;
  let serverInstance: DiavgeiaMCPServer;

  beforeEach(async () => {
    apiStub = await startDiavgeiaApiStub();
    serverInstance = new DiavgeiaMCPServer({
      apiBaseUrl: apiStub.baseUrl,
      defaultPageSize: 2,
      defaultDateRange: "1month",
    });
    await serverInstance.init();

    const { clientTransport, serverTransport } = createTransportPair();
    await serverInstance.server.connect(serverTransport);

    client = new Client(
      { name: "vitest-mcp-client", version: "1.0.0" },
      { capabilities: {} }
    );
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    await serverInstance.server.close();
    await apiStub.close();
  });

  it("advertises usable read-only decision tools through tools/list", async () => {
    const { tools } = await client.listTools();
    const byName = new Map(tools.map((tool: Tool) => [tool.name, tool]));

    expect([...byName.keys()]).toEqual(
      expect.arrayContaining([
        SEARCH_DECISIONS_TOOL_NAME,
        GET_DECISIONS_TOOL_NAME,
      ])
    );
    expect(byName.get(SEARCH_DECISIONS_TOOL_NAME)?.annotations).toMatchObject({
      readOnlyHint: true,
      idempotentHint: true,
      destructiveHint: false,
    });
    expect(byName.get(GET_DECISIONS_TOOL_NAME)?.annotations).toMatchObject({
      readOnlyHint: true,
      idempotentHint: true,
      destructiveHint: false,
    });
  });

  it("exposes documentation resources and search guidance prompts", async () => {
    const resource = await client.readResource({
      uri: DIAVGEIA_API_RESOURCE.uri,
    });
    expect(resource.contents[0]).toMatchObject({
      uri: DIAVGEIA_API_RESOURCE.uri,
      mimeType: DIAVGEIA_API_RESOURCE.mimeType,
    });
    expect(
      "text" in resource.contents[0] ? resource.contents[0].text : ""
    ).toContain("Diavgeia API Documentation");

    const prompt = await client.getPrompt({
      name: SEARCH_EXAMPLES_PROMPT.name,
    });
    expect(prompt.messages[0].content).toMatchObject({
      type: "text",
    });
    expect(
      "text" in prompt.messages[0].content
        ? prompt.messages[0].content.text
        : ""
    ).toContain("Diavgeia Search Query Examples");
  });

  it("searches decisions through the MCP tool using optional server defaults", async () => {
    const result = await client.callTool({
      name: SEARCH_DECISIONS_TOOL_NAME,
      arguments: {
        q: "εκπαιδευτικός εξοπλισμός",
        ministryIdOrName: "100001",
      },
    });

    const responseText = textContent(result);
    expect(responseText).toContain("ΨΧ465Κ8Ω-123");
    expect(responseText).toContain("Προμήθεια εκπαιδευτικού εξοπλισμού");

    const searchRequest = apiStub.requests.find(
      (request) => request.pathname === "/search"
    );
    expect(searchRequest?.searchParams.get("size")).toBe("2");
    expect(searchRequest?.searchParams.get("from_issue_date")).toMatch(
      /^\d{4}-\d{2}-\d{2}$/
    );
    expect(searchRequest?.searchParams.get("to_issue_date")).toMatch(
      /^\d{4}-\d{2}-\d{2}$/
    );
  });

  it("retrieves a decision detail through the MCP tool", async () => {
    const result = await client.callTool({
      name: GET_DECISIONS_TOOL_NAME,
      arguments: {
        ada: "ΨΧ465Κ8Ω-123",
      },
    });

    const responseText = textContent(result);
    expect(responseText).toContain("Decision Details");
    expect(responseText).toContain("Προμήθεια εκπαιδευτικού εξοπλισμού");
    expect(responseText).toContain("Example Signer");
  });
});
