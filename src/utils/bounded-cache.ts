import { DOCUMENT_LIMITS } from "../config.js";
import {
  DocumentError,
  checkOperation,
  isDeadlineExceeded,
} from "../platform/pdf-extractor.js";
import type { OperationContext } from "../types/evidence.js";

type Flight<T> = {
  controller: AbortController;
  promise: Promise<T>;
  consumers: number;
};
/** LRU text cache with consumer-scoped cancellation and bounded in-flight work. */
export class BoundedCache<T> {
  private entries = new Map<
    string,
    { value: T; bytes: number; expires: number }
  >();
  private flights = new Map<string, Flight<T>>();
  private bytes = 0;
  constructor(
    private limits: { maxEntries: number; maxBytes: number; ttlMs: number }
  ) {
    if (
      !Number.isInteger(limits.maxEntries) ||
      limits.maxEntries < 1 ||
      limits.maxEntries > DOCUMENT_LIMITS.cacheEntries ||
      !Number.isInteger(limits.maxBytes) ||
      limits.maxBytes < 1 ||
      limits.maxBytes > DOCUMENT_LIMITS.cacheBytes ||
      !Number.isInteger(limits.ttlMs) ||
      limits.ttlMs < 1 ||
      limits.ttlMs > DOCUMENT_LIMITS.cacheTtlMs
    )
      throw new Error("Invalid cache limits");
  }
  get byteSize() {
    this.expire();
    return this.bytes;
  }
  get size() {
    this.expire();
    return this.entries.size;
  }
  private remove(key: string) {
    const entry = this.entries.get(key);
    if (entry) this.bytes -= entry.bytes;
    this.entries.delete(key);
  }
  private expire() {
    for (const [key, entry] of this.entries)
      if (entry.expires <= Date.now()) this.remove(key);
  }
  async getOrLoad(
    key: string,
    context: OperationContext,
    loader: (context: OperationContext) => Promise<T>,
    weight: (value: T) => number,
    options: { retain?: boolean } = {}
  ): Promise<T> {
    checkOperation(context);
    this.expire();
    // Versionless metadata can share current work without trusting completed text.
    const retain = options.retain !== false;
    const cached = retain ? this.entries.get(key) : undefined;
    if (cached) {
      this.entries.delete(key);
      this.entries.set(key, cached);
      return cached.value;
    }
    let flight = this.flights.get(key);
    if (!flight) {
      if (this.flights.size >= this.limits.maxEntries)
        throw new DocumentError("Document work queue full", "CAPACITY_LIMIT");
      const controller = new AbortController();
      const deadlineAt = Date.now() + DOCUMENT_LIMITS.deadlineMs;
      flight = {
        controller,
        consumers: 0,
        promise: Promise.resolve(undefined as T),
      };
      const current = flight;
      this.flights.set(key, current);
      // Start synchronously: subscribers can abort the underlying work immediately.
      try {
        current.promise = loader({ signal: controller.signal, deadlineAt });
      } catch (error) {
        current.promise = Promise.reject(error);
      }
      const timer = setTimeout(
        () =>
          controller.abort(
            new DocumentError("Document deadline exceeded", "DEADLINE_EXCEEDED")
          ),
        DOCUMENT_LIMITS.deadlineMs
      );
      current.promise = current.promise
        .then((value) => {
          if (retain && !controller.signal.aborted) {
            const bytes = weight(value);
            if (
              Number.isFinite(bytes) &&
              bytes >= 0 &&
              bytes <= this.limits.maxBytes
            ) {
              while (
                this.entries.size >= this.limits.maxEntries ||
                this.bytes + bytes > this.limits.maxBytes
              ) {
                const oldest = this.entries.keys().next();
                if (oldest.done) break;
                this.remove(oldest.value);
              }
              this.entries.set(key, {
                value,
                bytes,
                expires: Date.now() + this.limits.ttlMs,
              });
              this.bytes += bytes;
            }
          }
          return value;
        })
        .finally(() => {
          clearTimeout(timer);
          if (this.flights.get(key) === current) this.flights.delete(key);
        });
      // A last-consumer abort must not create an unhandled rejection.
      void current.promise.catch(() => {});
    }
    const current = flight;
    current.consumers++;
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        clearTimeout(timer);
        context.signal.removeEventListener("abort", abort);
        current.consumers--;
        if (current.consumers === 0 && this.flights.get(key) === current) {
          this.flights.delete(key);
          current.controller.abort();
        }
      };
      const finish = (action: () => void) => {
        if (settled) return;
        settled = true;
        cleanup();
        action();
      };
      const abort = () => {
        const deadline = isDeadlineExceeded(context);
        finish(() =>
          reject(
            new DocumentError(
              deadline
                ? "Document deadline exceeded"
                : "Document operation aborted",
              deadline ? "DEADLINE_EXCEEDED" : "ABORTED"
            )
          )
        );
      };
      const timer = setTimeout(
        () =>
          finish(() =>
            reject(
              new DocumentError(
                "Document deadline exceeded",
                "DEADLINE_EXCEEDED"
              )
            )
          ),
        Math.max(0, context.deadlineAt - Date.now())
      );
      context.signal.addEventListener("abort", abort, { once: true });
      current.promise.then(
        (value) => finish(() => resolve(value)),
        (error) => finish(() => reject(error))
      );
      if (context.signal.aborted || Date.now() >= context.deadlineAt) abort();
    });
  }
}
