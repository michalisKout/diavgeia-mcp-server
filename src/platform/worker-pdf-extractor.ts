import { DocumentError, type PdfExtractor } from "./pdf-extractor.js";
/**
 * The installed pdf-parse 1.x bundles CommonJS PDF.js with synchronous parsing
 * and Node filesystem requires. Cloudflare's request isolate has neither Node
 * worker_threads nor an API to terminate only this CPU task on Stop/deadline.
 * Running it here would falsely promise cancellable bounded extraction.
 */
export const workerPdfExtractor: PdfExtractor = {
  supported: false,
  async extract() {
    throw new DocumentError(
      "Native PDF extraction is unsupported in this Worker runtime; use the official document link or the Node service.",
      "EXTRACTION_UNSUPPORTED"
    );
  },
};
