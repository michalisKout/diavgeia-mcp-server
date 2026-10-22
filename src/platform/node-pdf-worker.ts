import { createRequire } from "node:module";
import { parentPort, workerData } from "node:worker_threads";
const require = createRequire(import.meta.url);
type PdfPage = {
  getTextContent(options: {
    normalizeWhitespace: boolean;
    disableCombineTextItems: boolean;
  }): Promise<{ items: Array<{ str: string; transform: number[] }> }>;
  cleanup(): void;
};
type PdfDocument = {
  numPages: number;
  getPage(page: number): Promise<PdfPage>;
  destroy(): Promise<void>;
};
type LoadingTask = Promise<PdfDocument> & { destroy?: () => Promise<void> };
const port = (() => {
  if (!parentPort)
    throw new Error("PDF extraction must execute inside a worker thread");
  return parentPort;
})();
// Use the installed parser's PDF.js directly: enforce page count BEFORE rendering,
// keep one-based pages, and distinguish per-page failures without rewriting bytes.
const pdfjs = require("pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js") as {
  disableWorker: boolean;
  getDocument(bytes: Uint8Array): LoadingTask;
};
pdfjs.disableWorker = true;
async function extract() {
  const { bytes, maxPages, maxTextBytes } = workerData;
  const loading = pdfjs.getDocument(bytes);
  let doc: PdfDocument | undefined;
  let result: {
    totalPages: number;
    pages: Array<{ page: number; text: string }>;
  };
  try {
    doc = await loading;
    if (
      !Number.isInteger(doc.numPages) ||
      doc.numPages < 1 ||
      doc.numPages > maxPages
    )
      throw new Error("PDF page limit exceeded");
    const pages: Array<{ page: number; text: string }> = [];
    let size = 0;
    for (let page = 1; page <= doc.numPages; page++) {
      let text = "";
      let loaded: PdfPage | undefined;
      try {
        loaded = await doc.getPage(page);
        const content = await loaded.getTextContent({
          normalizeWhitespace: false,
          disableCombineTextItems: false,
        });
        let lastY: number | undefined;
        for (const item of content.items) {
          if (typeof item.str !== "string") continue;
          if (lastY !== undefined && lastY !== item.transform[5]) text += "\n";
          text += item.str;
          lastY = item.transform[5];
        }
      } catch {
        /* Unreadable pages are returned empty and surfaced in coverage. */
      } finally {
        loaded?.cleanup();
      }
      size += Buffer.byteLength(text, "utf8");
      if (size > maxTextBytes)
        throw new Error("PDF extracted text byte limit exceeded");
      pages.push({ page, text });
    }
    result = { totalPages: doc.numPages, pages };
  } finally {
    if (doc) await doc.destroy();
    else if (typeof loading.destroy === "function") await loading.destroy();
  }
  port.postMessage({ result });
}
extract().catch((error) =>
  port.postMessage({
    error: error instanceof Error ? error.message : "PDF extraction failed",
  })
);
