/**
 * 生产软重置（方案 A）—— 危险，需双门禁。
 *
 * 用法：
 *   node scripts/prod-soft-reset.mjs --env=.env.prod --confirm-prod
 *
 * 做：
 * - 清空试跑痕迹表（聊天/任务/用量日志/订单镜像/诊断等）
 * - 删除 diag-prod / *.example.com 假店 Account + Session
 * - 保留真实店 Account / Session，额度归零
 * - 保留 PlanCatalog / TokenBillingRule
 */
import { createClient } from "@libsql/client";
import { resolve } from "node:path";
import { loadStackedEnv, resolveTurso } from "./lib/loadEnv.mjs";

const argv = process.argv.slice(2);
const confirmProd = argv.includes("--confirm-prod");
const envArg = argv.find((a) => a.startsWith("--env="));
const overlay = envArg?.slice("--env=".length) || ".env.test";

if (overlay !== ".env.prod" && !overlay.endsWith("prod")) {
  console.error("拒绝：必须 --env=.env.prod");
  process.exit(1);
}
if (!confirmProd) {
  console.error("拒绝：生产写入必须带 --confirm-prod");
  process.exit(1);
}

const { env } = loadStackedEnv({
  root: resolve(import.meta.dirname, ".."),
  overlay,
});
const turso = resolveTurso(env);
if (!turso.url || !turso.authToken) {
  console.error("缺少 TURSO_DATABASE_URL / TURSO_AUTH_TOKEN");
  process.exit(1);
}

const host = new URL(turso.url).host;
if (!host.includes("prod")) {
  console.error(`拒绝：Turso host 不像生产：${host}`);
  process.exit(1);
}

const db = createClient({ url: turso.url, authToken: turso.authToken });

const CLEAR_TABLES = [
  "Message",
  "Conversation",
  "AITaskLog",
  "AITask",
  "AITaskBatch",
  "AITaskEstimation",
  "ToolTokenUsageLog",
  "BillingLog",
  "OverageUsageCharge",
  "AccountPeriodUsage",
  "AppSubscription",
  "CommonEventLog",
  "AppVisitSource",
  "ShopRefundLineItem",
  "ShopRefund",
  "ShopOrderLineItem",
  "ShopFulfillment",
  "ShopOrder",
  "ShopCustomer",
  "ShopInventoryLevel",
  "ShopSyncCheckpoint",
  "OperationDiagnosisItem",
  "OperationTask",
  "OperationDiagnosisSnapshot",
  "ImageMapping",
  "WorkspaceFile",
  "SupportMessage",
  "SupportConversation",
  "Suggestion",
  "AdMetricDaily",
  "AdEntity",
  "AdInsightsSync",
  "GmcProductStatus",
  "MetaProductStatus",
  "AdPlatformCredential",
  "ShopCustomerValue",
  "ShopSkuCost",
  "ShopCostConfig",
];

async function count(table) {
  try {
    const r = await db.execute(`SELECT COUNT(*) as c FROM "${table}"`);
    return Number(r.rows[0]?.c ?? 0);
  } catch {
    return -1;
  }
}

async function main() {
  console.log(`PROD soft-reset on ${host}`);
  console.log("KEEP: PlanCatalog, TokenBillingRule, Session(真实店), Account(真实店, 额度清零)");
  console.log("DELETE shops: diag-prod-* / *.example.com\n");

  console.log("--- before ---");
  const beforeAccounts = await db.execute(
    "SELECT shop, subscriptionTokens, purchasedTokens, trialTokens, usedTokens FROM Account ORDER BY shop",
  );
  for (const r of beforeAccounts.rows) console.log(r);

  for (const table of CLEAR_TABLES) {
    const n = await count(table);
    if (n < 0) {
      console.log(`skip missing table ${table}`);
      continue;
    }
    if (n === 0) {
      console.log(`clear ${table}: already 0`);
      continue;
    }
    await db.execute(`DELETE FROM "${table}"`);
    console.log(`clear ${table}: deleted ~${n}`);
  }

  const fakeAccount = await db.execute({
    sql: `DELETE FROM Account WHERE shop LIKE ? OR shop LIKE ?`,
    args: ["diag-prod-%", "%.example.com"],
  });
  console.log(`delete fake Account: rowsAffected=${fakeAccount.rowsAffected ?? "?"}`);

  const fakeSession = await db.execute({
    sql: `DELETE FROM Session WHERE shop LIKE ? OR shop LIKE ?`,
    args: ["diag-prod-%", "%.example.com"],
  });
  console.log(`delete fake Session: rowsAffected=${fakeSession.rowsAffected ?? "?"}`);

  const reset = await db.execute(`
    UPDATE Account SET
      subscriptionTokens = 0,
      purchasedTokens = 0,
      trialTokens = 0,
      usedTokens = 0,
      trialDailyUsed = 0,
      trialDailyResetAt = NULL,
      updatedAt = datetime('now')
  `);
  console.log(`reset Account tokens: rowsAffected=${reset.rowsAffected ?? "?"}`);

  console.log("\n--- after ---");
  const afterAccounts = await db.execute(
    "SELECT shop, subscriptionTokens, purchasedTokens, trialTokens, usedTokens FROM Account ORDER BY shop",
  );
  for (const r of afterAccounts.rows) console.log(r);

  const keepCheck = [
    "PlanCatalog",
    "TokenBillingRule",
    "Account",
    "Session",
    "BillingLog",
    "Conversation",
    "Message",
    "AITask",
    "ShopOrder",
    "ToolTokenUsageLog",
  ];
  for (const t of keepCheck) {
    console.log(`${t.padEnd(22)} ${await count(t)}`);
  }
  console.log("\nDONE prod soft-reset A");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
