import { Worker } from "node:worker_threads";
import { type DocumentLimits, resolveDocumentLimits } from "../config.js";
import type { OperationContext } from "../types/evidence.js";
import {
  DocumentError,
  type PdfExtractor,
  type PdfPages,
  WorkPool,
  checkOperation,
  operationScope,
} from "./pdf-extractor.js";

// Shared across server instances; a second instance cannot exceed the process cap.
const processPool = new WorkPool(2);
export function createNodePdfExtractor(
  options: {
    limits?: Partial<DocumentLimits>;
    workerUrl?: URL;
    workerFactory?: (
      url: URL,
      options: ConstructorParameters<typeof Worker>[1]
    ) => Worker;
  } = {}
): PdfExtractor {
  const limits = resolveDocumentLimits(options.limits);
  const localPool = new WorkPool(limits.concurrency);
  return {
    async extract(bytes, context) {
      if (bytes.byteLength > limits.maxBytes)
        throw new DocumentError("PDF byte limit exceeded", "BYTE_LIMIT");
      const releaseLocal = await localPool.acquire(context);
      let releaseGlobal: (() => void) | undefined;
      try {
        releaseGlobal = await processPool.acquire(context);
        checkOperation(context);
        const scope = operationScope(context, limits.extractionMs);
        try {
          return await new Promise<PdfPages>((resolve, reject) => {
            const copy = bytes.slice();
            const worker = (
              options.workerFactory ?? ((url, opts) => new Worker(url, opts))
            )(
              options.workerUrl ??
                new URL("./node-pdf-worker.js", import.meta.url),
              {
                workerData: {
                  bytes: copy,
                  maxPages: limits.maxPages,
                  maxTextBytes: limits.cacheBytes,
                },
                transferList: [copy.buffer],
                execArgv: [],
                stdout: true,
                stderr: true,
                resourceLimits: { maxOldGenerationSizeMb: 128 },
              }
            );
            // PDF.js writes some warnings to console.log. Keep JSON-RPC stdout clean
            // without touching console methods in this process or other requests.
            worker.stdout?.pipe(process.stderr, { end: false });
            worker.stderr?.pipe(process.stderr, { end: false });
            let settled = false;
            const finish = async (error?: Error, result?: PdfPages) => {
              if (settled) return;
              settled = true;
              scope.signal.removeEventListener("abort", abort);
              // Release capacity only after the worker has actually stopped.
              await worker.terminate();
              if (error) reject(error);
              else if (result) resolve(result);
              else reject(new DocumentError("PDF worker returned no pages"));
            };
            const abort = () => {
              let error: Error = new DocumentError(
                "PDF extraction deadline exceeded",
                "DEADLINE_EXCEEDED"
              );
              try {
                checkOperation(scope);
              } catch (caught) {
                error = caught as Error;
              }
              void finish(error);
            };
            worker.once(
              "message",
              (message: { error?: string; result?: PdfPages }) =>
                void finish(
                  message.error ? new DocumentError(message.error) : undefined,
                  message.result
                )
            );
            worker.once("error", (error) => void finish(error));
            worker.once("exit", (code) => {
              if (!settled)
                void finish(
                  new DocumentError(
                    `PDF worker exited before producing pages (${code})`
                  )
                );
            });
            scope.signal.addEventListener("abort", abort, { once: true });
            if (scope.signal.aborted) abort();
          });
        } finally {
          scope.dispose();
        }
      } finally {
        releaseGlobal?.();
        releaseLocal();
      }
    },
  };
}
