import { createClient, type Client } from "@libsql/client";
import { requireEnv, getEnv } from "./env.js";

/**
 * TSF（翻译产品）独立 Turso 库。
 * 与 Spark 主库（db.ts）分离：读 TSF_DATABASE_*，供翻译 Tab / 额度观测等。
 * 测/产由各 Admin 服务各自配值，不读 TARGET 开关。
 */

let _client: Client | null = null;

export function getTsfDb(): Client {
  if (_client) return _client;

  const url = requireEnv("TSF_DATABASE_URL");
  const authToken = requireEnv("TSF_DATABASE_AUTH_TOKEN");
  if (!url.startsWith("libsql://")) {
    throw new Error("TSF_DATABASE_URL 须为 libsql://…");
  }

  console.info(`[admin/tsfDb] Connecting to TSF Turso: ${url.slice(0, 40)}…`);
  _client = createClient({ url, authToken });
  return _client;
}

export function isTsfDbConfigured(): boolean {
  return Boolean(
    getEnv("TSF_DATABASE_URL").startsWith("libsql://") &&
      getEnv("TSF_DATABASE_AUTH_TOKEN"),
  );
}
