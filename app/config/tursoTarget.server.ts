/**
 * 解析连接哪套 Turso 库。
 * Render Test 常为 NODE_ENV=production；勿因占位 prod URL 或构建时未注入 TURSO_TARGET 误连 prod。
 */

const PLACEHOLDER_URL_MARKERS = [
  "your-prod",
  "replace_me",
  "xxx.turso",
  "example.turso",
  "changeme",
] as const;

/** 去掉首尾空白与成对引号（Render 控制台偶发带入） */
export function normalizeEnvValue(value: string | undefined): string {
  if (value == null) return "";
  let v = String(value).trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

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

export function resolveTursoTarget(
  env: NodeJS.ProcessEnv = process.env,
): "test" | "prod" {
  const explicit = normalizeTursoTarget(env.TURSO_TARGET);
  if (explicit) return explicit;

  const prodConfigured = isLibsqlUrl(env.TURSO_PROD_DATABASE_URL);
  const testConfigured = isLibsqlUrl(env.TURSO_TEST_DATABASE_URL);

  if (prodConfigured && !testConfigured) return "prod";
  if (testConfigured && !prodConfigured) return "test";

  if (prodConfigured && testConfigured) {
    return env.NODE_ENV === "production" ? "prod" : "test";
  }

  // 未配置有效 URL：Test 部署默认 test，避免强依赖 prod
  return "test";
}

export function readTursoCredentials(
  target: "test" | "prod",
  env: NodeJS.ProcessEnv = process.env,
): { url: string; authToken: string; urlKey: string; tokenKey: string } {
  if (target === "prod") {
    return {
      url: normalizeEnvValue(env.TURSO_PROD_DATABASE_URL),
      authToken: normalizeEnvValue(env.TURSO_PROD_AUTH_TOKEN),
      urlKey: "TURSO_PROD_DATABASE_URL",
      tokenKey: "TURSO_PROD_AUTH_TOKEN",
    };
  }
  return {
    url: normalizeEnvValue(env.TURSO_TEST_DATABASE_URL),
    authToken: normalizeEnvValue(env.TURSO_TEST_AUTH_TOKEN),
    urlKey: "TURSO_TEST_DATABASE_URL",
    tokenKey: "TURSO_TEST_AUTH_TOKEN",
  };
}

/** @deprecated 使用 readTursoCredentials */
export function getTursoEnvKeys(target: "test" | "prod"): {
  urlKey: "TURSO_TEST_DATABASE_URL" | "TURSO_PROD_DATABASE_URL";
  tokenKey: "TURSO_TEST_AUTH_TOKEN" | "TURSO_PROD_AUTH_TOKEN";
} {
  const { urlKey, tokenKey } = readTursoCredentials(target);
  return { urlKey, tokenKey } as {
    urlKey: "TURSO_TEST_DATABASE_URL" | "TURSO_PROD_DATABASE_URL";
    tokenKey: "TURSO_TEST_AUTH_TOKEN" | "TURSO_PROD_AUTH_TOKEN";
  };
}
