/**
 * Spark App Turso 凭证：直接读 TURSO_DATABASE_URL / TURSO_AUTH_TOKEN。
 * 测/产由各部署环境各自配值，不再用 TURSO_TARGET 或 TURSO_TEST_* / TURSO_PROD_*。
 */

import { getRuntimeEnv, normalizeEnvValue } from "./runtimeEnv.server";

export { normalizeEnvValue };

const PLACEHOLDER_URL_MARKERS = [
  "your-prod",
  "replace_me",
  "xxx.turso",
  "example.turso",
  "changeme",
] as const;

function isPlaceholderTursoUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return PLACEHOLDER_URL_MARKERS.some((marker) => lower.includes(marker));
}

export function isLibsqlUrl(value: string | undefined): boolean {
  const v = normalizeEnvValue(value);
  if (!v.startsWith("libsql://")) return false;
  if (isPlaceholderTursoUrl(v)) return false;
  return true;
}

export function readTursoCredentials(): {
  url: string;
  authToken: string;
  urlKey: string;
  tokenKey: string;
} {
  return {
    url: getRuntimeEnv("TURSO_DATABASE_URL"),
    authToken: getRuntimeEnv("TURSO_AUTH_TOKEN"),
    urlKey: "TURSO_DATABASE_URL",
    tokenKey: "TURSO_AUTH_TOKEN",
  };
}
