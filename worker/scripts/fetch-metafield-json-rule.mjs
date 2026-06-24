/**
 * Fetch METAFIELD_JSON_TRANSLATE_RULE from prod Spring Backend /bogdaconfig
 * (same source as Java ConfigRedisRepo → bogda:config hash).
 *
 * Usage:
 *   node fetch-metafield-json-rule.mjs
 *   node fetch-metafield-json-rule.mjs --redis   # try local .env Redis (usually empty for bogda:config)
 */
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import IORedis from "ioredis";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIELD = "METAFIELD_JSON_TRANSLATE_RULE";
const DEFAULT_API = "https://springbackendprod.azurewebsites.net/bogdaconfig";

function loadEnv(filePath) {
  if (!existsSync(filePath)) return;
  for (const raw of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv(resolve(__dirname, "../../.env"));

async function fetchFromSpringApi() {
  const url = process.env.SPRING_BACKEND_CONFIG_URL?.trim() || DEFAULT_API;
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const all = await res.json();
  const raw = all[FIELD];
  if (!raw) {
    throw new Error(`${FIELD} missing in ${url} (keys: ${Object.keys(all).join(", ")})`);
  }
  return { raw, parsed: JSON.parse(raw), source: url };
}

async function fetchFromRedis() {
  const url = process.env.REDIS_URL?.trim();
  let client;
  if (url) {
    client = new IORedis(url, { maxRetriesPerRequest: 1, connectTimeout: 15_000, lazyConnect: true });
  } else {
    const host = process.env.REDIS_HOSTNAME?.trim();
    const password = process.env.REDIS_PASSWORD?.trim();
    if (!host || !password) return null;
    client = new IORedis({
      host,
      port: Number(process.env.REDIS_PORT?.trim() || "6380"),
      password,
      tls: process.env.REDIS_TLS !== "false" ? {} : undefined,
      maxRetriesPerRequest: 1,
      connectTimeout: 15_000,
      lazyConnect: true,
    });
  }
  await client.connect();
  const raw = await client.hget("bogda:config", FIELD);
  await client.quit();
  if (!raw) return null;
  return { raw, parsed: JSON.parse(raw), source: "redis:bogda:config" };
}

const useRedis = process.argv.includes("--redis");

try {
  const result = useRedis ? await fetchFromRedis() : await fetchFromSpringApi();
  if (!result) {
    console.error("Not found in Redis bogda:config — use Spring API (default) instead");
    process.exit(2);
  }

  const pretty = JSON.stringify(result.parsed, null, 2);
  console.log(`Source: ${result.source}`);
  console.log(`\n=== ${FIELD} (${result.raw.length} chars) ===\n`);
  console.log(pretty);

  const jsonPath = resolve(__dirname, "../../docs/metafield-json-translate-rule.prod.json");
  writeFileSync(jsonPath, `${pretty}\n`, "utf8");
  console.log(`\nSaved: ${jsonPath}`);

  const envPath = resolve(__dirname, "../../docs/metafield-json-translate-rule.env.snippet");
  writeFileSync(
    envPath,
    `# Render Worker — optional override (code already embeds prod defaults)\nMETAFIELD_JSON_TRANSLATE_RULE=${JSON.stringify(JSON.stringify(result.parsed))}\n`,
    "utf8",
  );
  console.log(`Env snippet: ${envPath}`);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
