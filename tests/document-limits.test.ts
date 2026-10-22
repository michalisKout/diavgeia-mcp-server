import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { Worker } from "node:worker_threads";
import { describe, expect, it, vi } from "vitest";
import { DOCUMENT_LIMITS, documentLimitsSchema } from "../src/config.js";
import { createNodePdfExtractor } from "../src/platform/node-pdf-extractor.js";
import { WorkPool } from "../src/platform/pdf-extractor.js";
import { BoundedCache } from "../src/utils/bounded-cache.js";
import {
  downloadOfficialPdf,
  validateOfficialDocumentUrl,
} from "../src/utils/official-download.js";
import { compiledRoot, workerUrl } from "./fixtures/compiled-worker.js";
const ctx = (signal = new AbortController().signal, ms = 5000) => ({
  signal,
  deadlineAt: Date.now() + ms,
});
const url = "https://diavgeia.gov.gr/doc/SYNTHETIC";
const bytes = new Uint8Array(
  readFileSync(new URL("./fixtures/multipage-greek.pdf", import.meta.url))
);
describe("document resource boundaries", () => {
  it("validates redirect allowlist at every hop, credentials and ports", async () => {
    for (const candidate of [
      "http://diavgeia.gov.gr/doc/x",
      "https://diavgeia.gov.gr.evil.test/doc/x",
      "https://user:pass@diavgeia.gov.gr/doc/x",
      "https://diavgeia.gov.gr:444/doc/x",
      "https://evil.test",
    ])
      expect(() => validateOfficialDocumentUrl(candidate)).toThrow();
    const fetcher = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://evil.test/pdf" },
        })
    );
    await expect(
      downloadOfficialPdf(url, ctx(), { fetch: fetcher })
    ).rejects.toThrow(/official/i);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("rejects a stream that exceeds byte limit and invalid PDF content", async () => {
    let cancelled = false;
    const body = new ReadableStream({
      start(c) {
        c.enqueue(new Uint8Array(100));
        c.enqueue(new Uint8Array(100));
      },
      cancel() {
        cancelled = true;
      },
    });
    await expect(
      downloadOfficialPdf(url, ctx(), {
        fetch: async () =>
          new Response(body, {
            headers: { "content-type": "application/pdf" },
          }),
        limits: { maxBytes: 150 },
      })
    ).rejects.toThrow(/byte/i);
    expect(cancelled).toBe(true);
    await expect(
      downloadOfficialPdf(url, ctx(), {
        fetch: async () =>
          new Response("<html/>", { headers: { "content-type": "text/html" } }),
      })
    ).rejects.toThrow(/PDF/i);
  });
  it("limits redirect count and retries transient GETs with capped Retry-After", async () => {
    const redirects = vi.fn(
      async () =>
        new Response(null, { status: 302, headers: { location: url } })
    );
    await expect(
      downloadOfficialPdf(url, ctx(), { fetch: redirects })
    ).rejects.toThrow(/redirect/i);
    expect(redirects).toHaveBeenCalledTimes(4);
    const retry = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 503, headers: { "retry-after": "100" } })
      )
      .mockResolvedValue(
        new Response(bytes, { headers: { "content-type": "application/pdf" } })
      );
    await downloadOfficialPdf(url, ctx(), {
      fetch: retry,
      limits: { retryAfterMs: 1 },
    });
    expect(retry).toHaveBeenCalledTimes(2);
  });
  it("rejects too many pages before extraction", async () => {
    await expect(
      createNodePdfExtractor({
        workerUrl: workerUrl,
        limits: { maxPages: 2 },
      }).extract(bytes, ctx())
    ).rejects.toThrow(/page/i);
  });
  it("CPU timeout terminates worker and leaves console methods intact", async () => {
    const warn = console.warn;
    const error = console.error;
    let worker: Worker | undefined;
    const extractor = createNodePdfExtractor({
      workerUrl: workerUrl,
      limits: { extractionMs: 40 },
      workerFactory: () => {
        worker = new Worker(new URL("data:text/javascript,while(true){}"));
        return worker;
      },
    });
    await expect(extractor.extract(bytes, ctx())).rejects.toThrow(
      /deadline|timeout/i
    );
    expect(worker?.threadId).toBe(-1);
    expect(console.warn).toBe(warn);
    expect(console.error).toBe(error);
  });
  it("aborting queued tasks releases capacity", async () => {
    const extractor = createNodePdfExtractor({
      workerUrl: workerUrl,
      limits: { concurrency: 1 },
    });
    const controller = new AbortController();
    const first = extractor.extract(bytes, ctx());
    const queued = extractor.extract(bytes, ctx(controller.signal));
    controller.abort();
    await expect(queued).rejects.toThrow(/abort/i);
    await first;
    expect((await extractor.extract(bytes, ctx())).totalPages).toBe(3);
  });
  it("cancelled shared consumer does not cancel another; last consumer aborts underlying work", async () => {
    const cache = new BoundedCache<string>({
      maxEntries: 2,
      maxBytes: 20,
      ttlMs: 1000,
    });
    let underlying: AbortSignal | undefined;
    let done!: (v: string) => void;
    const loader = vi.fn(async (c: { signal: AbortSignal }) => {
      underlying = c.signal;
      return new Promise<string>((resolve, reject) => {
        done = resolve;
        c.signal.addEventListener("abort", () => reject(Error("aborted")));
      });
    });
    const a = new AbortController();
    const b = new AbortController();
    const one = cache.getOrLoad("a", ctx(a.signal), loader, () => 1);
    const two = cache.getOrLoad("a", ctx(b.signal), loader, () => 1);
    a.abort();
    await expect(one).rejects.toThrow(/abort/i);
    expect(underlying?.aborted).toBe(false);
    done("ok");
    expect(await two).toBe("ok");
    expect(loader).toHaveBeenCalledTimes(1);
    const last = new AbortController();
    const three = cache.getOrLoad("b", ctx(last.signal), loader, () => 1);
    last.abort();
    await expect(three).rejects.toThrow(/abort/i);
    expect(underlying?.aborted).toBe(true);
  });
  it("cache eviction releases bytes and TTL expires without serving stale values", async () => {
    const cache = new BoundedCache<string>({
      maxEntries: 2,
      maxBytes: 5,
      ttlMs: 10,
    });
    let calls = 0;
    const load = async () => String(++calls);
    await cache.getOrLoad("a", ctx(), load, () => 3);
    await cache.getOrLoad("b", ctx(), load, () => 3);
    expect(cache.byteSize).toBe(3);
    expect(cache.size).toBe(1);
    await cache.getOrLoad("a", ctx(), load, () => 3);
    expect(calls).toBe(3);
    await new Promise((r) => setTimeout(r, 15));
    await cache.getOrLoad("a", ctx(), load, () => 3);
    expect(calls).toBe(4);
  });
  it("finite work queue rejects overflow with typed code and abort frees waiting reservation", async () => {
    const pool = new WorkPool(1, 1);
    const release = await pool.acquire(ctx());
    const controller = new AbortController();
    const queued = pool.acquire(ctx(controller.signal));
    await expect(pool.acquire(ctx())).rejects.toMatchObject({
      code: "CAPACITY_LIMIT",
    });
    controller.abort();
    await expect(queued).rejects.toMatchObject({ code: "ABORTED" });
    release();
    (await pool.acquire(ctx()))();
  });
  it("compiled Node composition executes the emitted default .js worker", () => {
    const script = `import {createNodePdfExtractor} from ${JSON.stringify(`file://${compiledRoot}/platform/node-pdf-extractor.js`)}; import {readFileSync} from 'node:fs'; const bytes=new Uint8Array(readFileSync(${JSON.stringify(new URL("./fixtures/multipage-greek.pdf", import.meta.url).pathname)})); const result=await createNodePdfExtractor().extract(bytes,{signal:new AbortController().signal,deadlineAt:Date.now()+5000}); console.log(JSON.stringify(result));`;
    const result = JSON.parse(
      execFileSync(process.execPath, ["--input-type=module", "-e", script], {
        encoding: "utf8",
      })
    );
    expect(result.pages[2].text).toContain("Οι εκπαιδευτικοί");
  });
  it("parser diagnostics never contaminate stdio protocol stdout", () => {
    const script = `import {createNodePdfExtractor} from ${JSON.stringify(`file://${compiledRoot}/platform/node-pdf-extractor.js`)}; try{await createNodePdfExtractor().extract(new TextEncoder().encode('%PDF-broken'),{signal:new AbortController().signal,deadlineAt:Date.now()+5000});}catch{console.log(JSON.stringify({failed:true}));}`;
    const output = execFileSync(
      process.execPath,
      ["--input-type=module", "-e", script],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    );
    expect(output.trim()).toBe('{"failed":true}');
  });
  it("download stops on deadline or abort while stream is pending", async () => {
    let cancelled = false;
    const pending = new ReadableStream({
      cancel() {
        cancelled = true;
      },
    });
    await expect(
      downloadOfficialPdf(url, ctx(undefined, 30), {
        fetch: async () =>
          new Response(pending, {
            headers: { "content-type": "application/pdf" },
          }),
      })
    ).rejects.toThrow(/deadline/i);
    expect(cancelled).toBe(true);
    const controller = new AbortController();
    const work = downloadOfficialPdf(url, ctx(controller.signal), {
      fetch: async (_url, init) =>
        new Promise((_resolve, reject) =>
          init?.signal?.addEventListener("abort", () =>
            reject(Error("aborted"))
          )
        ),
    });
    controller.abort();
    await expect(work).rejects.toThrow(/abort/i);
  });
  it("aborting the last cache consumer terminates its actual worker and frees extraction capacity", async () => {
    let worker: Worker | undefined;
    const cache = new BoundedCache({
      maxEntries: 2,
      maxBytes: 100,
      ttlMs: 1000,
    });
    const extractor = createNodePdfExtractor({
      limits: { concurrency: 1 },
      workerFactory: () => {
        worker = new Worker(new URL("data:text/javascript,while(true){}"));
        return worker;
      },
    });
    const controller = new AbortController();
    const pending = cache.getOrLoad(
      "worker",
      ctx(controller.signal),
      (c) => extractor.extract(bytes, c),
      () => 1
    );
    await new Promise((r) => setTimeout(r, 30));
    controller.abort();
    await expect(pending).rejects.toThrow(/abort/i);
    await new Promise((r) => setTimeout(r, 30));
    expect(worker?.threadId).toBe(-1);
    expect(
      (await createNodePdfExtractor({ workerUrl }).extract(bytes, ctx()))
        .totalPages
    ).toBe(3);
  });
  it("limits are finite validated upper bounds and compiled real worker extracts Greek", async () => {
    for (const key of Object.keys(DOCUMENT_LIMITS))
      expect(
        documentLimitsSchema.safeParse({
          ...DOCUMENT_LIMITS,
          [key]: Number.POSITIVE_INFINITY,
        }).success
      ).toBe(false);
    const result = await createNodePdfExtractor({
      workerUrl: workerUrl,
    }).extract(bytes, ctx());
    expect(result.pages[2].text).toContain("Οι εκπαιδευτικοί");
  });
});
