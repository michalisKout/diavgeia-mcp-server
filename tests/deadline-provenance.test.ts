import axios, { AxiosError, type AxiosAdapter } from "axios";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DiavgeiaApiClient } from "../src/api/diavgeia.js";
import { createDecisionTool } from "../src/modules/decision/tool.js";
import {
  WorkPool,
  abortable,
  checkOperation,
  operationScope,
} from "../src/platform/pdf-extractor.js";
import type { OperationContext } from "../src/types/evidence.js";
import { BoundedCache } from "../src/utils/bounded-cache.js";
import { downloadOfficialPdf } from "../src/utils/official-download.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
function earlyDeadlineTimer(ordinal = 1) {
  const schedule = globalThis.setTimeout;
  let scheduled = 0;
  vi.spyOn(globalThis, "setTimeout").mockImplementation((callback, ms) =>
    schedule(callback, ++scheduled === ordinal ? (ms ?? 0) - 1 : ms)
  );
}
function searchClient(mode: "retry" | "pending") {
  let requests = 0;
  const adapter: AxiosAdapter = async (config) => {
    requests++;
    if (mode === "pending")
      return new Promise((_resolve, reject) =>
        config.signal?.addEventListener?.("abort", () =>
          reject(Error("cancelled"))
        )
      );
    throw new AxiosError(
      "Service Unavailable",
      "ERR_BAD_RESPONSE",
      config,
      undefined,
      {
        config,
        data: {},
        headers: { "retry-after": "100" },
        status: 503,
        statusText: "Service Unavailable",
      }
    );
  };
  const create = axios.create;
  vi.spyOn(axios, "create").mockImplementation((config) =>
    create({ ...config, adapter })
  );
  return { client: new DiavgeiaApiClient(), requests: () => requests };
}

it.each(["retry", "pending"] as const)(
  "classifies an early owned search deadline during %s as deadline expiry",
  async (mode) => {
    earlyDeadlineTimer();
    const { client, requests } = searchClient(mode);
    const result = client
      .searchDecisions(
        { q: "synthetic" },
        { signal: new AbortController().signal, deadlineAt: 1080 }
      )
      .catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(79);
    expect(Date.now()).toBe(1079);
    expect(requests()).toBe(1);
    expect(await result).toMatchObject({ code: "DEADLINE_EXCEEDED" });
  }
);

it("preserves an inherited deadline through search's child scope", async () => {
  earlyDeadlineTimer();
  const parent = operationScope(
    { signal: new AbortController().signal, deadlineAt: 1800 },
    80
  );
  const { client } = searchClient("pending");
  const result = client
    .searchDecisions({ q: "synthetic" }, parent)
    .catch((error: unknown) => error);
  await vi.advanceTimersByTimeAsync(79);
  expect(await result).toMatchObject({ code: "DEADLINE_EXCEEDED" });
  parent.dispose();
});

it.each(["retry", "pending"] as const)(
  "keeps caller cancellation distinct from search's deadline during %s",
  async (mode) => {
    const { client, requests } = searchClient(mode);
    const caller = new AbortController();
    const result = client
      .searchDecisions(
        { q: "synthetic" },
        { signal: caller.signal, deadlineAt: 1080 }
      )
      .catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(79);
    caller.abort(Error("Caller cancelled"));
    expect(requests()).toBe(1);
    expect(await result).toMatchObject({ code: "ABORTED" });
  }
);

it("classifies an early document deadline and cancels the pending stream", async () => {
  earlyDeadlineTimer();
  let cancelled = false;
  const result = downloadOfficialPdf(
    "https://diavgeia.gov.gr/doc/SYNTHETIC",
    {
      signal: new AbortController().signal,
      deadlineAt: 1080,
    },
    {
      fetch: async () =>
        new Response(
          new ReadableStream({
            cancel() {
              cancelled = true;
            },
          }),
          { headers: { "content-type": "application/pdf" } }
        ),
    }
  ).catch((error: unknown) => error);
  await vi.advanceTimersByTimeAsync(79);
  expect(Date.now()).toBe(1079);
  expect(await result).toMatchObject({ code: "DEADLINE_EXCEEDED" });
  expect(cancelled).toBe(true);
});

it("classifies abortable's own early timer as a deadline without an enclosing scope", async () => {
  earlyDeadlineTimer();
  const result = abortable(new Promise(() => {}), {
    signal: new AbortController().signal,
    deadlineAt: 1080,
  }).catch((error: unknown) => error);
  await vi.advanceTimersByTimeAsync(79);
  expect(await result).toMatchObject({ code: "DEADLINE_EXCEEDED" });
});

it("preserves an inherited extraction deadline", async () => {
  earlyDeadlineTimer();
  const controller = new AbortController();
  const parent = operationScope(
    { signal: controller.signal, deadlineAt: 1800 },
    80
  );
  const child = operationScope(parent, 200);
  await vi.advanceTimersByTimeAsync(79);
  expect(() => checkOperation(child)).toThrow(
    expect.objectContaining({ code: "DEADLINE_EXCEEDED" })
  );
  child.dispose();
  parent.dispose();
});

it("keeps caller cancellation distinct through document scopes", () => {
  const caller = new AbortController();
  const scope = operationScope(
    { signal: caller.signal, deadlineAt: 1800 },
    200
  );
  const reason = Error("Caller cancelled");
  caller.abort(reason);
  expect(scope.signal.reason).toBe(reason);
  expect(() => checkOperation(scope)).toThrow(
    expect.objectContaining({ code: "ABORTED" })
  );
  scope.dispose();
});

it.each(["owned", "inherited"] as const)(
  "classifies the pool's %s early deadline and removes its queued reservation",
  async (mode) => {
    earlyDeadlineTimer();
    const context = { signal: new AbortController().signal, deadlineAt: 1080 };
    const scope =
      mode === "inherited" ? operationScope(context, 80) : undefined;
    const pool = new WorkPool(1);
    const release = await pool.acquire(context);
    const queued = pool
      .acquire(scope ?? context)
      .catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(79);
    expect(await queued).toMatchObject({ code: "DEADLINE_EXCEEDED" });
    release();
    // The expired queue entry must not consume the released slot.
    (await pool.acquire({ ...context, deadlineAt: 1800 }))();
    scope?.dispose();
  }
);

function pendingLoad(context: OperationContext): Promise<string> {
  return new Promise((_resolve, reject) => {
    context.signal.addEventListener("abort", () => {
      try {
        checkOperation(context);
      } catch (error) {
        reject(error);
      }
    });
  });
}

it.each(["inherited", "consumer", "shared"] as const)(
  "preserves the cache's %s deadline cause on an early timer",
  async (mode) => {
    // Without a parent scope, cache schedules its shared timer before its consumer timer.
    earlyDeadlineTimer(mode === "consumer" ? 2 : 1);
    const context = {
      signal: new AbortController().signal,
      deadlineAt: mode === "shared" ? 41000 : 1080,
    };
    const parent =
      mode === "inherited" ? operationScope(context, 80) : undefined;
    const cache = new BoundedCache<string>({
      maxEntries: 1,
      maxBytes: 10,
      ttlMs: 1000,
    });
    const result = cache
      .getOrLoad("synthetic", parent ?? context, pendingLoad, () => 1)
      .catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(mode === "shared" ? 29999 : 79);
    expect(await result).toMatchObject({ code: "DEADLINE_EXCEEDED" });
    expect(cache.size).toBe(0);
    parent?.dispose();
  }
);

it.each([
  ["metadata", "deadline"],
  ["document", "deadline"],
  ["metadata", "caller"],
  ["document", "caller"],
] as const)(
  "preserves the decision tool's %s failure caused by %s",
  async (mode, cause) => {
    if (cause === "deadline") earlyDeadlineTimer();
    const caller = new AbortController();
    const client = new DiavgeiaApiClient();
    vi.spyOn(client, "getDecisionByAda").mockImplementation(
      async (_ada, context) => {
        if (!context) throw Error("Operation context required");
        if (mode === "metadata") {
          await pendingLoad(context);
          throw Error("unreachable");
        }
        return {
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
      }
    );
    const tool = createDecisionTool(client, {
      limits: { deadlineMs: 80 },
      extractor: {
        extract: async () => ({
          totalPages: 1,
          pages: [{ page: 1, text: "Synthetic" }],
        }),
      },
      fetch: async () =>
        new Response(new ReadableStream(), {
          headers: { "content-type": "application/pdf" },
        }),
    });
    const result = tool({ ada: "SYNTHETIC" }, {
      signal: caller.signal,
    } as never);
    await vi.advanceTimersByTimeAsync(79);
    if (cause === "caller") caller.abort();
    expect((await result).structuredContent).toMatchObject({
      found: mode === "document",
      errorCode: cause === "deadline" ? "DEADLINE_EXCEEDED" : "ABORTED",
    });
  }
);
