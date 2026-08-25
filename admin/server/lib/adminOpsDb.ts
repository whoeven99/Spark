import { createClient, type Client } from "@libsql/client";
import { requireEnv, getEnv } from "./env.js";

/**
 * Admin 运维专属库（待办 / 定价工作台配置等）。
 * 与 Spark 业务库（db.ts）分离：读 ADMIN_DATABASE_*。
 */

let _client: Client | null = null;

export function getAdminOpsDb(): Client {
  if (_client) return _client;

  const url = requireEnv("ADMIN_DATABASE_URL");
  const authToken = requireEnv("ADMIN_DATABASE_AUTH_TOKEN");
  if (!url.startsWith("libsql://")) {
    throw new Error("ADMIN_DATABASE_URL 须为 libsql://…");
  }

  console.info(`[admin/adminOpsDb] Connecting to Admin ops Turso: ${url.slice(0, 40)}…`);
  _client = createClient({ url, authToken });
  return _client;
}

export function isAdminOpsDbConfigured(): boolean {
  return Boolean(
    getEnv("ADMIN_DATABASE_URL").startsWith("libsql://") &&
      getEnv("ADMIN_DATABASE_AUTH_TOKEN"),
  );
}
