/**
 * List translation v4 Redis hint queues (prod via ../.env.prod).
 * Usage: node scripts/probe-hint-queues.mjs
 */
import IORedis from "ioredis";
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

const HINT_KEYS = {
  init: "translate:v4:hint:init",
  translate: "translate:v4:hint:translate",
  writeback: "translate:v4:hint:writeback",
  verify: "translate:v4:hint:verify",
  analysis: "translate:v4:hint:analysis",
};

const env = loadEnvProd();
const redisUrl = env.REDIS_URL?.trim();
if (!redisUrl) {
  console.error("REDIS_URL missing in .env.prod");
  process.exit(1);
}

const redis = new IORedis(redisUrl, { maxRetriesPerRequest: 2, connectTimeout: 15000 });
await redis.ping();

for (const [stage, key] of Object.entries(HINT_KEYS)) {
  const len = await redis.llen(key);
  const items = len > 0 ? await redis.lrange(key, 0, Math.min(len - 1, 199)) : [];
  const parsed = items.map((raw, idx) => {
    try {
      return { idx, ...JSON.parse(raw) };
    } catch {
      return { idx, raw };
    }
  });
  const byShop = {};
  for (const p of parsed) {
    const shop = p.shopName || "(unknown)";
    byShop[shop] = (byShop[shop] || 0) + 1;
  }
  console.log(`--- ${stage} ${key} len=${len} ---`);
  if (parsed.length) {
    console.log("byShop:", JSON.stringify(byShop, null, 2));
    console.log("head10:", JSON.stringify(parsed.slice(0, 10), null, 2));
    if (parsed.length > 10) {
      console.log("tail5:", JSON.stringify(parsed.slice(-5), null, 2));
    }
  }
}

const autoScan = await redis.get("translate:v4:auto_scan:last_at");
console.log("--- auto_scan:last_at ---", autoScan || "(null)");

await redis.quit();
