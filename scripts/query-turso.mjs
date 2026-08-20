/**
 * 快速查询 Turso（默认测环境）
 * 用法：
 *   node scripts/query-turso.mjs
 *   node scripts/query-turso.mjs Account
 *   node scripts/query-turso.mjs Account --env=.env.prod
 */
import { PrismaLibSQL } from "@prisma/adapter-libsql/web";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadStackedEnv, resolveTurso } from "./lib/loadEnv.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { env } = loadStackedEnv({ root });
const turso = resolveTurso(env);

if (!turso.url || !turso.authToken) {
  console.error(
    "缺少 TURSO_DATABASE_URL / TURSO_AUTH_TOKEN（默认叠 .env.test → .env）",
  );
  process.exit(1);
}

const require = createRequire(import.meta.url);
const { PrismaClient } = require("../app/generated/prisma/index.js");

const adapter = new PrismaLibSQL({
  url: turso.url,
  authToken: turso.authToken,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  const tableArg = process.argv.slice(2).find((a) => !a.startsWith("--"));

  const tables = [
    { name: "Account", model: prisma.account },
    { name: "Session", model: prisma.session },
    { name: "AppSubscription", model: prisma.appSubscription },
    { name: "BillingLog", model: prisma.billingLog },
    { name: "Conversation", model: prisma.conversation },
    { name: "Message", model: prisma.message },
    { name: "ShopOrder", model: prisma.shopOrder },
    { name: "ShopCustomer", model: prisma.shopCustomer },
    { name: "PlanCatalog", model: prisma.planCatalog },
    { name: "AITaskBatch", model: prisma.aITaskBatch },
    { name: "AITask", model: prisma.aITask },
    { name: "CommonEventLog", model: prisma.commonEventLog },
    { name: "TokenBillingRule", model: prisma.tokenBillingRule },
    { name: "OperationDiagnosisSnapshot", model: prisma.operationDiagnosisSnapshot },
    { name: "OperationTask", model: prisma.operationTask },
    { name: "WorkspaceFile", model: prisma.workspaceFile },
  ];

  console.log(`Turso host: ${new URL(turso.url).host} (${turso.urlKey})\n`);

  if (tableArg) {
    const found = tables.find(
      (t) => t.name.toLowerCase() === tableArg.toLowerCase(),
    );
    if (!found) {
      console.error(`未知表: ${tableArg}`);
      console.error(`可用表: ${tables.map((t) => t.name).join(", ")}`);
      process.exit(1);
    }
    const rows = await found.model.findMany({ take: 20 });
    console.log(`\n=== ${found.name} (前 20 条) ===`);
    console.log(JSON.stringify(rows, null, 2));
    console.log(`共 ${rows.length} 条（限制 20）`);
  } else {
    console.log("=== Turso 表概览 ===\n");
    for (const t of tables) {
      try {
        const count = await t.model.count();
        console.log(`  ${t.name.padEnd(30)} ${count} 行`);
      } catch (e) {
        console.log(`  ${t.name.padEnd(30)} ❌ ${e.message}`);
      }
    }
    console.log("\n提示：node scripts/query-turso.mjs <表名> [--env=.env.prod]");
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("查询失败:", e);
  process.exit(1);
});
