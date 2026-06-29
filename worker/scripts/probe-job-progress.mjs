/**
 * Quick probe for a v4 job (Cosmos + Redis + blob init manifest).
 * Usage: node scripts/probe-job-progress.mjs <jobIdPrefix>
 */
import { CosmosClient } from "@azure/cosmos";
import { BlobServiceClient } from "@azure/storage-blob";
import IORedis from "ioredis";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const prefix = process.argv[2];
if (!prefix) {
  console.error("Usage: node scripts/probe-job-progress.mjs <jobIdPrefix>");
  process.exit(1);
}

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

const { resources } = await container.items
  .query({
    query: "SELECT * FROM c WHERE STARTSWITH(c.id, @p) ORDER BY c.updatedAt DESC OFFSET 0 LIMIT 1",
    parameters: [{ name: "@p", value: prefix }],
  })
  .fetchAll();

const job = resources[0];
if (!job) {
  console.error("job not found");
  process.exit(1);
}

const redis = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: 2 });
const prog = await redis.hgetall(`translate:v4:progress:${job.id}`);
const progAgeSec = prog.updatedAt
  ? ((Date.now() - Number(prog.updatedAt)) / 1000).toFixed(0)
  : "n/a";
const hbAgeSec = job.lastHeartbeat
  ? ((Date.now() - Date.parse(job.lastHeartbeat)) / 1000).toFixed(0)
  : "n/a";

console.log("=== job ===");
console.log(
  JSON.stringify(
    {
      id: job.id,
      shop: job.shopName,
      status: job.status,
      route: `${job.source} -> ${job.target}`,
      taskSource: job.taskSource,
      modules: job.modules?.length,
      limitPerType: job.limitPerType,
      claimedBy: job.claimedBy,
      lastHeartbeat: job.lastHeartbeat,
      heartbeatAgeSec: hbAgeSec,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      metrics: job.metrics,
      stageTimings: job.stageTimings,
    },
    null,
    2,
  ),
);
console.log("=== redis progress ===", prog, `(age ${progAgeSec}s)`);

const blobPrefix =
  job.blobPrefix || `tasks/v4/${job.shopName}/${job.id}`;
const conn = env.BLOB_TRANSLATE_V3_CONNECTION_STRING?.trim();
if (conn) {
  const blobClient = BlobServiceClient.fromConnectionString(conn);
  const containerName =
    env.BLOB_TRANSLATE_V3_CONTAINER?.trim() || "translation-content";
  const bc = blobClient.getContainerClient(containerName);
  const initPrefix = `${blobPrefix}/init/`;
  const modules = new Map();
  for await (const item of bc.listBlobsByHierarchy("/", { prefix: initPrefix })) {
    if (item.kind === "prefix") {
      const mod = item.name.replace(initPrefix, "").replace(/\/$/, "");
      modules.set(mod, 0);
    }
  }
  for (const mod of modules.keys()) {
    let chunks = 0;
    let items = 0;
    for await (const blob of bc.listBlobsFlat({ prefix: `${initPrefix}${mod}/` })) {
      if (blob.name.endsWith(".json")) chunks++;
    }
    modules.set(mod, chunks);
  }
  console.log("=== blob init modules (chunk files) ===");
  console.log([...modules.entries()].map(([m, c]) => `${m}: ${c} chunks`).join("\n") || "(none)");
}

await redis.quit();
