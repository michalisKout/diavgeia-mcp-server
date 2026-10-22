import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import axios from "axios";
import { afterEach, describe, expect, it } from "vitest";
import { DiavgeiaApiClient } from "../src/api/diavgeia.js";
const cleanups: Array<() => Promise<void>> = [];
const originalAdapter = axios.defaults.adapter;
afterEach(async () => {
  axios.defaults.adapter = originalAdapter;
  for (const cleanup of cleanups.splice(0)) await cleanup();
});
async function fixture(redirect = false) {
  let redirected = false;
  let requests = 0;
  const server = createServer((req, res) => {
    requests++;
    if (req.url === "/target") {
      redirected = true;
      res.setHeader("Content-Type", "application/json");
      res.end('{"organizations":[]}');
      return;
    }
    if (redirect) {
      res.writeHead(302, { Location: "/target" });
      res.end();
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.write('{"organizations":[],"padding":"');
    res.write("a".repeat(4 * 1024 * 1024));
    res.end('"}');
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  cleanups.push(
    () =>
      new Promise<void>((r) => {
        server.closeAllConnections();
        server.close(() => r());
      })
  );
  return {
    client: new DiavgeiaApiClient({
      baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    }),
    redirected: () => redirected,
    requests: () => requests,
  };
}
describe.each(["http", "fetch"])("%s upstream adapter", (adapter) => {
  it.each(["search", "decision", "metadata"])(
    "rejects actual oversized chunked %s JSON before parsing without retries",
    async (method) => {
      axios.defaults.adapter = adapter;
      const f = await fixture();
      const call =
        method === "search"
          ? f.client.searchDecisions({ q: "synthetic" })
          : method === "decision"
            ? f.client.getDecisionByAda("SYNTHETIC")
            : f.client.getOrganizations();
      await expect(call).rejects.toThrow();
      expect(f.requests()).toBe(1);
    }
  );
  it("does not follow an API redirect", async () => {
    axios.defaults.adapter = adapter;
    const f = await fixture(true);
    await expect(f.client.getOrganizations()).rejects.toThrow();
    expect(f.redirected()).toBe(false);
  });
});
