import { createClient, type Client } from "@libsql/client";
import { requireEnv, getEnv } from "./env.js";
import { isProductionNodeEnv } from "./nodeEnv.js";

/**
 * TSF（TypeScriptFrontend）独立 Turso 库连接。
 * 与 Spark 主库（db.ts）不同：读独立的 TSF_TURSO_* 环境变量，
 * 供「翻译」Tab 下的 TSF 用户统计与翻译 v4 客服使用。
 */

let _client: Client | null = null;

function resolveTsfTursoTarget(): "prod" | "test" {
  const explicit = getEnv("TSF_TURSO_TARGET").toLowerCase();
  if (explicit === "prod" || explicit === "production") return "prod";
  if (explicit === "test" || explicit === "testing") return "test";

  const hasProd = getEnv("TSF_TURSO_PROD_DATABASE_URL").startsWith("libsql://");
  const hasTest = getEnv("TSF_TURSO_TEST_DATABASE_URL").startsWith("libsql://");

  if (hasProd && !hasTest) return "prod";
  if (hasTest && !hasProd) return "test";
  return isProductionNodeEnv() ? "prod" : "test";
}

export function getTsfDb(): Client {
  if (_client) return _client;

  const target = resolveTsfTursoTarget();
  const url =
    target === "prod"
      ? requireEnv("TSF_TURSO_PROD_DATABASE_URL")
      : requireEnv("TSF_TURSO_TEST_DATABASE_URL");
  const authToken =
    target === "prod"
      ? requireEnv("TSF_TURSO_PROD_AUTH_TOKEN")
      : requireEnv("TSF_TURSO_TEST_AUTH_TOKEN");

  console.info(`[admin/tsfDb] Connecting to TSF Turso ${target}: ${url.slice(0, 40)}…`);
  _client = createClient({ url, authToken });
  return _client;
}

export function isTsfDbConfigured(): boolean {
  return Boolean(
    getEnv("TSF_TURSO_PROD_DATABASE_URL") || getEnv("TSF_TURSO_TEST_DATABASE_URL"),
  );
}
