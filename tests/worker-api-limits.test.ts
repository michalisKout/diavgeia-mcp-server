import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Unstable_DevWorker, unstable_dev } from "wrangler";
let worker: Unstable_DevWorker;
let base: string;
let attempts = 0;
let redirect = false;
let normal = false;
let followed = false;
const api = createServer((req, res) => {
  attempts++;
  if (normal) {
    res.setHeader("Content-Type", "application/json");
    res.end(
      '{"organizations":[{"uid":"1","label":"Synthetic organization","status":"active"}]}'
    );
    return;
  }
  if (req.url === "/redirect-target") {
    followed = true;
    res.setHeader("Content-Type", "application/json");
    res.end('{"organizations":[]}');
    return;
  }
  if (redirect) {
    res.writeHead(302, { Location: "/redirect-target" });
    res.end();
    return;
  }
  res.writeHead(200, { "Content-Type": "application/json" });
  res.write('{"organizations":[],"padding":"');
  res.write("x".repeat(4 * 1024 * 1024));
  res.end('"}');
});
beforeAll(async () => {
  await new Promise<void>((r) => api.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(api.address() as AddressInfo).port}`;
  worker = await unstable_dev("tests/fixtures/api-worker.ts", {
    local: true,
    ip: "127.0.0.1",
    port: 0,
    inspectorPort: 0,
    persist: false,
    logLevel: "error",
    experimental: {
      disableExperimentalWarning: true,
      disableDevRegistry: true,
    },
  });
}, 60000);
afterAll(async () => {
  await worker?.stop();
  await new Promise<void>((r) => {
    api.closeAllConnections();
    api.close(() => r());
  });
});
describe("actual workerd upstream boundaries", () => {
  it.each(["search", "decision", "metadata"])(
    "rejects chunked oversized %s JSON in the Worker fetch adapter",
    async (operation) => {
      attempts = 0;
      const result = await worker.fetch(
        `/?${new URLSearchParams({ base, operation })}`
      );
      const body = await result.text();
      expect(result.status).toBe(502);
      expect(body).toBe("Upstream fixture failed");
      expect(attempts, body).toBe(1);
    }
  );
  it("refuses redirects in workerd", async () => {
    attempts = 0;
    redirect = true;
    const result = await worker.fetch(
      `/?${new URLSearchParams({ base, operation: "metadata" })}`
    );
    expect(result.status).toBe(502);
    expect(followed).toBe(false);
    expect(attempts).toBe(1);
  });
  it("retains ordinary Worker API JSON responses", async () => {
    normal = true;
    const result = await worker.fetch(
      `/?${new URLSearchParams({ base, operation: "metadata" })}`
    );
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual([
      { uid: "1", label: "Synthetic organization", status: "active" },
    ]);
  });
});
