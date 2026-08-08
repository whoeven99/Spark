/**
 * 快速查询 Turso 测试数据库
 * 用法：node scripts/query-turso.mjs [table]
 */
import { PrismaLibSQL } from "@prisma/adapter-libsql/web";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { PrismaClient } = require("../app/generated/prisma/index.js");

const TURSO_URL = process.env.TURSO_TEST_DATABASE_URL;
const TURSO_TOKEN = process.env.TURSO_TEST_AUTH_TOKEN;

if (!TURSO_URL || !TURSO_TOKEN) {
  console.error("请确保设置了 TURSO_TEST_DATABASE_URL 和 TURSO_TEST_AUTH_TOKEN");
  process.exit(1);
}

const adapter = new PrismaLibSQL({ url: TURSO_URL, authToken: TURSO_TOKEN });
const prisma = new PrismaClient({ adapter });

async function main() {
  const tableArg = process.argv[2];

  // 获取所有表的大致行数
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

  if (tableArg) {
    // 查询指定表
    const found = tables.find(t => t.name.toLowerCase() === tableArg.toLowerCase());
    if (!found) {
      console.error(`未知表: ${tableArg}`);
      console.error(`可用表: ${tables.map(t => t.name).join(", ")}`);
      process.exit(1);
    }
    const rows = await found.model.findMany({ take: 20 });
    console.log(`\n=== ${found.name} (前 20 条) ===`);
    console.log(JSON.stringify(rows, null, 2));
    console.log(`共 ${rows.length} 条（限制 20）`);
  } else {
    // 列出所有表的行数
    console.log("=== Turso 测试数据库 - 表概览 ===\n");
    for (const t of tables) {
      try {
        const count = await t.model.count();
        console.log(`  ${t.name.padEnd(30)} ${count} 行`);
      } catch (e) {
        console.log(`  ${t.name.padEnd(30)} ❌ ${e.message}`);
      }
    }
    console.log("\n提示：node scripts/query-turso.mjs <表名> 查看具体数据");
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("查询失败:", e);
  process.exit(1);
});
