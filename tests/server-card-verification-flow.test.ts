import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { SMITHERY_SERVER_CARD } from "../src/server-card.js";

const execFileAsync = promisify(execFile);
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

async function verifyServerCard(card: unknown) {
  const directory = await mkdtemp(join(tmpdir(), "diavgeia-server-card-"));
  temporaryDirectories.push(directory);
  const cardPath = join(directory, "server-card.json");
  await writeFile(cardPath, JSON.stringify(card));

  return execFileAsync("node", ["scripts/verify-server-card.mjs", cardPath], {
    cwd: process.cwd(),
  });
}

describe("Smithery deployment verification flow", () => {
  it("accepts the server card advertised by the Worker", async () => {
    const result = await verifyServerCard(SMITHERY_SERVER_CARD);

    expect(result.stdout).toContain("diavgeia-mcp-server");
  });
});
