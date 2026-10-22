// Test-only workerd entry: exercise the real client with a local controlled API.
import { DiavgeiaApiClient } from "../../src/api/diavgeia.js";
export { DiavgeiaMCP } from "../../src/index.js";
export default {
  async fetch(request: Request) {
    const url = new URL(request.url);
    const client = new DiavgeiaApiClient({
      baseUrl: url.searchParams.get("base") ?? "",
    });
    try {
      const operation = url.searchParams.get("operation");
      const result =
        operation === "search"
          ? await client.searchDecisions({ q: "synthetic" })
          : operation === "decision"
            ? await client.getDecisionByAda("SYNTHETIC")
            : await client.getOrganizations();
      return Response.json(result);
    } catch (error) {
      return new Response(String(error), { status: 502 });
    }
  },
};
