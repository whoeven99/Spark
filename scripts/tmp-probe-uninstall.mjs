/**
 * 测环境：查最近卸载相关痕迹与店铺残留数据
 * node scripts/tmp-probe-uninstall.mjs
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
  console.error("缺少 Turso 测环境凭据");
  process.exit(1);
}

const require = createRequire(import.meta.url);
const { PrismaClient } = require("../app/generated/prisma/index.js");
const adapter = new PrismaLibSQL({ url: turso.url, authToken: turso.authToken });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log(`Turso: ${new URL(turso.url).host} (${turso.urlKey})\n`);

  let hasLedger = true;
  try {
    await prisma.$queryRaw`SELECT 1 FROM PromoClaimLedger LIMIT 1`;
  } catch {
    hasLedger = false;
  }
  console.log(`PromoClaimLedger 表存在: ${hasLedger}\n`);

  const uninstallEvents = await prisma.commonEventLog.findMany({
    where: { eventType: "APP_UNINSTALLED" },
    orderBy: { createdAt: "desc" },
    take: 15,
    select: {
      id: true,
      shop: true,
      eventType: true,
      referenceId: true,
      createdAt: true,
      topic: true,
    },
  });
  console.log(`=== CommonEventLog APP_UNINSTALLED (最近 ${uninstallEvents.length}) ===`);
  console.log(JSON.stringify(uninstallEvents, null, 2));

  const shops = [...new Set(uninstallEvents.map((e) => e.shop))];
  if (shops.length === 0) {
    // 也扫一下 Session / Account 最近活动店
    const accounts = await prisma.account.findMany({
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: {
        shop: true,
        purchasedTokens: true,
        subscriptionTokens: true,
        usedTokens: true,
        updatedAt: true,
      },
    });
    console.log("\n=== 无卸载事件；最近 Account ===");
    console.log(JSON.stringify(accounts, null, 2));
    return;
  }

  for (const shop of shops.slice(0, 5)) {
    const [
      sessions,
      accounts,
      conversations,
      orders,
      billingLogs,
      subscriptions,
      support,
    ] = await Promise.all([
      prisma.session.count({ where: { shop } }),
      prisma.account.count({ where: { shop } }),
      prisma.conversation.count({ where: { shop } }),
      prisma.shopOrder.count({ where: { shop } }),
      prisma.billingLog.count({ where: { shop } }),
      prisma.appSubscription.count({ where: { shop } }),
      prisma.supportConversation.count({ where: { shop } }),
    ]);
    let ledger = null;
    if (hasLedger) {
      // 无法从 shop 反查 hash 以外的——用 raw 先 count all for shopHash if we can compute
      const { createHash } = await import("node:crypto");
      const shopHash = createHash("sha256")
        .update(shop.trim().toLowerCase(), "utf8")
        .digest("hex");
      ledger = await prisma.promoClaimLedger.findMany({
        where: { shopHash },
        select: { campaignId: true, tokensDelta: true, claimedAt: true },
      });
    }
    console.log(`\n=== 残留检查 shop=${shop} ===`);
    console.log({
      sessions,
      accounts,
      conversations,
      orders,
      billingLogs,
      subscriptions,
      support,
      promoClaimLedger: ledger,
    });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
