import { type ServerResponse, createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { DiavgeiaApiClient } from "../src/api/diavgeia.js";
import { searchOutputRawSchema } from "../src/modules/search/schema.js";
import type { DiavgeiaSearchParams } from "../src/modules/search/schema.js";
import sharedFixture from "./fixtures/search-v1.json";

// Boundary fixtures are synthetic; only the ADA/type UID are public discovery controls.
const row = {
  ada: "9ΨΖΒ46ΝΚΠΔ-ΗΗΙ",
  subject: "SYNTHETIC SUBJECT",
  issueDate: 1788480000000,
  organizationId: "100081880",
  decisionTypeId: "2.4.7.1",
  unitIds: ["100038330"],
  thematicCategoryIds: ["09"],
};
const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
});
async function fixture(
  reply: (url: URL, response: ServerResponse, count: number) => void
) {
  const requests: URL[] = [];
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    requests.push(url);
    reply(url, res, requests.length);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  closers.push(() => new Promise((resolve) => server.close(() => resolve())));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    baseUrl,
    client: new DiavgeiaApiClient({
      baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
      timeout: 1000,
    }),
    requests,
  };
}
function json(response: ServerResponse, body: unknown, status = 200) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}
function envelope(
  url: URL,
  decisions: unknown[] = [row],
  total = decisions.length
) {
  const query = url.pathname.endsWith("advanced")
    ? (url.searchParams.get("q") ?? "")
    : [
        `q:"${url.searchParams.get("term")}"`,
        `organizationUid:"${url.searchParams.get("org")}"`,
        ...(url.searchParams.has("from_issue_date")
          ? [
              `issueDate:[DT(${url.searchParams.get("from_issue_date")}T00:00:00+03:00) TO DT(${url.searchParams.get("to_issue_date")}T23:59:59+03:00)]`,
            ]
          : []),
      ].join(" AND ");
  return {
    decisions,
    info: {
      query,
      page: Number(url.searchParams.get("page")),
      size: Number(url.searchParams.get("size")),
      actualSize: decisions.length,
      total,
      order: "recent",
    },
  };
}
const simple = { q: "προσλήψεις", organizationUid: "100081880", size: 1 };

describe("verified search contract", () => {
  it("simple term and exact org use supported keys, preserving returned-count total", async () => {
    const { client, requests } = await fixture((u, r) =>
      json(r, envelope(u, [row], 43066))
    );
    const result = await client.searchDecisions(simple);
    expect(requests[0].pathname).toBe("/search");
    expect(requests[0].searchParams.get("term")).toBe("προσλήψεις");
    expect(requests[0].searchParams.get("org")).toBe("100081880");
    expect(requests[0].searchParams.has("fq")).toBe(false);
    expect(requests[0].searchParams.has("q")).toBe(false);
    expect(result.total).toBe(1);
    expect(result.coverage).toMatchObject({
      contractVersion: 1,
      upstreamTotal: 43066,
      hasMore: true,
      completeness: "limited",
    });
  });
  it("advanced combines every filter, escaping literals and translating unit/type UID fields", async () => {
    const { client, requests } = await fixture((u, r) =>
      json(r, envelope(u, [], 0))
    );
    await client.searchDecisions({
      ...simple,
      q: 'ΠΕ "60"',
      rawQuery: 'ada:"9ΨΖΒ46ΝΚΠΔ-ΗΗΙ" OR ada:"SYNTHETIC"',
      subject: "SYNTHETIC SUBJECT",
      unitUid: "100038330",
      decisionType: "2.4.7.1",
      decisionTypes: ["2.4.7.1", "2.4.7.2"],
      thematicCategory: "ΑΠΑΣΧΟΛΗΣΗ ΚΑΙ ΕΡΓΑΣΙΑ",
      from_date: "2026-09-01",
      to_date: "2026-09-30",
    });
    expect(requests[0].pathname).toBe("/search/advanced");
    expect(requests[0].searchParams.get("q")).toBe(
      '(ada:"9ΨΖΒ46ΝΚΠΔ-ΗΗΙ" OR ada:"SYNTHETIC") AND (q:"ΠΕ \\"60\\"") AND (subject:"SYNTHETIC SUBJECT") AND (organizationUid:"100081880") AND (unitUid:"100038330") AND (decisionTypeUid:"2.4.7.1") AND ((decisionTypeUid:"2.4.7.1" OR decisionTypeUid:"2.4.7.2")) AND (thematicCategory:"ΑΠΑΣΧΟΛΗΣΗ ΚΑΙ ΕΡΓΑΣΙΑ") AND (issueDate:[DT(2026-09-01T00:00:00) TO DT(2026-09-30T23:59:59)])'
    );
    expect(requests[0].searchParams.has("fq")).toBe(false);
  });
  it("resolves the verified real type label to its UID, never a code-shaped label", async () => {
    const { client, requests } = await fixture((u, r) =>
      json(
        r,
        u.pathname === "/types.json"
          ? {
              decisionTypes: [
                {
                  uid: "2.4.7.1",
                  label: "ΛΟΙΠΕΣ ΑΤΟΜΙΚΕΣ ΔΙΟΙΚΗΤΙΚΕΣ ΠΡΑΞΕΙΣ",
                },
              ],
            }
          : envelope(u, [], 0)
      )
    );
    await client.searchDecisions({
      ...simple,
      decisionType: "ΛΟΙΠΕΣ ΑΤΟΜΙΚΕΣ ΔΙΟΙΚΗΤΙΚΕΣ ΠΡΑΞΕΙΣ",
      unitUid: "100038330",
    });
    const search = requests.find((u) => u.pathname.startsWith("/search"));
    expect(search?.searchParams.get("q")).toContain(
      'decisionTypeUid:"2.4.7.1"'
    );
    expect(search?.searchParams.get("q")).toContain('unitUid:"100038330"');
  });
  it("rejects unresolved type labels explicitly", async () => {
    const { client } = await fixture((u, r) =>
      json(
        r,
        u.pathname === "/types.json" ? { decisionTypes: [] } : envelope(u)
      )
    );
    await expect(
      client.searchDecisions({ ...simple, decisionType: "UNKNOWN LABEL" })
    ).rejects.toThrow(/type|τύπ/i);
  });
  it.each([
    { organizationUid: "100", ministryIdOrName: "200" },
    { decisionType: "2.4.7.1", type: "2.4.7.2" },
  ])("conflicting aliases fail explicitly: %j", async (extra) => {
    const { client } = await fixture((u, r) => json(r, envelope(u)));
    await expect(
      client.searchDecisions({ ...simple, ...extra })
    ).rejects.toThrow(/conflict|alias/i);
  });
  it.each([
    { from_date: "2026-02-30" },
    { from_date: "yesterday" },
    { page: -1 },
    { page: Number.POSITIVE_INFINITY },
    { page: 1.5 },
    { size: Number.NaN },
    { size: 0 },
    { to_date: "2026-01-01", from_date: "2026-02-01" },
  ])("invalid date/page/size is explicit: %j", async (extra) => {
    const { client } = await fixture((u, r) => json(r, envelope(u)));
    await expect(
      client.searchDecisions({ ...simple, ...extra })
    ).rejects.toThrow();
  });
  it("numeric millisecond issue dates parse into ISO date strings", async () => {
    const { client, requests } = await fixture((u, r) => json(r, envelope(u)));
    const result = await client.searchDecisions({
      ...simple,
      from_date: "1788220800000",
      to_date: "2026-09-30",
    });
    expect(requests[0].searchParams.get("from_issue_date")).toBe("2026-09-01");
    expect(requests[0].searchParams.get("to_issue_date")).toBe("2026-09-30");
    expect(result.decisions[0].issueDate).toBe("2026-09-04");
  });
  it.each([
    { size: 999, expected: "500" },
    { size: 8.9, expected: "8" },
  ])(
    "finite legacy sizes retain bounded normalization: %j",
    async ({ size, expected }) => {
      const { client, requests } = await fixture((u, r) =>
        json(r, envelope(u, [], 0))
      );
      await client.searchDecisions({ ...simple, size });
      expect(requests[0].searchParams.get("size")).toBe(expected);
    }
  );
  it("ignored organization filter is not success even under HTTP 200", async () => {
    const { client } = await fixture((_u, r) =>
      json(r, {
        decisions: [{ ...row, organizationId: "99222010" }],
        info: { total: 1, query: 'status:"Αναρτημένη"' },
      })
    );
    await expect(client.searchDecisions(simple)).rejects.toThrow(
      /filter|organization/i
    );
  });
  it("contradictory echoed date bounds are not success", async () => {
    const { client } = await fixture((u, r) =>
      json(r, {
        ...envelope(u),
        info: {
          total: 1,
          query:
            'q:"προσλήψεις" AND organizationUid:"100081880" AND issueDate:[DT(2026-09-10T00:00:00) TO DT(2026-09-20T00:00:00)]',
        },
      })
    );
    await expect(
      client.searchDecisions({
        ...simple,
        from_date: "2026-09-01",
        to_date: "2026-09-30",
      })
    ).rejects.toThrow(/filter|date/i);
  });
  it("missing echoes cannot claim completeness", async () => {
    const { client } = await fixture((_u, r) =>
      json(r, { decisions: [row], total: 1 })
    );
    const result = await client.searchDecisions(simple);
    expect(result.coverage).toBeDefined();
    expect(result.coverage?.completeness).not.toBe("complete");
    expect(result.coverage?.appliedFilters).not.toHaveProperty("q");
  });
  it("html is not empty", async () => {
    const { client } = await fixture((_u, r) => {
      r.setHeader("Content-Type", "text/html");
      r.end("<html>Maintenance</html>");
    });
    await expect(client.searchDecisions(simple)).rejects.toThrow(
      /response|JSON/i
    );
  });
  it("429 is not empty and retries at most three GET attempts", async () => {
    const { client, requests } = await fixture((_u, r) => {
      r.setHeader("Retry-After", "0");
      json(r, { error: "rate limited" }, 429);
    });
    await expect(client.searchDecisions(simple)).rejects.toThrow(/429/);
    expect(requests).toHaveLength(3);
  });
  it("valid impossible-organization empty is empty with verified coverage", async () => {
    const { client } = await fixture((u, r) => json(r, envelope(u, [], 0)));
    const result = await client.searchDecisions({
      subject: "SYNTHETIC SUBJECT",
      organizationUid: "999999999999999999",
      from_date: "2026-09-01",
      to_date: "2026-09-30",
    });
    expect(result).toMatchObject({
      decisions: [],
      total: 0,
      coverage: {
        hasMore: false,
        completeness: "complete",
        appliedFilters: { organizationUid: "999999999999999999" },
      },
    });
  });
  it("wide dates are honest: <=180-day windows, ADA deduplication and bounded fan-out", async () => {
    const { client, requests } = await fixture((u, r) =>
      json(r, envelope(u, [{ ...row, issueDate: undefined }], 4000))
    );
    const result = await client.searchDecisions({
      ...simple,
      size: 10,
      from_date: "2026-01-01",
      to_date: "2026-12-31",
    });
    expect(requests.length).toBeLessThanOrEqual(16);
    for (const from of new Set(
      requests.map((u) => u.searchParams.get("from_issue_date"))
    )) {
      expect(
        requests.filter((u) => u.searchParams.get("from_issue_date") === from)
          .length
      ).toBeLessThanOrEqual(4);
    }
    expect(result.decisions).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.coverage).toMatchObject({
      completeness: "limited",
      upstreamTotal: null,
      hasMore: true,
    });
    expect(result.coverage?.windows.length).toBeGreaterThan(1);
    for (const window of result.coverage?.windows ?? [])
      expect(
        (Date.parse(window.to) - Date.parse(window.from)) / 86400000
      ).toBeLessThan(180);
  });
  it("abort stops retries and an elapsed deadline makes no request", async () => {
    const controller = new AbortController();
    const { client, requests } = await fixture((_u, r) => {
      controller.abort();
      r.setHeader("Retry-After", "100");
      json(r, {}, 503);
    });
    await expect(
      client.searchDecisions(simple, {
        signal: controller.signal,
        deadlineAt: Date.now() + 30000,
      })
    ).rejects.toThrow();
    expect(requests).toHaveLength(1);
    const active = new AbortController();
    await expect(
      client.searchDecisions(simple, {
        signal: active.signal,
        deadlineAt: Date.now() - 1,
      })
    ).rejects.toThrow(/deadline/i);
    expect(requests).toHaveLength(1);
  });
  it("Retry-After is capped by both two seconds and the total deadline", async () => {
    const { client, requests } = await fixture((_u, r) => {
      r.setHeader("Retry-After", "100");
      json(r, {}, 503);
    });
    const start = Date.now();
    await expect(
      client.searchDecisions(simple, {
        signal: new AbortController().signal,
        deadlineAt: start + 80,
      })
    ).rejects.toThrow(/deadline/i);
    expect(Date.now() - start).toBeLessThan(500);
    expect(requests).toHaveLength(1);
  });
  it("contradictory organization echo is rejected even when returned metadata matches", async () => {
    const { client } = await fixture((_u, r) =>
      json(r, {
        decisions: [row],
        info: { total: 1, query: 'q:"προσλήψεις" AND organizationUid:"200"' },
      })
    );
    await expect(client.searchDecisions(simple)).rejects.toThrow(/filter/i);
  });
  it("an echoed OR branch cannot verify an additional keyword restriction", async () => {
    const { client } = await fixture((_u, r) =>
      json(r, {
        decisions: [row],
        info: {
          total: 1,
          query: 'q:"προσλήψεις" OR organizationUid:"100081880"',
        },
      })
    );
    const result = await client.searchDecisions(simple);
    expect(result.coverage?.completeness).not.toBe("complete");
    expect(result.coverage?.appliedFilters).not.toHaveProperty("q");
  });
  it("malformed totals do not turn nonempty rows into a complete zero-result search", async () => {
    const { client } = await fixture((u, r) => json(r, envelope(u, [row], 0)));
    await expect(
      client.searchDecisions({
        ...simple,
        from_date: "2026-09-01",
        to_date: "2026-09-30",
      })
    ).rejects.toThrow(/total|response/i);
  });
  it("requested labels retain their intent while applied filters disclose resolved UIDs", async () => {
    const { client } = await fixture((u, r) =>
      json(
        r,
        u.pathname === "/types.json"
          ? {
              decisionTypes: [
                {
                  uid: "2.4.7.1",
                  label: "ΛΟΙΠΕΣ ΑΤΟΜΙΚΕΣ ΔΙΟΙΚΗΤΙΚΕΣ ΠΡΑΞΕΙΣ",
                },
              ],
            }
          : envelope(u, [], 0)
      )
    );
    const result = await client.searchDecisions({
      ...simple,
      decisionType: "ΛΟΙΠΕΣ ΑΤΟΜΙΚΕΣ ΔΙΟΙΚΗΤΙΚΕΣ ΠΡΑΞΕΙΣ",
    });
    expect(result.coverage?.requestedFilters.decisionType).toBe(
      "ΛΟΙΠΕΣ ΑΤΟΜΙΚΕΣ ΔΙΟΙΚΗΤΙΚΕΣ ΠΡΑΞΕΙΣ"
    );
    expect(result.coverage?.appliedFilters.decisionType).toBe("2.4.7.1");
  });
  it("Retry-After above two seconds is capped rather than blocking for its full duration", async () => {
    let searches = 0;
    const { client, requests } = await fixture((u, r) => {
      if (++searches === 1) {
        r.setHeader("Retry-After", "100");
        json(r, {}, 429);
      } else json(r, envelope(u, [], 0));
    });
    const start = Date.now();
    expect((await client.searchDecisions(simple)).total).toBe(0);
    expect(requests).toHaveLength(2);
    expect(Date.now() - start).toBeLessThan(2800);
  });

  it("default submission-time clipping prevents historical completeness", async () => {
    const { client } = await fixture((u, r) => {
      const data = envelope(u, [], 0);
      data.info.query +=
        " AND submissionTimestamp:[DT(2026-04-25T00:00:00) TO DT(2026-10-22T23:59:59)]";
      json(r, data);
    });
    const result = await client.searchDecisions({
      ...simple,
      from_date: "2025-09-01",
      to_date: "2025-09-30",
    });
    expect(result.coverage?.completeness).toBe("limited");
    expect(result.coverage?.limitations.join(" ")).toMatch(/submission/i);
    expect(result.coverage?.windows[0].complete).toBe(false);
  });
  it("a page after the final result is a valid empty subset, never exhaustive", async () => {
    const { client } = await fixture((u, r) => json(r, envelope(u, [], 1)));
    const result = await client.searchDecisions({ ...simple, page: 2 });
    expect(result.total).toBe(0);
    expect(result.coverage?.completeness).not.toBe("complete");
  });
  it("an upstream response larger than the requested page cannot silently truncate into complete", async () => {
    const { client } = await fixture((u, r) =>
      json(r, envelope(u, [row, { ...row, ada: "SYNTHETIC-2" }], 2))
    );
    await expect(
      client.searchDecisions({
        ...simple,
        from_date: "2026-09-01",
        to_date: "2026-09-30",
      })
    ).rejects.toThrow(/response|size/i);
  });
  it("numeric thematic codes use the positively verified thematic UID field", async () => {
    const { client, requests } = await fixture((u, r) =>
      json(r, envelope(u, [], 0))
    );
    await client.searchDecisions({ ...simple, thematicCategory: "44" });
    expect(requests[0].searchParams.get("q")).toContain(
      'thematicCategoryUid:"44"'
    );
  });
  it("search limits can be reduced, while nonfinite or excessive bounds fail configuration", async () => {
    const { baseUrl, requests } = await fixture((u, r) =>
      json(r, envelope(u, [], 0))
    );
    const bounded = new DiavgeiaApiClient({
      baseUrl,
      searchLimits: { maxWindows: 1, maxPages: 1, maxAttempts: 1 },
    });
    const result = await bounded.searchDecisions({
      ...simple,
      from_date: "2025-01-01",
      to_date: "2026-12-31",
    });
    expect(requests).toHaveLength(1);
    expect(result.coverage?.completeness).toBe("limited");
    expect(
      () =>
        new DiavgeiaApiClient({
          searchLimits: { maxAttempts: Number.POSITIVE_INFINITY },
        })
    ).toThrow();
    expect(
      () => new DiavgeiaApiClient({ searchLimits: { maxWindows: 5 } })
    ).toThrow();
  });

  it("accepts the shared application wire v1 fixture with legacy search output fields", () => {
    const output = z.object(searchOutputRawSchema).parse(sharedFixture);
    expect(output.coverage?.contractVersion).toBe(1);
    expect(output.decisions[0].ada).toBe("TEST-ADA-1");
    expect(output.total).toBe(output.decisions.length);
    expect(output.coverage?.windows[0]).toEqual({
      from: "2026-09-01",
      to: "2026-09-30",
      complete: true,
    });
  });
  it("resolves duplicate hierarchy labels using only types allowed in decisions", async () => {
    const { client } = await fixture((u, r) =>
      json(
        r,
        u.pathname === "/types.json"
          ? {
              decisionTypes: [
                {
                  uid: "2.4.7",
                  label: "ΛΟΙΠΕΣ ΑΤΟΜΙΚΕΣ ΔΙΟΙΚΗΤΙΚΕΣ ΠΡΑΞΕΙΣ",
                  parent: null,
                  allowedInDecisions: false,
                },
                {
                  uid: "2.4.7.1",
                  label: "ΛΟΙΠΕΣ ΑΤΟΜΙΚΕΣ ΔΙΟΙΚΗΤΙΚΕΣ ΠΡΑΞΕΙΣ",
                  parent: "2.4.7",
                  allowedInDecisions: true,
                },
              ],
            }
          : envelope(u, [], 0)
      )
    );
    const result = await client.searchDecisions({
      ...simple,
      decisionType: "ΛΟΙΠΕΣ ΑΤΟΜΙΚΕΣ ΔΙΟΙΚΗΤΙΚΕΣ ΠΡΑΞΕΙΣ",
    });
    expect(result.coverage?.appliedFilters.decisionType).toBe("2.4.7.1");
  });
  it("resolves an exact ministry name once without broad inferred-organization searches", async () => {
    const { client, requests } = await fixture((u, r) =>
      json(
        r,
        u.pathname === "/organizations.json"
          ? {
              organizations: [
                {
                  uid: "100081880",
                  label: "ΥΠΟΥΡΓΕΙΟ ΠΑΙΔΕΙΑΣ",
                  latinName: "ministry-education",
                  status: "active",
                },
              ],
            }
          : envelope(u, [], 0)
      )
    );
    const result = await client.searchDecisions({
      q: "synthetic",
      subject: "SYNTHETIC SUBJECT",
      ministryIdOrName: "Υπουργείο Παιδείας",
    });
    expect(result.coverage?.requestedFilters.organizationUid).toBe(
      "Υπουργείο Παιδείας"
    );
    expect(result.coverage?.appliedFilters.organizationUid).toBe("100081880");
    const searches = requests.filter((u) => u.pathname.startsWith("/search"));
    expect(searches).toHaveLength(1);
    expect(searches[0].searchParams.get("q")).toContain(
      'organizationUid:"100081880"'
    );
  });
  it.each([
    { organizations: [] },
    {
      organizations: [
        { uid: "100", label: "SAME NAME" },
        { uid: "200", label: "SAME NAME" },
      ],
    },
  ])(
    "rejects unknown or ambiguous organization names: %j",
    async ({ organizations }) => {
      const { client } = await fixture((u, r) =>
        json(
          r,
          u.pathname === "/organizations.json"
            ? { organizations }
            : envelope(u, [], 0)
        )
      );
      await expect(
        client.searchDecisions({
          subject: "SYNTHETIC SUBJECT",
          ministryIdOrName: "SAME NAME",
        })
      ).rejects.toThrow(/organization/i);
    }
  );
});
