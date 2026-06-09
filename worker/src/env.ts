import { existsSync, readFileSync } from "node:fs";

/** 去掉首尾空白与成对引号 */
function normalize(value: string): string {
  let v = value.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

function maskValue(key: string, value: string): string {
  if (!value) return "(空)";
  if (/token|secret|key|password|auth/i.test(key)) {
    return `(已设置,len=${value.length})`;
  }
  return value.length > 40 ? `${value.slice(0, 40)}…` : value;
}

type EnvField = [key: string, value: string | undefined, defaultValue?: string];

function formatEnvField([key, value, defaultValue]: EnvField): string {
  if (value?.trim()) return `${key}=${maskValue(key, value)}`;
  if (defaultValue) return `${key}=(默认 ${defaultValue})`;
  return `${key}=❌ 缺失`;
}

/** 按服务分组打印诊断，ok 表示该服务至少有一种可用配置 */
function logEnvCheck(service: string, ok: boolean, fields: EnvField[]): void {
  console.info(`[worker:env]   [${ok ? "✅" : "❌"}] ${service}`);
  for (const field of fields) {
    console.info(`[worker:env]       ${formatEnvField(field)}`);
  }
}

/** 加载单个 KEY=VALUE 文件，仅设置尚为空的键（不覆盖 Render 已注入的） */
function loadEnvFile(filePath: string): { appliedCount: number; skipped: string[] } {
  let appliedCount = 0;
  const skipped: string[] = [];
  try {
    const content = readFileSync(filePath, "utf8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      if (!key) continue;
      const value = normalize(line.slice(eq + 1));
      if (process.env[key] !== undefined && process.env[key] !== "") {
        skipped.push(key);
        continue;
      }
      process.env[key] = value;
      appliedCount++;
    }
  } catch (err) {
    console.error(`[worker:env] 读取 ${filePath} 失败:`, err);
  }
  return { appliedCount, skipped };
}

const SECRET_PATHS = [
  "/etc/secrets/.env",
  "/etc/secrets/env",
  "/var/secrets/.env",
];

/** 启动时加载 Render Secret File + 打印诊断 */
export function ensureWorkerEnv(): void {
  console.info(`[worker:env] NODE_ENV=${process.env.NODE_ENV}, RENDER=${process.env.RENDER}, cwd=${process.cwd()}`);

  let anyLoaded = false;
  for (const p of SECRET_PATHS) {
    const exists = existsSync(p);
    console.info(`[worker:env] 检查 ${p}: ${exists ? "存在" : "不存在"}`);
    if (exists) {
      const { appliedCount, skipped } = loadEnvFile(p);
      if (appliedCount > 0) anyLoaded = true;
      if (skipped.length > 0) {
        console.info(`[worker:env] 跳过 ${skipped.length} 个已有键: ${skipped.join(", ")}`);
      }
    }
  }

  // 关键变量诊断（按 worker 实际读取逻辑，含 fallback）
  console.info("[worker:env] ===== 关键变量 =====");
  logEnvCheck("Cosmos", Boolean(process.env.COSMOS_ENDPOINT?.trim() && process.env.COSMOS_KEY?.trim()), [
    ["COSMOS_ENDPOINT", process.env.COSMOS_ENDPOINT],
    ["COSMOS_KEY", process.env.COSMOS_KEY],
    ["COSMOS_TRANSLATION_DATABASE_ID", process.env.COSMOS_TRANSLATION_DATABASE_ID, "translation"],
    [
      "COSMOS_TRANSLATION_V4_JOBS_CONTAINER",
      process.env.COSMOS_TRANSLATION_V4_JOBS_CONTAINER,
      "translation_v4_jobs",
    ],
  ]);
  const redisUrl = process.env.REDIS_URL?.trim();
  const redisHost =
    process.env.REDIS_HOSTNAME?.trim() ||
    process.env.REDIS_HOST?.trim() ||
    process.env.REDISCACHEHOSTNAME?.trim();
  const redisPassword =
    process.env.REDIS_PASSWORD?.trim() || process.env.REDISCACHEKEY?.trim();
  logEnvCheck("Redis", Boolean(redisUrl || (redisHost && redisPassword)), redisUrl
    ? [["REDIS_URL", redisUrl]]
    : [
        ["REDIS_HOSTNAME", process.env.REDIS_HOSTNAME],
        ["REDIS_PASSWORD", process.env.REDIS_PASSWORD],
        ["REDIS_PORT", process.env.REDIS_PORT, "6380"],
      ]);
  const blobConn = process.env.AZURE_BLOB_CONNECTION_STRING?.trim();
  logEnvCheck("Blob", Boolean(blobConn), [
    ["AZURE_BLOB_CONNECTION_STRING", blobConn],
    ["AZURE_BLOB_TRANSLATION_CONTAINER", process.env.AZURE_BLOB_TRANSLATION_CONTAINER, "translation-content"],
  ]);
  const tursoTarget = (process.env.TURSO_TARGET?.trim() || process.env.NODE_ENV || "test").toLowerCase();
  const tursoTestOk = Boolean(
    process.env.TURSO_TEST_DATABASE_URL?.trim() && process.env.TURSO_TEST_AUTH_TOKEN?.trim(),
  );
  const tursoProdOk = Boolean(
    process.env.TURSO_PROD_DATABASE_URL?.trim() && process.env.TURSO_PROD_AUTH_TOKEN?.trim(),
  );
  logEnvCheck("Turso (Session)", tursoTestOk || tursoProdOk, [
    ["TURSO_TARGET", process.env.TURSO_TARGET, tursoTarget.includes("prod") ? "prod" : "test"],
    ["TURSO_TEST_DATABASE_URL", process.env.TURSO_TEST_DATABASE_URL],
    ["TURSO_TEST_AUTH_TOKEN", process.env.TURSO_TEST_AUTH_TOKEN],
    ["TURSO_PROD_DATABASE_URL", process.env.TURSO_PROD_DATABASE_URL],
    ["TURSO_PROD_AUTH_TOKEN", process.env.TURSO_PROD_AUTH_TOKEN],
  ]);

  logEnvCheck("LLM (DeepSeek)", Boolean(process.env.DEEPSEEK_API_KEY?.trim()), [
    ["DEEPSEEK_API_KEY", process.env.DEEPSEEK_API_KEY],
    ["DEEPSEEK_BASE_URL", process.env.DEEPSEEK_BASE_URL, "https://api.deepseek.com"],
    ["DEEPSEEK_MODEL", process.env.DEEPSEEK_MODEL, "deepseek-chat"],
    ["DEEPSEEK_CONCURRENCY_LIMIT", process.env.DEEPSEEK_CONCURRENCY_LIMIT, "(auto: flash=2500, else=500)"],
    ["DEEPSEEK_INITIAL_CONCURRENCY", process.env.DEEPSEEK_INITIAL_CONCURRENCY, "(auto: min(32, 10% ceiling))"],
    ["DEEPSEEK_CONCURRENCY_UTIL", process.env.DEEPSEEK_CONCURRENCY_UTIL, "0.9"],
  ]);
  console.info(`[worker:env] process.env 总键数: ${Object.keys(process.env).length}`);
  console.info("[worker:env] =================");

  if (!anyLoaded && !process.env.COSMOS_ENDPOINT) {
    console.warn("[worker:env] ⚠️ 未从 Secret File 加载任何变量，且 COSMOS_ENDPOINT 未设置。请检查 Render Environment Groups 是否包含 Secret File（文件名需为 .env）或是否已正确链接。");
  }
}
