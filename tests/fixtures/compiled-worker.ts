import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
// Compile to a separate test directory: never rely on a stale pre-existing dist.
const root = fileURLToPath(new URL("../../", import.meta.url));
const cache = join(root, "node_modules/.cache");
mkdirSync(cache, { recursive: true });
export const compiledRoot = mkdtempSync(join(cache, "pdf-test-"));
execFileSync(
  process.execPath,
  [
    join(root, "node_modules/typescript/bin/tsc"),
    "--project",
    join(root, "tsconfig.local.json"),
    "--outDir",
    compiledRoot,
  ],
  { cwd: root, stdio: "pipe" }
);
export const workerUrl = new URL(
  `file://${join(compiledRoot, "platform/node-pdf-worker.js")}`
);
process.once("exit", () =>
  rmSync(compiledRoot, { recursive: true, force: true })
);
