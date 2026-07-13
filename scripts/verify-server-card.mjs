import { readFile } from "node:fs/promises";

const cardPath = process.argv[2];

if (!cardPath) {
  throw new Error(
    "Usage: node scripts/verify-server-card.mjs <server-card.json>"
  );
}

let card;
try {
  card = JSON.parse(await readFile(cardPath, "utf8"));
} catch (error) {
  throw new Error(`Unable to read a valid JSON server card at ${cardPath}`, {
    cause: error,
  });
}

if (
  typeof card.serverInfo !== "object" ||
  card.serverInfo === null ||
  typeof card.serverInfo.name !== "string" ||
  card.serverInfo.name.length === 0
) {
  throw new Error("Server card must define a non-empty serverInfo.name");
}

if (!Array.isArray(card.tools)) {
  throw new Error("Server card must define a tools array");
}

process.stdout.write(
  `Verified Smithery server card for ${card.serverInfo.name} (${card.tools.length} tools)\n`
);
