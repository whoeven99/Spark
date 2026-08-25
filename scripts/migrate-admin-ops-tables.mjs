/**
 * 一次性：把 Admin 专属表从 spark-prod 拷到 admin-prod。
 * 不删源表。用法：
 *   node scripts/migrate-admin-ops-tables.mjs --env=.env.admin.prod
 *   node scripts/migrate-admin-ops-tables.mjs --env=.env.admin.prod --dry-run
 */
import { createClient } from "@libsql/client/http";
import { resolve } from "node:path";
import { loadStackedEnv, parseEnvFile, REPO_ROOT } from "./lib/loadEnv.mjs";

const TABLES = [
  "AdminTodo",
  "AdminTodoComment",
  "AdminPricingConfig",
  "AdminMonthlyFixedCost",
];

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return "(invalid)";
  }
}

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

async function tableSql(client, tableName) {
  const row = await client.execute({
    sql: `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`,
    args: [tableName],
  });
  return row.rows[0]?.sql ? String(row.rows[0].sql) : null;
}

async function indexSqls(client, tableName) {
  const rows = await client.execute({
    sql: `SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND sql IS NOT NULL`,
    args: [tableName],
  });
  return rows.rows.map((r) => String(r.sql));
}

async function countRows(client, tableName) {
  const r = await client.execute(`SELECT COUNT(*) AS n FROM ${quoteIdent(tableName)}`);
  return Number(r.rows[0].n);
}

async function copyTable(source, target, tableName, dryRun) {
  const createSql = await tableSql(source, tableName);
  if (!createSql) {
    throw new Error(`源库缺少表: ${tableName}`);
  }
  const indexes = await indexSqls(source, tableName);
  const srcCount = await countRows(source, tableName);
  console.log(`\n[${tableName}] source rows=${srcCount}`);
  console.log(`  DDL: ${createSql.slice(0, 80)}…`);

  if (dryRun) {
    console.log(`  dry-run: skip create/insert (${indexes.length} indexes)`);
    return { tableName, srcCount, dstCount: null };
  }

  await target.execute(`DROP TABLE IF EXISTS ${quoteIdent(tableName)}`);
  await target.execute(createSql);
  for (const idx of indexes) {
    await target.execute(idx);
  }

  const colsInfo = await source.execute(`PRAGMA table_info(${quoteIdent(tableName)})`);
  const cols = colsInfo.rows.map((c) => String(c.name));
  const colList = cols.map(quoteIdent).join(", ");
  const placeholders = cols.map(() => "?").join(", ");

  const batchSize = 100;
  let offset = 0;
  let inserted = 0;
  while (true) {
    const page = await source.execute(
      `SELECT * FROM ${quoteIdent(tableName)} LIMIT ${batchSize} OFFSET ${offset}`,
    );
    if (page.rows.length === 0) break;
    for (const row of page.rows) {
      const args = cols.map((c) => row[c] ?? null);
      await target.execute({
        sql: `INSERT INTO ${quoteIdent(tableName)} (${colList}) VALUES (${placeholders})`,
        args,
      });
      inserted += 1;
    }
    offset += page.rows.length;
  }

  const dstCount = await countRows(target, tableName);
  console.log(`  copied ${inserted}, target rows=${dstCount}`);
  if (dstCount !== srcCount) {
    throw new Error(`${tableName} 行数不一致: source=${srcCount} target=${dstCount}`);
  }
  return { tableName, srcCount, dstCount };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const { env } = loadStackedEnv({
    root: REPO_ROOT,
    overlay: ".env.admin.prod",
  });
  // Prefer process/overlay already merged; also re-read file for clarity
  const fileEnv = parseEnvFile(resolve(REPO_ROOT, ".env.admin.prod"));
  const sparkUrl = env.SPARK_DATABASE_URL || fileEnv.SPARK_DATABASE_URL;
  const sparkToken =
    env.SPARK_DATABASE_AUTH_TOKEN || fileEnv.SPARK_DATABASE_AUTH_TOKEN;
  const adminUrl = env.ADMIN_DATABASE_URL || fileEnv.ADMIN_DATABASE_URL;
  const adminToken =
    env.ADMIN_DATABASE_AUTH_TOKEN || fileEnv.ADMIN_DATABASE_AUTH_TOKEN;

  console.log("=== migrate Admin ops tables ===");
  console.log("mode:", dryRun ? "dry-run" : "WRITE");
  console.log("source SPARK host:", hostOf(sparkUrl || ""));
  console.log("target ADMIN host:", hostOf(adminUrl || ""));
  console.log("ADMIN_DATABASE_URL set:", Boolean(adminUrl?.startsWith("libsql://")));
  console.log(
    "ADMIN_DATABASE_AUTH_TOKEN set:",
    Boolean(adminToken && adminToken !== "REPLACE_ME"),
  );

  if (!sparkUrl?.startsWith("libsql://") || !sparkToken) {
    throw new Error("缺少 SPARK_DATABASE_URL / SPARK_DATABASE_AUTH_TOKEN");
  }
  if (!adminUrl?.startsWith("libsql://") || !adminToken) {
    throw new Error("缺少 ADMIN_DATABASE_URL / ADMIN_DATABASE_AUTH_TOKEN");
  }
  if (hostOf(sparkUrl) === hostOf(adminUrl)) {
    throw new Error("源与目标 host 相同，拒绝执行");
  }

  const source = createClient({ url: sparkUrl, authToken: sparkToken });
  const target = createClient({ url: adminUrl, authToken: adminToken });

  await source.execute("SELECT 1 AS ok");
  await target.execute("SELECT 1 AS ok");
  console.log("ping: source ok, target ok");

  const before = await target.execute(
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
  );
  console.log(
    "target tables before:",
    before.rows.map((r) => r.name),
  );

  const results = [];
  for (const table of TABLES) {
    results.push(await copyTable(source, target, table, dryRun));
  }

  if (!dryRun) {
    const after = await target.execute(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
    );
    console.log(
      "\ntarget tables after:",
      after.rows.map((r) => r.name),
    );
  }

  console.log("\n=== summary ===");
  console.log(results);
  console.log(dryRun ? "dry-run 完成，未写入" : "迁移完成（源表未删除）");
}

main().catch((e) => {
  console.error("[migrate-admin-ops] 失败:", e.message || e);
  process.exit(1);
});
