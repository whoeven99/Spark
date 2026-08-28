/**
 * 硬重置 Turso：删除全部用户表（含 _prisma_migrations），便于 migration squash 后重建。
 *
 * 默认测环境：
 *   node scripts/turso-hard-reset.mjs
 *   node scripts/turso-hard-reset.mjs --env=.env.test
 * 生产（需二次确认）：
 *   node scripts/turso-hard-reset.mjs --env=.env.prod --confirm-prod
 *
 * 重置后请再跑：npm run turso:migrate:test | turso:migrate:prod
 */
import { createClient } from "@libsql/client/http";
import { loadStackedEnv, resolveTurso } from "./lib/loadEnv.mjs";

function hasFlag(name) {
  return process.argv.slice(2).includes(name);
}

const { env } = loadStackedEnv({ applyToProcess: true });
const overlay = process.argv.find((a) => a.startsWith("--env="))?.slice("--env=".length);
const isProd =
  (overlay && /prod/i.test(overlay)) ||
  /prod/i.test(String(process.env.TURSO_DATABASE_URL || env.TURSO_DATABASE_URL || ""));

if (isProd && !hasFlag("--confirm-prod")) {
  console.error(
    "拒绝：这是生产库硬重置。确认后请加 --env=.env.prod --confirm-prod",
  );
  process.exit(1);
}

const turso = resolveTurso({ ...env, ...process.env });
if (!turso.url || !turso.authToken) {
  console.error("缺少 TURSO_DATABASE_URL / TURSO_AUTH_TOKEN");
  process.exit(1);
}

const host = turso.url.replace(/^libsql:\/\//, "").split("/")[0];
console.log(`Hard-reset Turso schema on ${host} (${isProd ? "PROD" : "test"})`);

const db = createClient({ url: turso.url, authToken: turso.authToken });

const tablesRes = await db.execute(`
  SELECT name FROM sqlite_master
  WHERE type = 'table'
    AND name NOT LIKE 'sqlite_%'
  ORDER BY name
`);
let tables = tablesRes.rows.map((r) => String(r.name));
console.log(`tables to drop: ${tables.length}`);

// Turso HTTP 上 PRAGMA foreign_keys=OFF 不一定生效；多轮 DROP 直到清空。
const maxPasses = 20;
for (let pass = 1; pass <= maxPasses && tables.length > 0; pass += 1) {
  console.log(`drop pass ${pass}, remaining ${tables.length}`);
  const failed = [];
  for (const name of tables) {
    const quoted = `"${name.replace(/"/g, '""')}"`;
    try {
      await db.execute(`DROP TABLE IF EXISTS ${quoted}`);
      console.log(`dropped ${name}`);
    } catch (error) {
      failed.push(name);
      console.warn(`retry later ${name}: ${error.message || error}`);
    }
  }
  const leftRes = await db.execute(`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `);
  tables = leftRes.rows.map((r) => String(r.name));
  if (tables.length === 0) break;
  if (failed.length === tables.length && pass === maxPasses) {
    throw new Error(`无法删净表: ${tables.join(", ")}`);
  }
}

const left = await db.execute(`
  SELECT name FROM sqlite_master
  WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
`);
console.log(`remaining user tables: ${left.rows.length}`);
console.log("DONE. Next: npm run turso:migrate:test  or  turso:migrate:prod");
