import { readFileSync } from "node:fs";
import { Worker } from "node:worker_threads";
import { describe, expect, it, vi } from "vitest";
import { DOCUMENT_LIMITS } from "../src/config.js";
import { createDecisionEvidenceService } from "../src/modules/decision/evidence.js";
import { createNodePdfExtractor } from "../src/platform/node-pdf-extractor.js";
import type { PdfExtractor, PdfPages } from "../src/platform/pdf-extractor.js";
import type { OperationContext } from "../src/types/evidence.js";
import { workerUrl } from "./fixtures/compiled-worker.js";

const pdf = new Uint8Array(
  readFileSync(new URL("./fixtures/multipage-greek.pdf", import.meta.url))
);
const pages: PdfPages = {
  totalPages: 1,
  pages: [{ page: 1, text: "Συνθετικό κείμενο." }],
};
const context = (
  ms = 2000,
  signal = new AbortController().signal
): OperationContext => ({ signal, deadlineAt: Date.now() + ms });
function service(extractor: PdfExtractor, limits = {}) {
  const fetcher = vi.fn(
    async () =>
      new Response(pdf, { headers: { "content-type": "application/pdf" } })
  );
  return {
    fetcher,
    ...createDecisionEvidenceService({
      extractor,
      limits,
      fetch: fetcher,
      apiClient: {
        getDecisionByAda: async (ada) => ({
          ada,
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
        }),
      },
    }),
  };
}
const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

describe("service extraction phase deadlines", () => {
  it("passes a reduced phase deadline and rejects a result from an extractor that ignores its abort", async () => {
    let remaining = Number.POSITIVE_INFINITY;
    let phaseSignal: AbortSignal | undefined;
    let completed = false;
    const s = service(
      {
        extract: async (_bytes, phase) => {
          remaining = phase.deadlineAt - Date.now();
          phaseSignal = phase.signal;
          await sleep(40);
          completed = true;
          return pages;
        },
      },
      { extractionMs: 5 }
    );
    const evidence = await s.getDecisionEvidence({ ada: "REDUCED" }, context());
    expect(remaining).toBeLessThanOrEqual(5);
    expect(phaseSignal?.aborted).toBe(true);
    expect(completed).toBe(true);
    expect(evidence.extraction.state).toBe("failed");
    expect(s.errorCodeFor(evidence)).toBe("DEADLINE_EXCEEDED");
    expect(evidence.checksum).toMatch(/^[a-f0-9]{64}$/);
  });
  it("keeps pipeline capacity until uncooperative work settles after its phase expires", async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started = 0;
    let firstSignal: AbortSignal | undefined;
    let firstSettled = false;
    const s = service(
      {
        extract: async (_bytes, phase) => {
          started++;
          if (started === 1) {
            firstSignal = phase.signal;
            await gate;
          }
          return pages;
        },
      },
      { extractionMs: 15, concurrency: 1 }
    );
    const first = s
      .getDecisionEvidence({ ada: "CAPACITY-A" }, context())
      .then((e) => {
        firstSettled = true;
        return e;
      });
    let second: ReturnType<typeof s.getDecisionEvidence> | undefined;
    try {
      await vi.waitFor(() => expect(started).toBe(1));
      await sleep(25);
      second = s.getDecisionEvidence({ ada: "CAPACITY-B" }, context());
      await sleep(20);
      expect(firstSignal?.aborted).toBe(true);
      expect(firstSettled).toBe(false);
      expect(s.fetcher).toHaveBeenCalledTimes(1);
      expect(started).toBe(1);
    } finally {
      release();
    }
    expect((await first).extraction.state).toBe("failed");
    expect((await second)?.extraction.state).toBe("native");
    expect(started).toBe(2);
  });
  it("keeps normal extraction successful under the default phase bound", async () => {
    let remaining = Number.POSITIVE_INFINITY;
    let phaseSignal: AbortSignal | undefined;
    const s = service({
      extract: async (_bytes, phase) => {
        remaining = phase.deadlineAt - Date.now();
        phaseSignal = phase.signal;
        await sleep(5);
        return pages;
      },
    });
    expect(
      (await s.getDecisionEvidence({ ada: "DEFAULT" }, context())).extraction
        .state
    ).toBe("native");
    expect(remaining).toBeGreaterThan(0);
    expect(remaining).toBeLessThanOrEqual(DOCUMENT_LIMITS.extractionMs);
    expect(phaseSignal?.aborted).toBe(false);
  });
  it("a service-only lower bound hard-terminates the real Node extractor worker before capacity is released", async () => {
    let worker: Worker | undefined;
    const node = createNodePdfExtractor({
      workerUrl,
      workerFactory: (url, options) => {
        worker = new Worker(
          new URL("data:text/javascript,while(true){}"),
          options
        );
        return worker;
      },
    });
    const s = service(node, { extractionMs: 40, concurrency: 1 });
    const evidence = await s.getDecisionEvidence(
      { ada: "NODE-LOWER" },
      context(1000)
    );
    expect(evidence.extraction.state).toBe("failed");
    expect(s.errorCodeFor(evidence)).toBe("DEADLINE_EXCEEDED");
    expect(worker?.threadId).toBe(-1);
  });
  it("an earlier parent deadline aborts phase work and waits for native worker termination", async () => {
    let worker: Worker | undefined;
    let phaseSignal: AbortSignal | undefined;
    const node = createNodePdfExtractor({
      workerUrl,
      workerFactory: (url, options) => {
        worker = new Worker(
          new URL("data:text/javascript,while(true){}"),
          options
        );
        return worker;
      },
    });
    const s = service(
      {
        extract: (bytes, phase) => {
          phaseSignal = phase.signal;
          return node.extract(bytes, phase);
        },
      },
      { extractionMs: 1000, concurrency: 1 }
    );
    const evidence = await s.getDecisionEvidence(
      { ada: "PARENT" },
      context(80)
    );
    expect(evidence.extraction.state).toBe("failed");
    expect(s.errorCodeFor(evidence)).toBe("DEADLINE_EXCEEDED");
    await vi.waitFor(() => expect(worker?.threadId).toBe(-1));
    expect(phaseSignal?.aborted).toBe(true);
  });
});
