/**
 * Count translation_v4_jobs by status (prod via ../../.env.prod).
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CosmosClient } from "@azure/cosmos";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvProd() {
  const envPath = resolve(__dirname, "../../.env.prod");
  const env = {};
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}

const env = loadEnvProd();
const client = new CosmosClient({
  endpoint: env.COSMOS_ENDPOINT,
  key: env.COSMOS_KEY,
});
const container = client
  .database(env.COSMOS_TRANSLATION_DATABASE_ID || "translation")
  .container(env.COSMOS_TRANSLATION_V4_JOBS_CONTAINER || "translation_v4_jobs");

const statuses = [
  "INIT_QUEUED",
  "INITIALIZING",
  "TRANSLATE_QUEUED",
  "TRANSLATING",
  "WRITEBACK_QUEUED",
  "WRITEBACKING",
  "COMPLETED",
  "FAILED",
];

console.log("=== job counts by status ===");
for (const s of statuses) {
  const { resources } = await container.items
    .query({
      query: "SELECT VALUE COUNT(1) FROM c WHERE c.status = @s",
      parameters: [{ name: "@s", value: s }],
    })
    .fetchAll();
  console.log(`${s}: ${resources[0]}`);
}

const { resources: inFlight } = await container.items
  .query({
    query:
      "SELECT TOP 20 c.id, c.shopName, c.status, c.claimedBy, c.lastHeartbeat, c.updatedAt FROM c WHERE c.status IN ('INITIALIZING','TRANSLATING','WRITEBACKING') ORDER BY c.updatedAt DESC",
  })
  .fetchAll();
console.log("\n=== in-flight jobs ===");
console.log(JSON.stringify(inFlight, null, 2));

const { resources: oldestQueued } = await container.items
  .query({
    query:
      "SELECT TOP 5 c.id, c.shopName, c.status, c.updatedAt FROM c WHERE c.status = 'INIT_QUEUED' ORDER BY c.updatedAt ASC",
  })
  .fetchAll();
console.log("\n=== oldest INIT_QUEUED ===");
console.log(JSON.stringify(oldestQueued, null, 2));

const headTaskId = "202c1342-5ddc-4b35-ad3f-82a10d7d2b26";
const { resources: headJob } = await container.items
  .query({
    query: "SELECT * FROM c WHERE c.id = @id",
    parameters: [{ name: "@id", value: headTaskId }],
  })
  .fetchAll();
console.log(`\n=== head hint job ${headTaskId} ===`);
if (headJob[0]) {
  const j = headJob[0];
  console.log(
    JSON.stringify(
      {
        id: j.id,
        shop: j.shopName,
        status: j.status,
        claimedBy: j.claimedBy,
        lastHeartbeat: j.lastHeartbeat,
        updatedAt: j.updatedAt,
        errorMessage: j.errorMessage,
      },
      null,
      2,
    ),
  );
} else {
  console.log("(not found)");
}
