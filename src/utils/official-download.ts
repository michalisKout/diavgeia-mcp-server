import { type DocumentLimits, resolveDocumentLimits } from "../config.js";
import {
  DocumentError,
  abortable,
  checkOperation,
  operationScope,
} from "../platform/pdf-extractor.js";
import type { OperationContext } from "../types/evidence.js";

// Exact host verified from Diavgeia metadata and live document retrieval. No suffix allowlist.
export function validateOfficialDocumentUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new DocumentError("Invalid official document URL", "UNTRUSTED_URL");
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "diavgeia.gov.gr" ||
    url.username ||
    url.password ||
    url.port
  ) {
    throw new DocumentError(
      "Document URL must use the official HTTPS host without credentials or nonstandard ports",
      "UNTRUSTED_URL"
    );
  }
  return url;
}
export async function downloadOfficialPdf(
  url: string,
  context: OperationContext,
  options: { fetch?: typeof fetch; limits?: Partial<DocumentLimits> } = {}
): Promise<Uint8Array> {
  const limits = resolveDocumentLimits(options.limits);
  const scope = operationScope(context, limits.deadlineMs);
  const fetcher = options.fetch ?? fetch;
  try {
    let current = validateOfficialDocumentUrl(url);
    for (let redirects = 0; ; redirects++) {
      let response: Response | undefined;
      for (let attempt = 0; attempt < limits.maxAttempts; attempt++) {
        checkOperation(scope);
        try {
          response = await abortable(
            fetcher(current.href, {
              redirect: "manual",
              signal: scope.signal,
              headers: { Accept: "application/pdf" },
            }),
            scope
          );
        } catch (error) {
          checkOperation(scope);
          if (attempt + 1 === limits.maxAttempts) throw error;
        }
        if (response && response.status !== 429 && response.status < 500) break;
        if (attempt + 1 === limits.maxAttempts) break;
        const retryAfter = response?.headers.get("retry-after");
        const seconds =
          retryAfter === null || retryAfter === undefined
            ? 0.1
            : Number(retryAfter);
        const wait = Number.isFinite(seconds)
          ? seconds * 1000
          : Date.parse(retryAfter ?? "") - Date.now();
        await response?.body?.cancel();
        response = undefined;
        await abortable(
          new Promise<void>((resolve) => {
            const timer = setTimeout(
              done,
              Math.min(
                limits.retryAfterMs,
                Math.max(0, Number.isFinite(wait) ? wait : 100)
              )
            );
            function done() {
              scope.signal.removeEventListener("abort", done);
              clearTimeout(timer);
              resolve();
            }
            scope.signal.addEventListener("abort", done, { once: true });
          }),
          scope
        );
      }
      checkOperation(scope);
      if (!response)
        throw new DocumentError("Document request failed", "DOCUMENT_HTTP");
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel();
        if (redirects >= limits.maxRedirects)
          throw new DocumentError(
            "Document redirect limit exceeded",
            "REDIRECT_LIMIT"
          );
        const location = response.headers.get("location");
        if (!location)
          throw new DocumentError(
            "Document redirect has no location",
            "UNTRUSTED_URL"
          );
        current = validateOfficialDocumentUrl(new URL(location, current).href);
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new DocumentError(
          `Document HTTP ${response.status}`,
          "DOCUMENT_HTTP"
        );
      }
      const type = response.headers
        .get("content-type")
        ?.split(";")[0]
        .trim()
        .toLowerCase();
      if (type !== "application/pdf" && type !== "application/octet-stream") {
        await response.body?.cancel();
        throw new DocumentError("Document is not PDF content", "INVALID_PDF");
      }
      const declared = Number(response.headers.get("content-length"));
      if (declared > limits.maxBytes) {
        await response.body?.cancel();
        throw new DocumentError("Document byte limit exceeded", "BYTE_LIMIT");
      }
      const reader = response.body?.getReader();
      if (!reader) throw new DocumentError("Missing PDF body", "INVALID_PDF");
      const chunks: Uint8Array[] = [];
      let length = 0;
      try {
        while (true) {
          checkOperation(scope);
          const { value, done } = await abortable(reader.read(), scope);
          if (done) break;
          length += value.byteLength;
          if (length > limits.maxBytes)
            throw new DocumentError(
              "Document byte limit exceeded",
              "BYTE_LIMIT"
            );
          chunks.push(value);
        }
      } catch (error) {
        await reader.cancel().catch(() => {});
        throw error;
      } finally {
        reader.releaseLock();
      }
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      if (new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-")
        throw new DocumentError("Invalid PDF signature", "INVALID_PDF");
      return bytes;
    }
  } finally {
    scope.dispose();
  }
}
