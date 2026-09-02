/**
 * 清掉某店「安装福利」领取记录，便于再次自动发放。
 *
 * 用法：
 *   node scripts/tmp-clear-install-promo.mjs ciwishop.myshopify.com
 *   node scripts/tmp-clear-install-promo.mjs ciwishop.myshopify.com --env=.env.prod --confirm-prod
 */
import { createHash } from "node:crypto";
import { PrismaLibSQL } from "@prisma/adapter-libsql/web";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadStackedEnv, resolveTurso } from "./lib/loadEnv.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const shopArg = args.find((a) => !a.startsWith("--"));
const confirmProd = args.includes("--confirm-prod");
const envFlag = args.find((a) => a.startsWith("--env="));
const isProd = Boolean(envFlag?.includes("prod"));

if (!shopArg) {
  console.error(
    "用法: node scripts/tmp-clear-install-promo.mjs <shop> [--env=.env.prod --confirm-prod]",
  );
  process.exit(1);
}

if (isProd && !confirmProd) {
  console.error("改产库必须加 --confirm-prod");
  process.exit(1);
}

const shop = shopArg
  .trim()
  .toLowerCase()
  .replace(/^https?:\/\//, "")
  .replace(/\/$/, "");
const shopFull = shop.includes(".") ? shop : `${shop}.myshopify.com`;
const shopHash = createHash("sha256").update(shopFull, "utf8").digest("hex");
const campaignId = "install-welcome-1m";

const { env } = loadStackedEnv({ root, argv: args });
const turso = resolveTurso(env);
if (!turso.url || !turso.authToken) {
  console.error("缺少 Turso 凭据");
  process.exit(1);
}

console.log(`环境: ${isProd ? "PROD" : "TEST"} host=${new URL(turso.url).host}`);
console.log(`shop=${shopFull}`);
console.log(`shopHash=${shopHash}`);
console.log(`campaignId=${campaignId}`);

const require = createRequire(import.meta.url);
const { PrismaClient } = require("../app/generated/prisma/index.js");
const prisma = new PrismaClient({
  adapter: new PrismaLibSQL({ url: turso.url, authToken: turso.authToken }),
});

const beforeAccount = await prisma.account.findUnique({ where: { shop: shopFull } });
const beforeLedger = await prisma.promoClaimLedger.findMany({
  where: { shopHash, campaignId },
});
const beforeLogs = await prisma.billingLog.findMany({
  where: {
    shop: shopFull,
    eventType: "PROMO_TOKEN_CLAIMED",
    referenceId: campaignId,
  },
});

console.log("before", {
  account: beforeAccount,
  ledger: beforeLedger.length,
  promoLogs: beforeLogs.length,
});

const ledgerDeleted = await prisma.promoClaimLedger.deleteMany({
  where: { shopHash, campaignId },
});
const logsDeleted = await prisma.billingLog.deleteMany({
  where: {
    shop: shopFull,
    eventType: "PROMO_TOKEN_CLAIMED",
    referenceId: campaignId,
  },
});

let accountUpdated = null;
if (beforeAccount) {
  accountUpdated = await prisma.account.update({
    where: { shop: shopFull },
    data: {
      purchasedTokens: 0,
      usedTokens: 0,
      subscriptionTokens: beforeAccount.subscriptionTokens,
    },
  });
}

console.log("deleted", {
  ledger: ledgerDeleted.count,
  promoLogs: logsDeleted.count,
  accountAfter: accountUpdated,
});

await prisma.$disconnect();
console.log("done");
