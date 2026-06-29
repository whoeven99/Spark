/**
 * Remove stale entries from translation v4 Redis hint queues.
 * Keeps only hints whose Cosmos job is still in the expected queued status.
 *
 * Credentials: ../.env.prod (REDIS_URL, COSMOS_*)
 *
 * Usage:
 *   node scripts/cleanup-stale-hints.mjs              # dry-run (default)
 *   node scripts/cleanup-stale-hints.mjs --apply      # rewrite queues
 *   node scripts/cleanup-stale-hints.mjs --stage init # init queue only
 */
import IORedis from "ioredis";
import { CosmosClient } from "@azure/cosmos";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const STAGE_CONFIG = {
  init: {
    key: "translate:v4:hint:init",
    expectedStatus: "INIT_QUEUED",
  },
  translate: {
    key: "translate:v4:hint:translate",
    expectedStatus: "TRANSLATE_QUEUED",
  },
  writeback: {
    key: "translate:v4:hint:writeback",
    expectedStatus: "WRITEBACK_QUEUED",
  },
  verify: {
    key: "translate:v4:hint:verify",
    expectedStatus: "VERIFY_QUEUED",
  },
};

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

function parseArgs(argv) {
  const apply = argv.includes("--apply");
  const stageIdx = argv.indexOf("--stage");
  const stage =
    stageIdx >= 0 && argv[stageIdx + 1] ? argv[stageIdx + 1].trim() : "all";
  if (stage !== "all" && !STAGE_CONFIG[stage]) {
    console.error(`Unknown --stage ${stage}. Use: init|translate|writeback|verify|all`);
    process.exit(1);
  }
  return { apply, stage };
}

function parseHint(raw, idx) {
  try {
    const hint = JSON.parse(raw);
    if (!hint?.taskId || !hint?.shopName) {
      return { idx, raw, invalid: true };
    }
    return { idx, hint, raw };
  } catch {
    return { idx, raw, invalid: true };
  }
}

async function classifyHint(container, hint, expectedStatus) {
  try {
    const { resource } = await container.item(hint.taskId, hint.shopName).read();
    if (!resource) {
      return { keep: false, reason: "missing" };
    }
    if (resource.status !== expectedStatus) {
      return { keep: false, reason: resource.status };
    }
    return { keep: true, reason: expectedStatus };
  } catch (err) {
    const code = err?.code ?? err?.statusCode;
    if (code === 404) return { keep: false, reason: "missing" };
    throw err;
  }
}

async function cleanupStage(redis, container, stageName, config, apply) {
  const { key, expectedStatus } = config;
  const len = await redis.llen(key);
  if (len === 0) {
    console.log(`[${stageName}] ${key} empty — skip`);
    return { kept: 0, dropped: 0 };
  }

  const raws = await redis.lrange(key, 0, len - 1);
  const kept = [];
  const dropped = [];

  for (const entry of raws.map(parseHint)) {
    if (entry.invalid) {
      dropped.push({ ...entry, reason: "invalid_json" });
      continue;
    }
    const verdict = await classifyHint(container, entry.hint, expectedStatus);
    if (verdict.keep) {
      kept.push(entry);
    } else {
      dropped.push({ ...entry, reason: verdict.reason });
    }
  }

  const dropByReason = {};
  for (const d of dropped) {
    dropByReason[d.reason] = (dropByReason[d.reason] || 0) + 1;
  }

  console.log(`\n=== ${stageName} ${key} ===`);
  console.log(`before=${len} keep=${kept.length} drop=${dropped.length}`);
  if (Object.keys(dropByReason).length) {
    console.log("dropByReason:", dropByReason);
  }
  if (kept.length) {
    console.log(
      "kept head:",
      kept.slice(0, 8).map((k) => ({
        taskId: k.hint.taskId,
        shop: k.hint.shopName,
      })),
    );
  }
  if (dropped.length) {
    console.log(
      "dropped head:",
      dropped.slice(0, 8).map((d) => ({
        taskId: d.hint?.taskId ?? d.raw?.slice(0, 40),
        shop: d.hint?.shopName,
        reason: d.reason,
      })),
    );
  }

  if (apply && dropped.length > 0) {
    const multi = redis.multi();
    multi.del(key);
    for (const k of kept) {
      multi.rpush(key, k.raw);
    }
    await multi.exec();
    console.log(`[${stageName}] applied — queue rewritten (${kept.length} kept)`);
  } else if (apply && dropped.length === 0) {
    console.log(`[${stageName}] nothing to clean`);
  } else if (!apply && dropped.length > 0) {
    console.log(`[${stageName}] dry-run only — re-run with --apply to rewrite`);
  }

  return { kept: kept.length, dropped: dropped.length };
}

const { apply, stage } = parseArgs(process.argv.slice(2));
const env = loadEnvProd();

const redisUrl = env.REDIS_URL?.trim();
const cosmosEndpoint = env.COSMOS_ENDPOINT?.trim();
const cosmosKey = env.COSMOS_KEY?.trim();
const dbId = env.COSMOS_TRANSLATION_DATABASE_ID?.trim() || "translation";
const containerId =
  env.COSMOS_TRANSLATION_V4_JOBS_CONTAINER?.trim() || "translation_v4_jobs";

if (!redisUrl || !cosmosEndpoint || !cosmosKey) {
  console.error("Missing REDIS_URL / COSMOS_ENDPOINT / COSMOS_KEY in .env.prod");
  process.exit(1);
}

console.log(`mode=${apply ? "APPLY" : "DRY-RUN"} stage=${stage}`);

const redis = new IORedis(redisUrl, { maxRetriesPerRequest: 2, connectTimeout: 20000 });
await redis.ping();

const cosmos = new CosmosClient({ endpoint: cosmosEndpoint, key: cosmosKey });
const container = cosmos.database(dbId).container(containerId);

const stages =
  stage === "all" ? Object.entries(STAGE_CONFIG) : [[stage, STAGE_CONFIG[stage]]];

let totalKept = 0;
let totalDropped = 0;
for (const [name, config] of stages) {
  const { kept, dropped } = await cleanupStage(redis, container, name, config, apply);
  totalKept += kept;
  totalDropped += dropped;
}

console.log(`\nTotal keep=${totalKept} drop=${totalDropped}`);
await redis.quit();
