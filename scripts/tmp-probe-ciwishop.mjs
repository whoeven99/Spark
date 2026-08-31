/**
 * 深挖 ciwishop 测环境痕迹
 */
import { createHash } from "node:crypto";
import { PrismaLibSQL } from "@prisma/adapter-libsql/web";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadStackedEnv, resolveTurso } from "./lib/loadEnv.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { env } = loadStackedEnv({ root });
const turso = resolveTurso(env);
const require = createRequire(import.meta.url);
const { PrismaClient } = require("../app/generated/prisma/index.js");
const prisma = new PrismaClient({
  adapter: new PrismaLibSQL({ url: turso.url, authToken: turso.authToken }),
});

const shop = process.argv[2] || "ciwishop.myshopify.com";
const shopHash = createHash("sha256")
  .update(shop.trim().toLowerCase(), "utf8")
  .digest("hex");

async function main() {
  console.log({ shop, shopHash, host: new URL(turso.url).host });

  const account = await prisma.account.findUnique({ where: { shop } });
  const sessions = await prisma.session.findMany({
    where: { shop },
    select: { id: true, isOnline: true, email: true, updatedAt: true },
  });
  const billingLogs = await prisma.billingLog.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  const events = await prisma.commonEventLog.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      eventType: true,
      referenceId: true,
      topic: true,
      createdAt: true,
    },
  });
  const ledger = await prisma.promoClaimLedger.findMany({ where: { shopHash } });
  const conversations = await prisma.conversation.count({ where: { shop } });
  const orders = await prisma.shopOrder.count({ where: { shop } });
  const tasks = await prisma.aITask.count({ where: { shop } });
  const support = await prisma.supportConversation.findMany({
    where: { shop },
    select: { id: true, status: true, lastMessageAt: true, createdAt: true },
  });
  const installed = await prisma.commonEventLog.findMany({
    where: { shop, eventType: "APP_INSTALLED" },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  // 全库最近 common events（任意店）
  const recentAny = await prisma.commonEventLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { shop: true, eventType: true, referenceId: true, createdAt: true },
  });

  console.log("\n=== Account ===");
  console.log(JSON.stringify(account, null, 2));
  console.log("\n=== Sessions ===", sessions.length);
  console.log(JSON.stringify(sessions, null, 2));
  console.log("\n=== PromoClaimLedger ===");
  console.log(JSON.stringify(ledger, null, 2));
  console.log("\n=== BillingLog ===");
  console.log(JSON.stringify(billingLogs, null, 2));
  console.log("\n=== CommonEventLog (this shop) ===");
  console.log(JSON.stringify(events, null, 2));
  console.log("\n=== APP_INSTALLED ===");
  console.log(JSON.stringify(installed, null, 2));
  console.log("\n=== counts ===", { conversations, orders, tasks, support });
  console.log("\n=== recent CommonEventLog (all shops) ===");
  console.log(JSON.stringify(recentAny, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
