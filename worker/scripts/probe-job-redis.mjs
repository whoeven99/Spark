/**
 * Probe prod job Cosmos + Redis progress by id prefix.
 * Usage: RENDER_API_KEY=... node scripts/probe-job-redis.mjs 8554fef3
 */
import { CosmosClient } from "@azure/cosmos";
import IORedis from "ioredis";

const token = process.env.RENDER_API_KEY?.trim();
const prefix = process.argv[2];
if (!token || !prefix) {
  console.error("Usage: RENDER_API_KEY=... node scripts/probe-job-redis.mjs <idPrefix>");
  process.exit(1);
}

async function renderGet(path) {
  const res = await fetch(`https://api.render.com/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Render ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

function envFromRows(rows, serviceId) {
  const env = {};
  for (const row of rows) {
    if (row?.envVar?.key) env[row.envVar.key] = row.envVar.value;
  }
  return env;
}

const [tsfEnvRows, workerEnvRows] = await Promise.all([
  renderGet("/services/srv-csp2931u0jms738sfmc0/env-vars?limit=100"),
  renderGet("/services/srv-d8sqas4vikkc73f5nbog/env-vars?limit=100"),
]);
const tsfEnv = envFromRows(tsfEnvRows);
const workerEnv = envFromRows(workerEnvRows);

const endpoint = tsfEnv.COSMOS_ENDPOINT_V4?.trim() || workerEnv.COSMOS_ENDPOINT?.trim();
const cosmosKey = tsfEnv.COSMOS_KEY_V4?.trim() || workerEnv.COSMOS_KEY?.trim();
const db = tsfEnv.COSMOS_TRANSLATION_DATABASE_ID_V4?.trim() || "translation";
const containerId =
  tsfEnv.COSMOS_TRANSLATION_V4_JOBS_CONTAINER_V4?.trim() || "translation_v4_jobs";

if (!endpoint || !cosmosKey) {
  console.error("Missing prod Cosmos credentials from Render env");
  process.exit(1);
}

const client = new CosmosClient({ endpoint, key: cosmosKey });
const container = client.database(db).container(containerId);
const { resources } = await container.items
  .query({
    query:
      "SELECT * FROM c WHERE STARTSWITH(c.id, @prefix) ORDER BY c.updatedAt DESC OFFSET 0 LIMIT 3",
    parameters: [{ name: "@prefix", value: prefix }],
  })
  .fetchAll();

if (!resources.length) {
  console.error("No job found for prefix", prefix);
  process.exit(1);
}

const job = resources[0];
console.log("=== Cosmos job ===");
console.log(
  JSON.stringify(
    {
      id: job.id,
      shop: job.shopName,
      status: job.status,
      claimedBy: job.claimedBy,
      lastHeartbeat: job.lastHeartbeat,
      updatedAt: job.updatedAt,
      errorStage: job.errorStage,
      errorMessage: job.errorMessage,
      metrics: job.metrics,
      stageTimings: job.stageTimings,
      blobPrefix: job.blobPrefix,
    },
    null,
    2,
  ),
);

const redisUrl =
  tsfEnv.REDIS_URL_V4?.trim() ||
  tsfEnv.REDIS_URL?.trim() ||
  workerEnv.REDIS_URL?.trim();
if (!redisUrl) {
  console.warn("No REDIS_URL — skip Redis");
  process.exit(0);
}

const redis = new IORedis(redisUrl, { maxRetriesPerRequest: 1, lazyConnect: true });
await redis.connect();
const prog = await redis.hgetall(`translate:v4:progress:${job.id}`);
const ctrl = await redis.hgetall(`translate:v4:control:${job.id}`);
console.log("\n=== Redis progress ===");
console.log(prog);
if (Object.keys(ctrl).length) {
  console.log("\n=== Redis control ===");
  console.log(ctrl);
}
await redis.quit();
