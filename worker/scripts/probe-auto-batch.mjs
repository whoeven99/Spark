/**
 * Summarize auto-translate jobs created since a UTC timestamp.
 * Usage: node scripts/probe-auto-batch.mjs [sinceIso]
 * Default since: today 12:00 UTC (= 20:00 Asia/Shanghai)
 */
import { CosmosClient } from "@azure/cosmos";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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

const AUTO = "TsFrontend-Auto";
const since =
  process.argv[2]?.trim() ||
  new Date().toISOString().slice(0, 10) + "T12:00:00.000Z";

const env = loadEnvProd();
const endpoint = env.COSMOS_ENDPOINT?.trim();
const key = env.COSMOS_KEY?.trim();
const db = env.COSMOS_TRANSLATION_DATABASE_ID?.trim() || "translation";
const containerId =
  env.COSMOS_TRANSLATION_V4_JOBS_CONTAINER?.trim() || "translation_v4_jobs";

if (!endpoint || !key) {
  console.error("COSMOS env missing in .env.prod");
  process.exit(1);
}

const client = new CosmosClient({ endpoint, key });
const container = client.database(db).container(containerId);

const { resources: jobs } = await container.items
  .query({
    query: `
      SELECT c.id, c.shopName, c.status, c.source, c.target, c.taskSource,
             c.createdAt, c.updatedAt, c.metrics, c.errorStage, c.errorMessage
      FROM c
      WHERE c.taskSource = @src AND c.createdAt >= @since
    `,
    parameters: [
      { name: "@src", value: AUTO },
      { name: "@since", value: since },
    ],
  })
  .fetchAll();

const byStatus = {};
const byShop = {};
for (const j of jobs) {
  byStatus[j.status] = (byStatus[j.status] || 0) + 1;
  byShop[j.shopName] = (byShop[j.shopName] || 0) + 1;
}

const activeStatuses = [
  "INIT_QUEUED",
  "INITIALIZING",
  "TRANSLATE_QUEUED",
  "TRANSLATING",
  "WRITEBACK_QUEUED",
  "WRITING_BACK",
];
const active = jobs.filter((j) => activeStatuses.includes(j.status));
const activeShops = [...new Set(active.map((j) => j.shopName))];
const processing = jobs.filter((j) =>
  ["INITIALIZING", "TRANSLATING", "WRITING_BACK"].includes(j.status),
);

console.log("since", since, "(20:00 CST if default)");
console.log("total auto jobs created:", jobs.length);
console.log("unique shops:", Object.keys(byShop).length);
console.log("byStatus:", JSON.stringify(byStatus, null, 2));
console.log("active jobs:", active.length, "active shops:", activeShops.length);
console.log(
  "active by stage:",
  JSON.stringify(
    active.reduce((a, j) => {
      a[j.status] = (a[j.status] || 0) + 1;
      return a;
    }, {}),
    null,
    2,
  ),
);
console.log("currently processing:", processing.length);
for (const j of processing) {
  const m = j.metrics ?? {};
  console.log(
    `  ${j.status} ${j.shopName} ${j.source}->${j.target}` +
      ` init=${m.initDone ?? 0}/${m.initTotal ?? 0}` +
      ` tr=${m.translateDone ?? 0}/${m.translateTotal ?? 0}` +
      ` wb=${m.writebackDone ?? 0}/${m.writebackTotal ?? 0}`,
  );
}

const failed = jobs.filter((j) => j.status === "FAILED");
if (failed.length) {
  console.log("\nFAILED:", failed.length);
  for (const j of failed.slice(0, 10)) {
    console.log(`  ${j.shopName} ${j.errorStage}: ${j.errorMessage?.slice(0, 120)}`);
  }
}
