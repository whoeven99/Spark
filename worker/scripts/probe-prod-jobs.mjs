/**
 * Query prod translation_v4_jobs by ID prefix using Render worker env vars.
 * Usage: node probe-prod-jobs.mjs bfd579a3 206db22c
 */
import { CosmosClient } from "@azure/cosmos";

const RENDER_SERVICE_ID = process.env.RENDER_WORKER_SERVICE_ID?.trim() || "srv-d8sqas4vikkc73f5nbog";
const token = process.env.RENDER_API_KEY?.trim();
if (!token) {
  console.error("RENDER_API_KEY not set");
  process.exit(1);
}

const prefixes = process.argv.slice(2);
if (prefixes.length === 0) {
  console.error("Usage: node probe-prod-jobs.mjs <idPrefix> [...]");
  process.exit(1);
}

async function renderGet(path) {
  const res = await fetch(`https://api.render.com/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Render ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

const envRows = await renderGet(`/services/${RENDER_SERVICE_ID}/env-vars?limit=100`);
const env = {};
for (const row of envRows) {
  if (row?.envVar?.key) env[row.envVar.key] = row.envVar.value;
}

const endpoint = env.COSMOS_ENDPOINT?.trim();
const key = env.COSMOS_KEY?.trim();
const db = env.COSMOS_TRANSLATION_DATABASE_ID?.trim() || "translation";
const containerId = env.COSMOS_TRANSLATION_V4_JOBS_CONTAINER?.trim() || "translation_v4_jobs";

if (!endpoint || !key) {
  console.error("COSMOS env missing on Render service", RENDER_SERVICE_ID);
  process.exit(1);
}

console.log("Cosmos endpoint:", endpoint);
console.log("Container:", containerId);

const client = new CosmosClient({ endpoint, key });
const container = client.database(db).container(containerId);

for (const prefix of prefixes) {
  const { resources } = await container.items
    .query({
      query:
        "SELECT * FROM c WHERE STARTSWITH(c.id, @prefix) OR CONTAINS(c.id, @prefix) ORDER BY c.updatedAt DESC OFFSET 0 LIMIT 5",
      parameters: [{ name: "@prefix", value: prefix }],
    })
    .fetchAll();

  console.log(`\n=== ${prefix} (${resources.length} match) ===`);
  for (const j of resources) {
    console.log(
      JSON.stringify(
        {
          id: j.id,
          shop: j.shopName,
          status: j.status,
          route: `${j.source} -> ${j.target}`,
          modules: j.modules,
          errorStage: j.errorStage,
          errorMessage: j.errorMessage,
          metrics: j.metrics,
          stageTimings: j.stageTimings,
          aiModel: j.aiModel,
          updatedAt: j.updatedAt,
          blobPrefix: j.blobPrefix,
        },
        null,
        2,
      ),
    );
  }
}

// Also list recent FAILED containing either prefix
const { resources: failed } = await container.items
  .query({
    query:
      "SELECT TOP 20 c.id, c.shopName, c.status, c.errorStage, c.errorMessage, c.updatedAt FROM c WHERE c.status = 'FAILED' ORDER BY c.updatedAt DESC",
  })
  .fetchAll();

const relevant = failed.filter((j) =>
  prefixes.some((p) => j.id.includes(p)),
);
if (relevant.length) {
  console.log("\n=== FAILED scan (id contains prefix) ===");
  console.log(JSON.stringify(relevant, null, 2));
}
