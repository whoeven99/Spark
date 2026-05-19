/**
 * 解析连接哪套 Turso 库。
 * - 显式 `TURSO_TARGET` 优先。
 * - `NODE_ENV=production` 且两套 URL 均有效时，默认 prod。
 * - 仅占位 prod URL（your-prod-db 等）视为未配置。
 * - Render Test 同为 production 时，请设 `TURSO_TARGET=test` 或仅配置 `TURSO_TEST_*`。
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

function isLibsqlUrl(value: string | undefined): boolean {
  const v = normalizeEnvValue(value);
  if (!v.startsWith("libsql://")) return false;
  if (isPlaceholderTursoUrl(v)) return false;
  return true;
}

function normalizeTursoTarget(value: string | undefined): "test" | "prod" | undefined {
  const v = normalizeEnvValue(value).toLowerCase();
  if (v === "prod" || v === "production") return "prod";
  if (v === "test" || v === "testing") return "test";
  return undefined;
}

export function resolveTursoTarget(): "test" | "prod" {
  const explicit = normalizeTursoTarget(getRuntimeEnv("TURSO_TARGET"));
  if (explicit) return explicit;

  const prodConfigured = isLibsqlUrl(getRuntimeEnv("TURSO_PROD_DATABASE_URL"));
  const testConfigured = isLibsqlUrl(getRuntimeEnv("TURSO_TEST_DATABASE_URL"));

  if (prodConfigured && !testConfigured) return "prod";
  if (testConfigured && !prodConfigured) return "test";

  if (prodConfigured && testConfigured) {
    return isProductionNodeEnv() ? "prod" : "test";
  }

  // 无有效 URL：与 NODE_ENV 对齐（production → 读 TURSO_PROD_*）
  return isProductionNodeEnv() ? "prod" : "test";
}

function isProductionNodeEnv(): boolean {
  return normalizeEnvValue(process.env.NODE_ENV).toLowerCase() === "production";
}

export function readTursoCredentials(target: "test" | "prod"): {
  url: string;
  authToken: string;
  urlKey: string;
  tokenKey: string;
} {
  if (target === "prod") {
    return {
      url: getRuntimeEnv("TURSO_PROD_DATABASE_URL"),
      authToken: getRuntimeEnv("TURSO_PROD_AUTH_TOKEN"),
      urlKey: "TURSO_PROD_DATABASE_URL",
      tokenKey: "TURSO_PROD_AUTH_TOKEN",
    };
  }
  return {
    url: getRuntimeEnv("TURSO_TEST_DATABASE_URL"),
    authToken: getRuntimeEnv("TURSO_TEST_AUTH_TOKEN"),
    urlKey: "TURSO_TEST_DATABASE_URL",
    tokenKey: "TURSO_TEST_AUTH_TOKEN",
  };
}
