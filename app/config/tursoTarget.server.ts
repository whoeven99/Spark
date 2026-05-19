/**
 * 解析连接哪套 Turso 库。
 * Render Test 常为 NODE_ENV=production，若只配 TURSO_TEST_* 应走测试库，勿强制 TURSO_PROD_*。
 */
export function resolveTursoTarget(
  env: NodeJS.ProcessEnv = process.env,
): "test" | "prod" {
  const explicit = env.TURSO_TARGET?.trim().toLowerCase();
  if (explicit === "prod" || explicit === "test") {
    return explicit;
  }

  const prodConfigured = isLibsqlUrl(env.TURSO_PROD_DATABASE_URL);
  const testConfigured = isLibsqlUrl(env.TURSO_TEST_DATABASE_URL);

  if (prodConfigured && !testConfigured) return "prod";
  if (testConfigured && !prodConfigured) return "test";

  if (prodConfigured && testConfigured) {
    return env.NODE_ENV === "production" ? "prod" : "test";
  }

  return env.NODE_ENV === "production" ? "prod" : "test";
}

function isLibsqlUrl(value: string | undefined): boolean {
  return Boolean(value?.trim().startsWith("libsql://"));
}

export function getTursoEnvKeys(target: "test" | "prod"): {
  urlKey: "TURSO_TEST_DATABASE_URL" | "TURSO_PROD_DATABASE_URL";
  tokenKey: "TURSO_TEST_AUTH_TOKEN" | "TURSO_PROD_AUTH_TOKEN";
} {
  return target === "prod"
    ? {
        urlKey: "TURSO_PROD_DATABASE_URL",
        tokenKey: "TURSO_PROD_AUTH_TOKEN",
      }
    : {
        urlKey: "TURSO_TEST_DATABASE_URL",
        tokenKey: "TURSO_TEST_AUTH_TOKEN",
      };
}
