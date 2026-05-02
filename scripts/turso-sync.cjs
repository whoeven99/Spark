const fs = require("fs");
const path = require("path");
const { createClient } = require("@libsql/client");

function loadDotEnv(dotenvPath) {
  if (!fs.existsSync(dotenvPath)) return {};

  const content = fs.readFileSync(dotenvPath, "utf8");
  const result = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }

  return result;
}

async function main() {
  const root = process.cwd();
  const envFromFile = loadDotEnv(path.join(root, ".env"));
  const target = (process.argv[2] || "test").trim().toLowerCase();
  if (target !== "test" && target !== "prod") {
    throw new Error('仅支持环境参数 "test" 或 "prod"');
  }

  const urlKey =
    target === "prod" ? "TURSO_PROD_DATABASE_URL" : "TURSO_TEST_DATABASE_URL";
  const tokenKey =
    target === "prod" ? "TURSO_PROD_AUTH_TOKEN" : "TURSO_TEST_AUTH_TOKEN";

  const fallbackUrl =
    target === "test"
      ? process.env.TURSO_DATABASE_URL || envFromFile.TURSO_DATABASE_URL
      : undefined;
  const fallbackToken =
    target === "test"
      ? process.env.TURSO_AUTH_TOKEN || envFromFile.TURSO_AUTH_TOKEN
      : undefined;

  const url = process.env[urlKey] || envFromFile[urlKey] || fallbackUrl;
  const authToken = process.env[tokenKey] || envFromFile[tokenKey] || fallbackToken;

  if (!url || !url.startsWith("libsql://")) {
    throw new Error(
      `缺少或无效 ${urlKey}（期望类似 libsql://xxx.turso.io）`,
    );
  }
  if (!authToken || authToken === "REPLACE_ME") {
    throw new Error(`缺少或无效 ${tokenKey}`);
  }

  const sqlPath = path.join(root, "prisma", "turso-baseline.sql");
  if (!fs.existsSync(sqlPath)) {
    throw new Error(`未找到基线 SQL 文件: ${sqlPath}`);
  }
  const sql = fs.readFileSync(sqlPath, "utf8");
  const statements = sql
    .split(/;\s*(?:\r?\n|$)/g)
    .map((s) => s.trim())
    .filter(Boolean);

  const client = createClient({ url, authToken });

  async function executeWithRetry(statement, maxAttempts = 3) {
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await client.execute(statement);
      } catch (error) {
        lastError = error;
        if (attempt < maxAttempts) {
          const waitMs = attempt * 800;
          await new Promise((resolve) => setTimeout(resolve, waitMs));
        }
      }
    }
    throw lastError;
  }

  for (const statement of statements) {
    await executeWithRetry(statement);
  }

  const tables = await executeWithRetry(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
  );
  const tableNames = tables.rows.map((row) => String(row.name));

  console.log(`[turso:sync:${target}] 已执行 ${statements.length} 条 SQL`);
  console.log(`[turso:sync:${target}] 当前表: ${tableNames.join(", ") || "(none)"}`);
}

main().catch((error) => {
  const target = (process.argv[2] || "test").trim().toLowerCase();
  console.error(`[turso:sync:${target}] 失败:`, error.message || error);
  process.exit(1);
});
