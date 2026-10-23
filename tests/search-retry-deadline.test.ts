import axios, { AxiosError, type AxiosAdapter } from "axios";
import { afterEach, expect, it, vi } from "vitest";
import { DiavgeiaApiClient } from "../src/api/diavgeia.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it("does not retry when the deadline-limited wait wakes one millisecond early", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  const requests: string[] = [];
  const adapter: AxiosAdapter = async (config) => {
    requests.push(config.url ?? "");
    const response = {
      config,
      data: { decisions: [], info: { total: 0 } },
      headers: { "content-type": "application/json", "retry-after": "100" },
      status: requests.length === 1 ? 503 : 200,
      statusText: requests.length === 1 ? "Service Unavailable" : "OK",
    };
    if (response.status === 503)
      throw new AxiosError(
        "Service Unavailable",
        "ERR_BAD_RESPONSE",
        config,
        undefined,
        response
      );
    return response;
  };
  const create = axios.create;
  vi.spyOn(axios, "create").mockImplementation((config) =>
    create({ ...config, adapter })
  );
  const schedule = globalThis.setTimeout;
  vi.spyOn(globalThis, "setTimeout")
    .mockImplementationOnce((callback, ms) => schedule(callback, ms))
    // Timer scheduling and Date.now() need not agree at the millisecond boundary.
    .mockImplementationOnce((callback, ms) =>
      schedule(callback, (ms ?? 0) - 1)
    );

  const result = new DiavgeiaApiClient()
    .searchDecisions(
      { q: "synthetic" },
      { signal: new AbortController().signal, deadlineAt: 1080 }
    )
    .catch((error: unknown) => error);
  await vi.advanceTimersByTimeAsync(79);

  expect(Date.now()).toBe(1079);
  expect(requests).toEqual(["/search"]);
  expect(await result).toMatchObject({ code: "DEADLINE_EXCEEDED" });
});
