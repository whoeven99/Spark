/**
 * 批量恢复发版后僵死的 processing 任务（INITIALIZING / TRANSLATING / WRITING_BACK）。
 * 用法: node scripts/resume-orphaned-processing.mjs [--dry-run]
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CosmosClient } from "@azure/cosmos";
import IORedis from "ioredis";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dryRun = process.argv.includes("--dry-run");

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

const PROC_TO_QUEUED = {
  INITIALIZING: ["INIT_QUEUED", "init"],
  TRANSLATING: ["TRANSLATE_QUEUED", "translate"],
  WRITING_BACK: ["WRITEBACK_QUEUED", "writeback"],
};

const HINT_KEYS = {
  init: "translate:v4:hint:init",
  translate: "translate:v4:hint:translate",
  writeback: "translate:v4:hint:writeback",
};

const env = loadEnvProd();
const client = new CosmosClient({
  endpoint: env.COSMOS_ENDPOINT,
  key: env.COSMOS_KEY,
});
const container = client
  .database(env.COSMOS_TRANSLATION_DATABASE_ID || "translation")
  .container(env.COSMOS_TRANSLATION_V4_JOBS_CONTAINER || "translation_v4_jobs");
const redis = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: 2 });

const graceMs = Number(process.env.ORPHAN_HEARTBEAT_MS) || 30_000;
const threshold = new Date(Date.now() - graceMs).toISOString();

const { resources } = await container.items
  .query({
    query: `
      SELECT c.id, c.shopName, c.status, c.claimedBy, c.lastHeartbeat, c.updatedAt
      FROM c
      WHERE c.status IN ('INITIALIZING', 'TRANSLATING', 'WRITING_BACK')
        AND (NOT IS_DEFINED(c.lastHeartbeat) OR c.lastHeartbeat < @threshold)
    `,
    parameters: [{ name: "@threshold", value: threshold }],
  })
  .fetchAll();

console.log(
  `orphaned processing jobs (heartbeat before ${threshold}): ${resources.length}${dryRun ? " [dry-run]" : ""}`,
);

for (const job of resources) {
  const mapping = PROC_TO_QUEUED[job.status];
  if (!mapping) continue;
  const [resetStatus, hintStage] = mapping;
  console.log(
    `  ${job.id.slice(0, 8)} ${job.status} → ${resetStatus} shop=${job.shopName} hb=${job.lastHeartbeat}`,
  );
  if (dryRun) continue;

  const { resource: current } = await container.item(job.id, job.shopName).read();
  await container.item(job.id, job.shopName).replace({
    ...current,
    status: resetStatus,
    claimedBy: null,
    claimedAt: null,
    updatedAt: new Date().toISOString(),
  });
  if (hintStage) {
    await redis.rpush(
      HINT_KEYS[hintStage],
      JSON.stringify({ taskId: job.id, shopName: job.shopName }),
    );
  }
}

await redis.quit();
console.log("done");
