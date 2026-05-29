const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
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

function rebuildBaselineFromMigrations(root) {
  const baselinePath = path.join(root, "prisma", "turso-baseline.sql");
  const prismaArgs = [
    "prisma",
    "migrate",
    "diff",
    "--from-empty",
    "--to-migrations",
    "prisma/migrations",
    "--script",
  ];

  const result = spawnSync("npx", prismaArgs, {
    cwd: root,
    encoding: "utf8",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    throw new Error(
      `基于 migrations 生成 baseline 失败：${(result.stderr || result.stdout || "").trim()}`,
    );
  }

  const generatedSql = (result.stdout || "").trim();
  if (!generatedSql) {
    throw new Error("生成 baseline 失败：Prisma 未输出 SQL");
  }

  // 让 baseline 可重复执行，避免重复同步时报“已存在”
  const idempotentSql = generatedSql
    .replace(/CREATE TABLE /g, "CREATE TABLE IF NOT EXISTS ")
    .replace(/CREATE UNIQUE INDEX /g, "CREATE UNIQUE INDEX IF NOT EXISTS ")
    .replace(/CREATE INDEX /g, "CREATE INDEX IF NOT EXISTS ");

  const content = `-- Auto-generated from prisma/migrations by scripts/turso-sync.cjs\n-- Do not edit manually unless necessary.\n\n${idempotentSql}\n`;
  fs.writeFileSync(baselinePath, content, "utf8");

  return baselinePath;
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

  const url = process.env[urlKey] || envFromFile[urlKey];
  const authToken = process.env[tokenKey] || envFromFile[tokenKey];

  if (!url || !url.startsWith("libsql://")) {
    throw new Error(
      `缺少或无效 ${urlKey}（期望类似 libsql://xxx.turso.io）`,
    );
  }
  if (!authToken || authToken === "REPLACE_ME") {
    throw new Error(`缺少或无效 ${tokenKey}`);
  }

  const sqlPath = rebuildBaselineFromMigrations(root);
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

  for (const seedFile of [
    "billing-plan-catalog-seed.sql",
    "token-billing-rule-seed.sql",
  ]) {
    const seedPath = path.join(root, "prisma", seedFile);
    if (!fs.existsSync(seedPath)) continue;
    const seedSql = fs.readFileSync(seedPath, "utf8");
    const seedStatements = seedSql
      .split(/;\s*(?:\r?\n|$)/g)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const statement of seedStatements) {
      await executeWithRetry(statement);
    }
    console.log(
      `[turso:sync:${target}] 已执行 ${seedFile} 种子 ${seedStatements.length} 条`,
    );
  }

  const tables = await executeWithRetry(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
  );
  const tableNames = tables.rows.map((row) => String(row.name));

  console.log(`[turso:sync:${target}] 已执行 ${statements.length} 条 SQL`);
  console.log(`[turso:sync:${target}] 当前表: ${tableNames.join(", ") || "(none)"}`);
  console.log(`[turso:sync:${target}] baseline 已刷新: prisma/turso-baseline.sql`);
}

main().catch((error) => {
  const target = (process.argv[2] || "test").trim().toLowerCase();
  console.error(`[turso:sync:${target}] 失败:`, error.message || error);
  process.exit(1);
});
