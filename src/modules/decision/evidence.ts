import { z } from "zod";
import { type DocumentLimits, resolveDocumentLimits } from "../../config.js";
import {
  DocumentError,
  type PdfExtractor,
  type PdfPages,
  WorkPool,
  checkOperation,
  operationScope,
} from "../../platform/pdf-extractor.js";
import { workerPdfExtractor } from "../../platform/worker-pdf-extractor.js";
import type { DiavgeiaDecision } from "../../types/diavgeia.js";
import type {
  DocumentEvidence,
  OperationContext,
} from "../../types/evidence.js";
import { BoundedCache } from "../../utils/bounded-cache.js";
import { downloadOfficialPdf } from "../../utils/official-download.js";

export type DecisionMetadataClient = {
  getDecisionByAda(
    ada: string,
    context?: OperationContext
  ): Promise<DiavgeiaDecision>;
};
export type EvidenceInput = {
  ada: string;
  query?: string;
  maxExcerpts?: number;
};
type CachedDocument = { result: PdfPages; checksum: string; fetchedAt: string };
export type DecisionEvidenceService = ReturnType<
  typeof createDecisionEvidenceService
>;
export type DecisionEvidenceDependencies = {
  apiClient: DecisionMetadataClient;
  extractor?: PdfExtractor;
  fetch?: typeof fetch;
  limits?: Partial<DocumentLimits>;
};
const pipelinePool = new WorkPool(2, 32);
class ExtractionFailure extends DocumentError {
  constructor(
    error: unknown,
    public checksum: string,
    public fetchedAt: string
  ) {
    super(
      error instanceof Error ? error.message : "PDF extraction failed",
      error instanceof DocumentError ? error.code : "DOCUMENT_FAILED"
    );
  }
}
const inputSchema = z.object({
  ada: z.string().trim().min(1).max(200),
  query: z.string().max(500).optional(),
  maxExcerpts: z.number().int().min(1).max(6).optional(),
});
const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("el-GR")
    .replace(/ς/g, "σ");

/** Match normalized Greek with an index map; quotations remain literal slices. */
async function passages(
  result: PdfPages,
  query: string | undefined,
  count: number,
  characters: number,
  identity: string,
  context: OperationContext
): Promise<DocumentEvidence["excerpts"]> {
  const terms = [
    ...new Set(
      normalize(query ?? "")
        .split(/[^\p{L}\p{N}]+/u)
        .filter(Boolean)
    ),
  ];
  const candidates: Array<{
    page: number;
    text: string;
    score: number;
    start: number;
  }> = [];
  for (const page of result.pages) {
    if (!page.text.trim()) continue;
    checkOperation(context);
    const segments: Array<{
      original: number;
      normalized: number;
      text: string;
    }> = [];
    const pieces: string[] = [];
    let normalizedLength = 0;
    if (terms.length) {
      for (let offset = 0; offset < page.text.length; ) {
        let end = Math.min(offset + 8192, page.text.length);
        if (end < page.text.length && /[\uDC00-\uDFFF]/.test(page.text[end]))
          end--;
        const text = normalize(page.text.slice(offset, end));
        segments.push({ original: offset, normalized: normalizedLength, text });
        pieces.push(text);
        normalizedLength += text.length;
        offset = end;
        if (segments.length % 4 === 0) {
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
          checkOperation(context);
        }
      }
    }
    const normalized = pieces.join("");
    const hits: number[] = [];
    for (let index = 0; index < terms.length; index++) {
      const hit = normalized.indexOf(terms[index]);
      if (hit >= 0) hits.push(hit);
      if (index % 16 === 15) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        checkOperation(context);
      }
    }
    if (terms.length && !hits.length) continue;
    const first = hits.length ? Math.min(...hits) : 0;
    let anchor = 0;
    if (hits.length) {
      let segment = segments[0];
      for (const part of segments) {
        if (part.normalized > first) break;
        segment = part;
      }
      let position = segment.normalized;
      anchor = segment.original;
      while (position < first && anchor < page.text.length) {
        const char = String.fromCodePoint(page.text.codePointAt(anchor) ?? 0);
        position += normalize(char).length;
        anchor += char.length;
      }
    }
    let start = Math.max(0, anchor - Math.floor(characters / 4));
    // Avoid slicing surrogate pairs while keeping at most the configured characters.
    if (start > 0 && /[\uDC00-\uDFFF]/.test(page.text[start])) start--;
    let end = Math.min(page.text.length, start + characters);
    if (end < page.text.length && /[\uDC00-\uDFFF]/.test(page.text[end])) end--;
    candidates.push({
      page: page.page,
      text: page.text.slice(start, end),
      score: hits.length,
      start,
    });
  }
  return candidates
    .sort((a, b) => b.score - a.score || a.page - b.page || a.start - b.start)
    .slice(0, count)
    .map(({ page, text, start }) => ({
      id: `${identity}-p${page}-${start}`,
      page,
      text,
    }));
}
export function createDecisionEvidenceService(
  deps: DecisionEvidenceDependencies
) {
  const limits = resolveDocumentLimits(deps.limits);
  const extractor = deps.extractor ?? workerPdfExtractor;
  const localPipeline = new WorkPool(limits.concurrency, 32);
  const errors = new WeakMap<DocumentEvidence, string>();
  const cache = new BoundedCache<CachedDocument>({
    maxEntries: limits.cacheEntries,
    maxBytes: limits.cacheBytes,
    ttlMs: limits.cacheTtlMs,
  });
  async function evidenceForDecision(
    input: EvidenceInput,
    decision: DiavgeiaDecision,
    context: OperationContext
  ): Promise<DocumentEvidence> {
    const parsed = inputSchema.parse(input);
    const version = decision.versionId ?? null;
    const evidence: DocumentEvidence = {
      contractVersion: 1,
      ada: decision.ada,
      fetchedAt: new Date().toISOString(),
      version,
      checksum: null,
      publicationStatus: decision.status ?? "unknown",
      extraction: {
        state: "missing",
        totalPages: null,
        extractedPages: [],
        unreadablePages: [],
        searchedPages: [],
        limitations: [],
      },
      excerpts: [],
    };
    try {
      checkOperation(context);
      if (!decision.documentUrl) {
        evidence.extraction.limitations.push(
          "No document URL was supplied by Diavgeia."
        );
        return evidence;
      }
      if (extractor.supported === false)
        throw new DocumentError(
          "Native PDF extraction is unsupported in this Worker runtime; read the official document or use the Node service.",
          "EXTRACTION_UNSUPPORTED"
        );
      const load = async (
        shared: OperationContext
      ): Promise<CachedDocument> => {
        const releaseLocal = await localPipeline.acquire(shared);
        let releaseGlobal: (() => void) | undefined;
        try {
          releaseGlobal = await pipelinePool.acquire(shared);
          checkOperation(shared);
          const bytes = await downloadOfficialPdf(
            decision.documentUrl,
            shared,
            { fetch: deps.fetch, limits }
          );
          const checksum = Array.from(
            new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))
          )
            .map((byte) => byte.toString(16).padStart(2, "0"))
            .join("");
          const fetchedAt = new Date().toISOString();
          let result: PdfPages;
          const extraction = operationScope(shared, limits.extractionMs);
          try {
            checkOperation(extraction);
            // Await settlement rather than racing the timeout: arbitrary injected
            // promises cannot be killed, so their pipeline reservation stays held.
            // The Node extractor uses this scope to terminate its worker first.
            result = await extractor.extract(bytes, extraction);
            checkOperation(extraction);
          } catch (error) {
            let failure = error;
            try {
              checkOperation(extraction);
            } catch (boundaryError) {
              failure = boundaryError;
            }
            throw new ExtractionFailure(failure, checksum, fetchedAt);
          } finally {
            extraction.dispose();
          }
          if (
            !Number.isInteger(result.totalPages) ||
            result.totalPages < 1 ||
            result.totalPages > limits.maxPages ||
            result.pages.length !== result.totalPages ||
            result.pages.some(
              (page, index) =>
                page.page !== index + 1 || typeof page.text !== "string"
            )
          )
            throw new DocumentError("Invalid PDF page coverage");
          return { result, checksum, fetchedAt };
        } finally {
          releaseGlobal?.();
          releaseLocal();
        }
      };
      const key = JSON.stringify([
        decision.ada,
        version,
        decision.documentChecksum ?? null,
        decision.status,
        decision.documentUrl,
      ]);
      // Versionless callers share only current work: completed bytes must be
      // downloaded again because metadata cannot establish their freshness.
      const cached = await cache.getOrLoad(
        key,
        context,
        load,
        (value) => new TextEncoder().encode(JSON.stringify(value)).length,
        { retain: Boolean(version || decision.documentChecksum) }
      );
      checkOperation(context);
      evidence.checksum = cached.checksum;
      evidence.fetchedAt = cached.fetchedAt;
      const readable = cached.result.pages
        .filter((page) => page.text.trim())
        .map((page) => page.page);
      const unreadable = cached.result.pages
        .filter((page) => !page.text.trim())
        .map((page) => page.page);
      evidence.extraction = {
        state: readable.length
          ? unreadable.length
            ? "partial"
            : "native"
          : "ocr_needed",
        totalPages: cached.result.totalPages,
        extractedPages: readable,
        unreadablePages: unreadable,
        searchedPages: [],
        limitations: unreadable.length
          ? [
              "Empty or unreadable pages need OCR or manual reading; their contents were not searched.",
            ]
          : [],
      };
      evidence.excerpts = await passages(
        cached.result,
        parsed.query,
        Math.min(parsed.maxExcerpts ?? limits.maxExcerpts, limits.maxExcerpts),
        limits.excerptCharacters,
        `${evidence.ada}-${cached.checksum.slice(0, 16)}`,
        context
      );
      checkOperation(context);
      evidence.extraction.searchedPages = [...readable];
    } catch (error) {
      errors.set(
        evidence,
        error instanceof DocumentError ? error.code : "DOCUMENT_FAILED"
      );
      if (error instanceof ExtractionFailure) {
        evidence.checksum = error.checksum;
        evidence.fetchedAt = error.fetchedAt;
      }
      evidence.extraction.state =
        error instanceof DocumentError &&
        error.code === "EXTRACTION_UNSUPPORTED"
          ? "unsupported"
          : "failed";
      evidence.extraction.limitations.push(
        error instanceof Error ? error.message : "PDF extraction failed"
      );
    }
    return evidence;
  }
  return {
    evidenceForDecision,
    errorCodeFor: (evidence: DocumentEvidence) => errors.get(evidence),
    async getDecisionEvidence(input: EvidenceInput, context: OperationContext) {
      inputSchema.parse(input);
      const scope = operationScope(context, limits.deadlineMs);
      try {
        const metadata = await deps.apiClient.getDecisionByAda(
          input.ada,
          scope
        );
        return await evidenceForDecision(input, metadata, scope);
      } finally {
        scope.dispose();
      }
    },
  };
}
