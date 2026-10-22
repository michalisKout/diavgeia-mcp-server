import axios, { AxiosError, type AxiosAdapter } from "axios";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DiavgeiaApiClient } from "../src/api/diavgeia.js";
import {
  abortable,
  checkOperation,
  operationScope,
} from "../src/platform/pdf-extractor.js";
import { downloadOfficialPdf } from "../src/utils/official-download.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
function earlyDeadlineTimer() {
  const schedule = globalThis.setTimeout;
  vi.spyOn(globalThis, "setTimeout").mockImplementationOnce((callback, ms) =>
    schedule(callback, (ms ?? 0) - 1)
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
