import { createClient, type Client } from "@libsql/client";
import { requireEnv, getEnv } from "./env.js";

let _client: Client | null = null;

function resolveTursoTarget(): "prod" | "test" {
  const explicit = getEnv("TURSO_TARGET").toLowerCase();
  if (explicit === "prod" || explicit === "production") return "prod";
  if (explicit === "test" || explicit === "testing") return "test";

  const hasProd =
    getEnv("TURSO_PROD_DATABASE_URL").startsWith("libsql://");
  const hasTest =
    getEnv("TURSO_TEST_DATABASE_URL").startsWith("libsql://");

  if (hasProd && !hasTest) return "prod";
  if (hasTest && !hasProd) return "test";
  return process.env.NODE_ENV === "production" ? "prod" : "test";
}

export function getDb(): Client {
  if (_client) return _client;

  const target = resolveTursoTarget();
  const url =
    target === "prod"
      ? requireEnv("TURSO_PROD_DATABASE_URL")
      : requireEnv("TURSO_TEST_DATABASE_URL");
  const authToken =
    target === "prod"
      ? requireEnv("TURSO_PROD_AUTH_TOKEN")
      : requireEnv("TURSO_TEST_AUTH_TOKEN");

  console.info(`[admin/db] Connecting to Turso ${target}: ${url.slice(0, 40)}…`);
  _client = createClient({ url, authToken });
  return _client;
}
