import { createClient, type Client } from "@libsql/client";
import { requireEnv, getEnv } from "./env.js";

let _client: Client | null = null;

/** Spark 业务库（账户 / 订阅 / 会话等）。测/产由各 Admin 服务各自配值。 */
export function getDb(): Client {
  if (_client) return _client;

  const url = requireEnv("SPARK_DATABASE_URL");
  const authToken = requireEnv("SPARK_DATABASE_AUTH_TOKEN");
  if (!url.startsWith("libsql://")) {
    throw new Error("SPARK_DATABASE_URL 须为 libsql://…");
  }

  console.info(`[admin/db] Connecting to Spark Turso: ${url.slice(0, 40)}…`);
  _client = createClient({ url, authToken });
  return _client;
}

export function isSparkDbConfigured(): boolean {
  return Boolean(
    getEnv("SPARK_DATABASE_URL").startsWith("libsql://") &&
      getEnv("SPARK_DATABASE_AUTH_TOKEN"),
  );
}
