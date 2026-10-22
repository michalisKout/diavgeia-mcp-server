import type { OperationContext } from "../types/evidence.js";
export type PdfPages = {
  totalPages: number;
  pages: Array<{ page: number; text: string }>;
};
export interface PdfExtractor {
  readonly supported?: boolean;
  extract(bytes: Uint8Array, context: OperationContext): Promise<PdfPages>;
}
export class DocumentError extends Error {
  constructor(
    message: string,
    public readonly code = "DOCUMENT_FAILED"
  ) {
    super(message);
    this.name = "DocumentError";
  }
}
export function checkOperation(context: OperationContext): void {
  if (Date.now() >= context.deadlineAt)
    throw new DocumentError("Document deadline exceeded", "DEADLINE_EXCEEDED");
  if (context.signal.aborted)
    throw new DocumentError("Document operation aborted", "ABORTED");
}
/** Caller owns cleanup. The timer propagates a deadline to fetch and workers. */
export function operationScope(context: OperationContext, maxMs: number) {
  const controller = new AbortController();
  const deadlineAt = Math.min(context.deadlineAt, Date.now() + maxMs);
  const abort = () => controller.abort();
  context.signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, Math.max(0, deadlineAt - Date.now()));
  if (context.signal.aborted || Date.now() >= deadlineAt) abort();
  return {
    signal: controller.signal,
    deadlineAt,
    dispose() {
      clearTimeout(timer);
      context.signal.removeEventListener("abort", abort);
    },
  };
}
export function abortable<T>(
  promise: Promise<T>,
  context: OperationContext
): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      cleanup();
      try {
        checkOperation(context);
      } catch (error) {
        reject(error);
        return;
      }
      reject(new DocumentError("Document operation aborted", "ABORTED"));
    };
    const cleanup = () => {
      clearTimeout(timer);
      context.signal.removeEventListener("abort", abort);
    };
    const timer = setTimeout(
      abort,
      Math.max(0, context.deadlineAt - Date.now())
    );
    context.signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      }
    );
    if (context.signal.aborted || Date.now() >= context.deadlineAt) abort();
  });
}

/** FIFO capacity reservation; queued cancellation never starts the task. */
export class WorkPool {
  private active = 0;
  private queue: Array<() => void> = [];
  constructor(
    private capacity: number,
    private maxWaiting = 32
  ) {}
  async acquire(context: OperationContext): Promise<() => void> {
    checkOperation(context);
    if (this.active >= this.capacity) {
      if (this.queue.length >= this.maxWaiting)
        throw new DocumentError("Document work queue full", "CAPACITY_LIMIT");
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          clearTimeout(timer);
          context.signal.removeEventListener("abort", abort);
        };
        const ready = () => {
          cleanup();
          resolve();
        };
        const abort = () => {
          cleanup();
          this.queue = this.queue.filter((task) => task !== ready);
          try {
            checkOperation(context);
          } catch (error) {
            reject(error);
            return;
          }
          reject(new DocumentError("Document operation aborted", "ABORTED"));
        };
        const timer = setTimeout(
          abort,
          Math.max(0, context.deadlineAt - Date.now())
        );
        this.queue.push(ready);
        context.signal.addEventListener("abort", abort, { once: true });
        if (context.signal.aborted) abort();
      });
    } else {
      this.active++;
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = this.queue.shift();
      if (next) next();
      else this.active--;
    };
  }
}
