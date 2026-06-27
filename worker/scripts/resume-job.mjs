// 手动恢复一个卡住的 v4 任务（处理中状态但 worker 已死）。
// 把它重新入队（claimedBy=null）并推 Redis hint，让 live worker 立即接着跑。
//
// ⚠️ 针对生产任务：用生产的 COSMOS/REDIS 凭据运行（本地 .env 默认是 test）。
// 用法：
//   COSMOS_ENDPOINT=https://<prod>.documents.azure.com:443/ COSMOS_KEY=<prod-key> \
//   REDIS_URL=rediss://:<pwd>@<host>:6380/0 \
//   node scripts/resume-job.mjs 07d265f7
//
// 也可把生产凭据放进项目根 .env 后直接 `node scripts/resume-job.mjs 07d265f7`。

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CosmosClient } from "@azure/cosmos";
import IORedis from "ioredis";

const __dirname = dirname(fileURLToPath(import.meta.url));
function loadEnv(p) {
  if (!existsSync(p)) return;
  for (const raw of readFileSync(p, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnv(resolve(__dirname, "../../.env"));

const prefix = process.argv[2];
if (!prefix) {
  console.error("用法: node scripts/resume-job.mjs <jobId 或前缀>");
  process.exit(1);
}

const endpoint = process.env.COSMOS_ENDPOINT?.trim();
const key = process.env.COSMOS_KEY?.trim();
if (!endpoint || !key) {
  console.error("缺少 COSMOS_ENDPOINT / COSMOS_KEY");
  process.exit(1);
}
const db = process.env.COSMOS_TRANSLATION_DATABASE_ID?.trim() || "translation";
const containerId =
  process.env.COSMOS_TRANSLATION_V4_JOBS_CONTAINER?.trim() || "translation_v4_jobs";

const PROC_TO_QUEUED = {
  INITIALIZING: ["INIT_QUEUED", "init"],
  TRANSLATING: ["TRANSLATE_QUEUED", "translate"],
  WRITING_BACK: ["WRITEBACK_QUEUED", "writeback"],
  VERIFYING: ["VERIFY_QUEUED", "verify"],
  // 已是排队态也允许直接推 hint 催一下
  INIT_QUEUED: ["INIT_QUEUED", "init"],
  TRANSLATE_QUEUED: ["TRANSLATE_QUEUED", "translate"],
  WRITEBACK_QUEUED: ["WRITEBACK_QUEUED", "writeback"],
  VERIFY_QUEUED: ["VERIFY_QUEUED", "verify"],
};

const client = new CosmosClient({ endpoint, key });
const container = client.database(db).container(containerId);

const { resources } = await container.items
  .query({
    query:
      "SELECT * FROM c WHERE STARTSWITH(c.id, @p) ORDER BY c.updatedAt DESC OFFSET 0 LIMIT 5",
    parameters: [{ name: "@p", value: prefix }],
  })
  .fetchAll();

if (!resources.length) {
  console.error(`没找到任务 ${prefix}（确认连的是生产 Cosmos）`);
  process.exit(1);
}
const job = resources[0];
console.log(
  `找到任务 ${job.id} status=${job.status} claimedBy=${job.claimedBy} lastHeartbeat=${job.lastHeartbeat}`,
);
console.log("metrics:", JSON.stringify(job.metrics, null, 2));

function translateResourcesComplete(metrics) {
  const total = metrics?.translateTotal ?? metrics?.initTotal ?? 0;
  if (total <= 0) return false;
  const attempted = (metrics?.translateDone ?? 0) + (metrics?.translateFailed ?? 0);
  return attempted >= total;
}

function writebackResourceTotal(metrics) {
  if (metrics?.writebackTotal > 0) return metrics.writebackTotal;
  if (translateResourcesComplete(metrics) && metrics?.translateDone > 0) {
    return metrics.translateDone;
  }
  return metrics?.translateTotal || metrics?.initTotal || 0;
}

function writebackNeedsRetry(metrics) {
  const total = writebackResourceTotal(metrics);
  if (total <= 0) return false;
  const done = metrics?.writebackDone ?? 0;
  const failed = metrics?.writebackFailed ?? 0;
  return done < total || failed > 0;
}

let resetStatus;
let hintStage;
if (
  (job.status === "TRANSLATING" || job.status === "TRANSLATE_QUEUED") &&
  translateResourcesComplete(job.metrics) &&
  writebackNeedsRetry(job.metrics)
) {
  resetStatus = "WRITEBACK_QUEUED";
  hintStage = "writeback";
  console.log(
    `翻译已完成 (${job.metrics.translateDone}/${job.metrics.translateTotal})，推进到写回队列`,
  );
} else {
  const mapping = PROC_TO_QUEUED[job.status];
  if (!mapping) {
    console.error(`状态 ${job.status} 不是可恢复的处理中/排队态，未操作。`);
    process.exit(1);
  }
  [resetStatus, hintStage] = mapping;
}

await container.item(job.id, job.shopName).replace({
  ...job,
  status: resetStatus,
  claimedBy: null,
  claimedAt: null,
  updatedAt: new Date().toISOString(),
  ...(resetStatus === "WRITEBACK_QUEUED" && job.metrics
    ? {
        metrics: {
          ...job.metrics,
          writebackTotal: writebackResourceTotal(job.metrics),
        },
      }
    : {}),
});
console.log(`已重置 ${job.status} → ${resetStatus}, claimedBy=null`);

// 推 hint 让 worker 立即拾取（best-effort）
const url = process.env.REDIS_URL?.trim();
const host =
  process.env.REDIS_HOSTNAME?.trim() || process.env.REDIS_HOST?.trim();
const password =
  process.env.REDIS_PASSWORD?.trim() || process.env.REDISCACHEKEY?.trim();
let redis = null;
if (url) redis = new IORedis(url, { maxRetriesPerRequest: 1, lazyConnect: true });
else if (host && password)
  redis = new IORedis({
    host,
    port: Number(process.env.REDIS_PORT?.trim() || "6380"),
    password,
    tls: process.env.REDIS_TLS !== "false" ? {} : undefined,
    maxRetriesPerRequest: 1,
    lazyConnect: true,
  });

if (redis) {
  try {
    await redis.connect();
    await redis.lpush(
      `translate:v4:hint:${hintStage}`,
      JSON.stringify({ taskId: job.id, shopName: job.shopName }),
    );
    console.log(`已推 hint translate:v4:hint:${hintStage}`);
    await redis.quit();
  } catch (e) {
    console.warn("推 hint 失败（worker 仍会在下个轮询周期拾取）:", e.message);
  }
} else {
  console.log("Redis 未配置，跳过 hint（worker 会在下个轮询周期拾取）");
}
console.log("✅ 完成。worker 应很快接着写回。");
process.exit(0);
