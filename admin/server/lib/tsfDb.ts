import { createClient, type Client } from "@libsql/client";
import { requireEnv, getEnv } from "./env.js";
import { isProductionNodeEnv } from "./nodeEnv.js";

/**
 * TSF（TypeScriptFrontend）独立 Turso 库连接。
 * 与 Spark 主库（db.ts）不同：读独立的 TSF_TURSO_* 环境变量，
 * 供「翻译」Tab 下的 TSF 用户统计与翻译 v4 客服使用。
 */

export type TsfTursoEnv = "prod" | "test";

const _clients = new Map<TsfTursoEnv, Client>();

export function parseTsfTursoEnv(raw: unknown): TsfTursoEnv | undefined {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v === "test" || v === "testing") return "test";
  if (v === "prod" || v === "production") return "prod";
  return undefined;
}

function resolveTsfTursoTarget(): TsfTursoEnv {
  const explicit = getEnv("TSF_TURSO_TARGET").toLowerCase();
  if (explicit === "prod" || explicit === "production") return "prod";
  if (explicit === "test" || explicit === "testing") return "test";

  const hasProd = getEnv("TSF_TURSO_PROD_DATABASE_URL").startsWith("libsql://");
  const hasTest = getEnv("TSF_TURSO_TEST_DATABASE_URL").startsWith("libsql://");

  if (hasProd && !hasTest) return "prod";
  if (hasTest && !hasProd) return "test";
  return isProductionNodeEnv() ? "prod" : "test";
}

function createTsfClient(target: TsfTursoEnv): Client {
  const url =
    target === "prod"
      ? requireEnv("TSF_TURSO_PROD_DATABASE_URL")
      : requireEnv("TSF_TURSO_TEST_DATABASE_URL");
  const authToken =
    target === "prod"
      ? requireEnv("TSF_TURSO_PROD_AUTH_TOKEN")
      : requireEnv("TSF_TURSO_TEST_AUTH_TOKEN");

  console.info(`[admin/tsfDb] Connecting to TSF Turso ${target}: ${url.slice(0, 40)}…`);
  return createClient({ url, authToken });
}

export function getTsfDb(env?: TsfTursoEnv): Client {
  const target = env ?? resolveTsfTursoTarget();
  let client = _clients.get(target);
  if (!client) {
    client = createTsfClient(target);
    _clients.set(target, client);
  }
  return client;
}

/** 按请求参数解析 TSF Turso 环境；未指定时回退到服务端默认。 */
export function resolveTsfDbForRequest(rawEnv: unknown): { db: Client; env: TsfTursoEnv } {
  const env = parseTsfTursoEnv(rawEnv) ?? resolveTsfTursoTarget();
  return { db: getTsfDb(env), env };
}

export function isTsfDbConfigured(): boolean {
  return Boolean(
    getEnv("TSF_TURSO_PROD_DATABASE_URL") || getEnv("TSF_TURSO_TEST_DATABASE_URL"),
  );
}
