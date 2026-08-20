/**
 * Spark 诊断脚本共用：叠加载 env + 解析 Turso / Redis / Cosmos。
 *
 * 默认测环境（后者覆盖前者）：
 *   .env.test → .env（本地覆盖，如 External SPARK_KV / RENDER_API_KEY）
 * Admin 测环境：
 *   --env=.env.admin.test → .env.admin.test → .env
 * 生产：
 *   --env=.env.prod → .env.prod → .env
 *   --env=.env.admin.prod → .env.admin.prod → .env
 *
 * Redis：SPARK_KV → RENDER_KV → REDIS_URL*
 * （可与 TSF 共用同一实例；主应用业务 key 必须 `spark:` 前缀，见 AGENTS.md）
 * Cosmos：COSMOS_ENDPOINT / COSMOS_KEY
 * Turso（App）：TURSO_DATABASE_URL / TURSO_AUTH_TOKEN
 * Turso（Admin）：SPARK_DATABASE_* / TSF_DATABASE_*
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, "../..");

export function parseEnvFile(filePath) {
  const env = {};
  if (!existsSync(filePath)) return env;
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
    env[key] = value;
  }
  return env;
}

/** 从 argv 取 --env=；默认测环境 .env.test */
export function pickEnvOverlayFromArgv(
  argv = process.argv.slice(2),
  fallback = ".env.test",
) {
  for (const a of argv) {
    if (a.startsWith("--env=")) {
      return a.slice("--env=".length).trim() || fallback;
    }
  }
  return fallback;
}

function resolveEnvPath(root, nameOrPath) {
  if (!nameOrPath) return null;
  return isAbsolute(nameOrPath) ? nameOrPath : resolve(root, nameOrPath);
}

/**
 * @param {{
 *   root?: string,
 *   overlay?: string,
 *   applyToProcess?: boolean,
 *   argv?: string[],
 * }} [opts]
 */
export function loadStackedEnv(opts = {}) {
  const root = opts.root ?? REPO_ROOT;
  const overlayName =
    opts.overlay ??
    pickEnvOverlayFromArgv(opts.argv ?? process.argv.slice(2), ".env.test");
  const applyToProcess = opts.applyToProcess !== false;

  const files = [];
  const overlayPath = resolveEnvPath(root, overlayName);
  if (overlayPath) files.push(overlayPath);
  // .env 最后：本地覆盖优先
  files.push(resolve(root, ".env"));

  const seen = new Set();
  const uniqueFiles = [];
  for (const f of files) {
    const n = resolve(f);
    if (seen.has(n)) continue;
    seen.add(n);
    uniqueFiles.push(n);
  }

  const env = {};
  for (const f of uniqueFiles) {
    Object.assign(env, parseEnvFile(f));
  }
  for (const [k, v] of Object.entries(process.env)) {
    if (v != null && v !== "") env[k] = v;
  }

  if (applyToProcess) {
    for (const [k, v] of Object.entries(env)) {
      if (process.env[k] == null || process.env[k] === "") process.env[k] = v;
    }
  }

  return {
    env,
    files: uniqueFiles.filter((f) => existsSync(f)),
    overlay: overlayName,
  };
}

export function resolveRedisUrl(env = process.env) {
  const spark = env.SPARK_KV?.trim();
  const render = env.RENDER_KV?.trim();
  const legacy =
    env.REDIS_URL_V4?.trim() || env.REDIS_URL?.trim() || "";
  if (spark) return { url: spark, source: "SPARK_KV" };
  if (render) return { url: render, source: "RENDER_KV" };
  if (legacy) {
    return {
      url: legacy,
      source: env.REDIS_URL_V4?.trim() ? "REDIS_URL_V4" : "REDIS_URL",
    };
  }
  return { url: null, source: null };
}

export function resolveCosmos(env = process.env) {
  const endpoint = env.COSMOS_ENDPOINT?.trim() || "";
  const key = env.COSMOS_KEY?.trim() || "";
  return {
    endpoint: endpoint || null,
    key: key || null,
  };
}

export function resolveTurso(env = process.env) {
  const candidates = [
    ["TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN"],
    ["TURSO_TEST_DATABASE_URL", "TURSO_TEST_AUTH_TOKEN"],
    ["TURSO_PROD_DATABASE_URL", "TURSO_PROD_AUTH_TOKEN"],
  ];
  for (const [urlKey, tokenKey] of candidates) {
    const url = env[urlKey]?.trim();
    const authToken = env[tokenKey]?.trim();
    if (url && authToken) return { url, authToken, urlKey };
  }
  return { url: null, authToken: null, urlKey: "TURSO_DATABASE_URL" };
}

export function resolveSparkDatabase(env = process.env) {
  const url = env.SPARK_DATABASE_URL?.trim() || "";
  const authToken = env.SPARK_DATABASE_AUTH_TOKEN?.trim() || "";
  if (url && authToken) {
    return { url, authToken, urlKey: "SPARK_DATABASE_URL" };
  }
  return { url: null, authToken: null, urlKey: "SPARK_DATABASE_URL" };
}

export function resolveTsfDatabase(env = process.env) {
  const url = env.TSF_DATABASE_URL?.trim() || "";
  const authToken = env.TSF_DATABASE_AUTH_TOKEN?.trim() || "";
  if (url && authToken) {
    return { url, authToken, urlKey: "TSF_DATABASE_URL" };
  }
  return { url: null, authToken: null, urlKey: "TSF_DATABASE_URL" };
}
