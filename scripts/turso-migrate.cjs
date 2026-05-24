/**
 * 对 Turso 做 Prisma 风格增量迁移：维护 _prisma_migrations，只执行未应用的 migration.sql。
 *
 * 说明：Prisma CLI 的 `migrate deploy` 在 provider=sqlite 时要求 DATABASE_URL 为 file:，
 * 不能直接连 libsql://。本脚本用 @libsql/client 执行 SQL，并写入 _prisma_migrations。
 *
 * 用法：
 *   npm run turso:migrate:test          # 应用未执行的 migration
 *   npm run turso:migrate:test -- --baseline  # 仅标记已全部应用（曾用 turso:sync 建库时）
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { createClient } = require("@libsql/client");

const PRISMA_MIGRATIONS_DDL = `
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id"                    TEXT PRIMARY KEY NOT NULL,
    "checksum"              TEXT NOT NULL,
    "finished_at"           DATETIME,
    "migration_name"        TEXT NOT NULL,
    "logs"                  TEXT,
    "rolled_back_at"        DATETIME,
    "started_at"            DATETIME NOT NULL,
    "applied_steps_count"   INTEGER NOT NULL DEFAULT 0
);
`;

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

function listMigrations(migrationsDir) {
  if (!fs.existsSync(migrationsDir)) return [];
  return fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .map((name) => ({
      name,
      sqlPath: path.join(migrationsDir, name, "migration.sql"),
    }))
    .filter((m) => fs.existsSync(m.sqlPath));
}

function checksumSql(sql) {
  return crypto.createHash("sha256").update(sql, "utf8").digest("hex");
}

function splitStatements(sql) {
  return sql
    .split(/;\s*(?:\r?\n|$)/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function executeWithRetry(client, statement, maxAttempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await client.execute(statement);
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, attempt * 800));
      }
    }
  }
  throw lastError;
}

const SATELLITE_SESSION_TABLE = "Session_generate_description";

async function tableExists(client, tableName) {
  const res = await client.execute({
    sql: "SELECT 1 AS n FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
    args: [tableName],
  });
  return res.rows.length > 0;
}

/** 卫星 Session 表已合并或从未存在时，跳过 INSERT…FROM。 */
async function shouldSkipMigrationStatement(client, statement) {
  const referencesSatellite = new RegExp(
    `FROM\\s+"${SATELLITE_SESSION_TABLE}"`,
    "i",
  ).test(statement);
  if (!referencesSatellite) return false;
  if (await tableExists(client, SATELLITE_SESSION_TABLE)) return false;
  console.log(
    `[turso:migrate] 跳过（表不存在）: 从 ${SATELLITE_SESSION_TABLE} 合并 Session 数据`,
  );
  return true;
}

/** SQLite/Turso 不支持 ADD COLUMN IF NOT EXISTS；列已存在时跳过 ALTER。 */
async function executeMigrationStatement(client, statement) {
  try {
    return await executeWithRetry(client, statement);
  } catch (error) {
    const msg = String(error.message || error);
    const isAlterAdd = /^\s*ALTER\s+TABLE\b/i.test(statement) && /\bADD\s+COLUMN\b/i.test(statement);
    if (isAlterAdd && /duplicate column name/i.test(msg)) {
      console.log(`[turso:migrate] 跳过已存在列 (${statement.split(/\s+/).slice(-3).join(" ")})`);
      return;
    }
    if (
      /no such table/i.test(msg) &&
      statement.includes(SATELLITE_SESSION_TABLE)
    ) {
      console.log(
        `[turso:migrate] 跳过（表不存在）: 从 ${SATELLITE_SESSION_TABLE} 合并 Session 数据`,
      );
      return;
    }
    throw error;
  }
}

async function getAppliedNames(client) {
  const res = await client.execute(
    'SELECT migration_name FROM "_prisma_migrations" WHERE rolled_back_at IS NULL',
  );
  return new Set(res.rows.map((row) => String(row.migration_name)));
}

async function markApplied(client, migrationName, sql) {
  const now = new Date().toISOString().replace("T", " ").replace("Z", "");
  const id = crypto.randomUUID();
  const checksum = checksumSql(sql);
  await client.execute({
    sql: `INSERT INTO "_prisma_migrations"
      (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
      VALUES (?, ?, ?, ?, NULL, NULL, ?, 1)`,
    args: [id, checksum, now, migrationName, now],
  });
}

async function runSeedFile(client, root, fileName, label) {
  const seedPath = path.join(root, "prisma", fileName);
  if (!fs.existsSync(seedPath)) return;
  const statements = splitStatements(fs.readFileSync(seedPath, "utf8"));
  for (const statement of statements) {
    await executeWithRetry(client, statement);
  }
  console.log(`[turso:migrate] ${label} 种子 ${statements.length} 条`);
}

async function runSeed(client, root) {
  await runSeedFile(client, root, "billing-plan-catalog-seed.sql", "PlanCatalog");
  await runSeedFile(client, root, "token-billing-rule-seed.sql", "TokenBillingRule");
}

async function main() {
  const root = process.cwd();
  const envFromFile = loadDotEnv(path.join(root, ".env"));
  const target = (process.argv[2] || "test").trim().toLowerCase();
  const baselineOnly = process.argv.includes("--baseline");

  if (target !== "test" && target !== "prod") {
    throw new Error('仅支持 "test" 或 "prod"');
  }

  const urlKey =
    target === "prod" ? "TURSO_PROD_DATABASE_URL" : "TURSO_TEST_DATABASE_URL";
  const tokenKey =
    target === "prod" ? "TURSO_PROD_AUTH_TOKEN" : "TURSO_TEST_AUTH_TOKEN";

  const url = process.env[urlKey] || envFromFile[urlKey];
  const authToken = process.env[tokenKey] || envFromFile[tokenKey];

  if (!url?.startsWith("libsql://")) throw new Error(`无效 ${urlKey}`);
  if (!authToken || authToken === "REPLACE_ME") throw new Error(`无效 ${tokenKey}`);

  const client = createClient({ url, authToken });
  const migrations = listMigrations(path.join(root, "prisma", "migrations"));

  await executeWithRetry(client, PRISMA_MIGRATIONS_DDL.trim());
  const applied = await getAppliedNames(client);

  let ran = 0;
  let marked = 0;

  for (const migration of migrations) {
    if (applied.has(migration.name)) continue;

    const sql = fs.readFileSync(migration.sqlPath, "utf8");

    if (baselineOnly) {
      await markApplied(client, migration.name, sql);
      marked += 1;
      console.log(`[turso:migrate:${target}] baseline 标记: ${migration.name}`);
      continue;
    }

    console.log(`[turso:migrate:${target}] 应用: ${migration.name}`);
    for (const statement of splitStatements(sql)) {
      if (await shouldSkipMigrationStatement(client, statement)) continue;
      await executeMigrationStatement(client, statement);
    }
    await markApplied(client, migration.name, sql);
    ran += 1;
  }

  await runSeed(client, root);

  const status = await client.execute(
    'SELECT migration_name, finished_at FROM "_prisma_migrations" ORDER BY finished_at',
  );
  console.log(
    `[turso:migrate:${target}] 本次应用 ${ran} 条 migration，baseline 标记 ${marked} 条`,
  );
  console.log(
    `[turso:migrate:${target}] 共 ${status.rows.length} 条记录在 _prisma_migrations`,
  );
  if (ran === 0 && marked === 0) {
    console.log(`[turso:migrate:${target}] 无待执行 migration（已是最新）`);
  }
}

main().catch((error) => {
  console.error("[turso:migrate] 失败:", error.message || error);
  process.exit(1);
});
