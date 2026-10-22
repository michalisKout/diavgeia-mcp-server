import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { DiavgeiaApiClient } from "../src/api/diavgeia.js";
import { DiavgeiaMCPServer } from "../src/mcp-server.js";
import { createDecisionEvidenceService } from "../src/modules/decision/evidence.js";
import { documentEvidenceSchema } from "../src/modules/decision/schema.js";
import { createDecisionTool } from "../src/modules/decision/tool.js";
import { createNodePdfExtractor } from "../src/platform/node-pdf-extractor.js";
import { workerPdfExtractor } from "../src/platform/worker-pdf-extractor.js";
import { compiledRoot, workerUrl } from "./fixtures/compiled-worker.js";
import fixture from "./fixtures/evidence-v1.json";
const context = (ms = 10_000) => ({
  signal: new AbortController().signal,
  deadlineAt: Date.now() + ms,
});
const quote = "Οι εκπαιδευτικοί υποβάλλουν αίτηση έως την Παρασκευή.";
const metadata = {
  ada: "SYNTHETIC",
  subject: "Synthetic",
  protocolNumber: "42",
  issueDate: "2026-10-22",
  status: "published",
  organizationId: "test",
  organizationName: "Test",
  decisionTypeId: "test",
  decisionTypeName: "Test",
  url: "https://diavgeia.gov.gr/decision/view/SYNTHETIC",
  documentUrl: "https://diavgeia.gov.gr/doc/SYNTHETIC",
  versionId: "1",
};
const bytes = (name: string) =>
  new Uint8Array(
    readFileSync(new URL(`./fixtures/${name}.pdf`, import.meta.url))
  );
const extractor = createNodePdfExtractor({ workerUrl: workerUrl });
function service(name = "multipage-greek", options = {}) {
  const getDecisionByAda = vi.fn(async () => ({ ...metadata }));
  const fetcher = vi.fn(
    async () =>
      new Response(bytes(name), {
        headers: { "content-type": "application/pdf" },
      })
  );
  return {
    getDecisionByAda,
    fetcher,
    ...createDecisionEvidenceService({
      apiClient: { getDecisionByAda },
      extractor,
      fetch: fetcher,
      ...options,
    }),
  };
}
describe("decision page evidence", () => {
  it("page three Greek quotation is literal beyond the old prefix, all pages searched", async () => {
    const s = service();
    const evidence = await s.getDecisionEvidence(
      { ada: metadata.ada, query: "ΕΚΠΑΙΔΕΥΤΙΚΟΙ αίτηση", maxExcerpts: 2 },
      context()
    );
    expect(evidence.extraction).toMatchObject({
      state: "native",
      totalPages: 3,
      extractedPages: [1, 2, 3],
      searchedPages: [1, 2, 3],
      unreadablePages: [],
    });
    const raw = await extractor.extract(bytes("multipage-greek"), context());
    expect(raw.pages[2].text.indexOf(quote)).toBeGreaterThan(1000);
    expect(evidence.excerpts[0]).toMatchObject({ page: 3 });
    expect(evidence.excerpts[0].text).toContain(quote);
    for (const excerpt of evidence.excerpts) {
      expect(raw.pages[excerpt.page - 1].text).toContain(excerpt.text);
      expect(excerpt.text.length).toBeLessThanOrEqual(1200);
    }
    expect(evidence.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(documentEvidenceSchema.safeParse(evidence).success).toBe(true);
  });
  it("mixed pages retain partial coverage", async () => {
    expect(
      (
        await service("mixed-scan").getDecisionEvidence(
          { ada: metadata.ada, query: "αίτηση" },
          context()
        )
      ).extraction
    ).toMatchObject({
      state: "partial",
      extractedPages: [1, 3],
      unreadablePages: [2],
      searchedPages: [1, 3],
    });
  });
  it("scan requires OCR, corrupt PDF fails and missing URL stays distinct", async () => {
    expect(
      (
        await service("unreadable").getDecisionEvidence(
          { ada: metadata.ada },
          context()
        )
      ).extraction.state
    ).toBe("ocr_needed");
    const bad = service("multipage-greek", {
      fetch: async () =>
        new Response("%PDF-broken", {
          headers: { "content-type": "application/pdf" },
        }),
    });
    expect(
      (await bad.getDecisionEvidence({ ada: metadata.ada }, context()))
        .extraction.state
    ).toBe("failed");
    const s = service();
    s.getDecisionByAda.mockResolvedValue({ ...metadata, documentUrl: "" });
    expect(
      (await s.getDecisionEvidence({ ada: metadata.ada }, context())).extraction
        .state
    ).toBe("missing");
  });
  it("metadata survives document failure and old decision fields remain", async () => {
    const s = service("multipage-greek", {
      fetch: async () => {
        throw Error("network");
      },
    });
    const tool = createDecisionTool(
      { getDecisionByAda: s.getDecisionByAda } as never,
      { evidenceService: s }
    );
    const result = await tool({ ada: metadata.ada }, {
      signal: context().signal,
    } as never);
    expect(result.structuredContent).toMatchObject({
      found: true,
      decision: {
        ada: metadata.ada,
        subject: "Synthetic",
        protocolNumber: "42",
      },
      evidence: { extraction: { state: "failed" } },
      errorCode: expect.any(String),
    });
  });
  it("document boundary failures keep typed error codes alongside found metadata", async () => {
    const s = service("multipage-greek", { limits: { maxBytes: 20 } });
    const tool = createDecisionTool(
      { getDecisionByAda: s.getDecisionByAda } as never,
      { evidenceService: s }
    );
    const result = await tool({ ada: metadata.ada }, {
      signal: context().signal,
    } as never);
    expect(result.structuredContent).toMatchObject({
      found: true,
      errorCode: "BYTE_LIMIT",
      evidence: { extraction: { state: "failed" } },
    });
  });
  it("abort immediately after metadata preserves found true and typed evidence failure", async () => {
    const controller = new AbortController();
    const s = service();
    s.getDecisionByAda.mockImplementation(async () => {
      controller.abort();
      return { ...metadata };
    });
    const tool = createDecisionTool(
      { getDecisionByAda: s.getDecisionByAda } as never,
      { evidenceService: s }
    );
    const result = await tool({ ada: metadata.ada }, {
      signal: controller.signal,
    } as never);
    expect(result.structuredContent).toMatchObject({
      found: true,
      decision: { ada: metadata.ada },
      errorCode: "ABORTED",
      evidence: { extraction: { state: "failed" } },
    });
    expect(s.fetcher).not.toHaveBeenCalled();
  });
  it("changed metadata invalidates cache and metadata failure never returns stale text", async () => {
    const s = service();
    await s.getDecisionEvidence({ ada: metadata.ada }, context());
    await s.getDecisionEvidence({ ada: metadata.ada }, context());
    expect(s.fetcher).toHaveBeenCalledTimes(1);
    expect(s.getDecisionByAda).toHaveBeenCalledTimes(2);
    s.getDecisionByAda.mockResolvedValue({ ...metadata, versionId: "2" });
    await s.getDecisionEvidence({ ada: metadata.ada }, context());
    expect(s.fetcher).toHaveBeenCalledTimes(2);
    s.getDecisionByAda.mockRejectedValue(Error("offline"));
    await expect(
      s.getDecisionEvidence({ ada: metadata.ada }, context())
    ).rejects.toThrow("offline");
  });
  it("metadata without a revision is downloaded again, statuses invalidate, and failures never reuse stale text", async () => {
    const s = service();
    s.getDecisionByAda.mockResolvedValue({
      ...metadata,
      versionId: undefined,
    } as never);
    await s.getDecisionEvidence({ ada: metadata.ada }, context());
    await s.getDecisionEvidence({ ada: metadata.ada }, context());
    expect(s.fetcher).toHaveBeenCalledTimes(2);
    s.getDecisionByAda.mockResolvedValue({ ...metadata, status: "revoked" });
    const e = await s.getDecisionEvidence({ ada: metadata.ada }, context());
    expect(e.publicationStatus).toBe("revoked");
    expect(s.fetcher).toHaveBeenCalledTimes(3);
    s.getDecisionByAda.mockResolvedValue({ ...metadata, status: "published" });
    await s.getDecisionEvidence({ ada: metadata.ada }, context());
    expect(s.fetcher).toHaveBeenCalledTimes(4);
  });
  it("checksum remains available when retrieved PDF extraction fails", async () => {
    const e = await service("multipage-greek", {
      extractor: {
        extract: async () => {
          throw Error("parse failed after retrieval");
        },
      },
    }).getDecisionEvidence({ ada: metadata.ada }, context());
    expect(e.checksum).toMatch(/^[a-f0-9]{64}$/);
  });
  it("bounds the whole download and extraction pipeline before buffering; queued abort never downloads", async () => {
    const releases: Array<() => void> = [];
    let entered = 0;
    const controlled = {
      extract: async (b: Uint8Array, c: ReturnType<typeof context>) => {
        entered++;
        await new Promise<void>((r) => releases.push(r));
        return extractor.extract(b, c);
      },
    };
    const s = service("multipage-greek", { extractor: controlled });
    s.getDecisionByAda.mockImplementation(async (ada: string) => ({
      ...metadata,
      ada,
    }));
    const a = s.getDecisionEvidence({ ada: "A" }, context());
    const b = s.getDecisionEvidence({ ada: "B" }, context());
    while (entered < 2) await new Promise((r) => setTimeout(r, 5));
    const controller = new AbortController();
    const c = s.getDecisionEvidence(
      { ada: "C" },
      { signal: controller.signal, deadlineAt: Date.now() + 5000 }
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(s.fetcher).toHaveBeenCalledTimes(2);
    controller.abort();
    expect((await c).extraction.state).toBe("failed");
    releases.forEach((r) => r());
    await Promise.all([a, b]);
    expect(s.fetcher).toHaveBeenCalledTimes(2);
  });
  it("long relevance work yields to Stop and never claims all pages searched after abort", async () => {
    const controller = new AbortController();
    const s = service("multipage-greek", {
      extractor: {
        extract: async () => ({
          totalPages: 1,
          pages: [{ page: 1, text: "άλφα ".repeat(100000) }],
        }),
      },
    });
    const timer = setTimeout(() => controller.abort(), 5);
    const evidence = await s.getDecisionEvidence(
      { ada: metadata.ada, query: "ανύπαρκτηλέξη" },
      { signal: controller.signal, deadlineAt: Date.now() + 5000 }
    );
    clearTimeout(timer);
    expect(evidence.extraction.state).toBe("failed");
    expect(evidence.extraction.searchedPages).toEqual([]);
  });
  it("two server instances share one injected evidence service cache while revalidating metadata", async () => {
    const s = service();
    const metadataSpy = vi
      .spyOn(DiavgeiaApiClient.prototype, "getDecisionByAda")
      .mockResolvedValue({ ...metadata });
    const servers = [
      new DiavgeiaMCPServer(undefined, { extractor, evidenceService: s }),
      new DiavgeiaMCPServer(undefined, { extractor, evidenceService: s }),
    ];
    try {
      for (const server of servers) {
        const registration = vi.spyOn(server.server, "registerTool");
        await server.init();
        const tool = registration.mock.calls.find(
          (call) => call[0] === "get-decision"
        )?.[2];
        expect(tool).toBeTypeOf("function");
        const result = await tool?.({ ada: metadata.ada }, {
          signal: context().signal,
        } as never);
        expect(result?.structuredContent).toMatchObject({
          found: true,
          evidence: { extraction: { state: "native" } },
        });
      }
      expect(s.fetcher).toHaveBeenCalledTimes(1);
      expect(metadataSpy).toHaveBeenCalledTimes(2);
    } finally {
      metadataSpy.mockRestore();
      for (const server of servers) await server.server.close();
    }
  });
  it("validates equivalent shared synthetic wire schema", () => {
    expect(documentEvidenceSchema.safeParse(fixture.evidence).success).toBe(
      true
    );
  });
  it("Worker explicitly reports unsupported without downloading bytes and preserves metadata", async () => {
    const s = service("multipage-greek", { extractor: workerPdfExtractor });
    const evidence = await s.getDecisionEvidence(
      { ada: metadata.ada },
      context()
    );
    expect(evidence.extraction.state).toBe("unsupported");
    expect(s.fetcher).not.toHaveBeenCalled();
    expect(evidence.checksum).toBeNull();
  });
  it("bounds excerpt input and empty relevance never claims exhaustive policy absence", async () => {
    const s = service();
    const e = await s.getDecisionEvidence(
      { ada: metadata.ada, query: "ανύπαρκτηλέξη" },
      context()
    );
    expect(e.excerpts).toEqual([]);
    expect(e.extraction.searchedPages).toEqual([1, 2, 3]);
    await expect(
      s.getDecisionEvidence({ ada: metadata.ada, maxExcerpts: 7 }, context())
    ).rejects.toThrow();
  });
});
