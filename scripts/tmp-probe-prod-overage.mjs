import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaLibSQL } from "@prisma/adapter-libsql/web";
import { loadStackedEnv, resolveTurso } from "./lib/loadEnv.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { overlay } = loadStackedEnv({ root, overlay: ".env.prod" });
const turso = resolveTurso(process.env);
if (!turso.url || !turso.authToken) {
  console.error("missing turso");
  process.exit(1);
}

const require = createRequire(import.meta.url);
const { PrismaClient } = require("../app/generated/prisma/index.js");
const prisma = new PrismaClient({
  adapter: new PrismaLibSQL({ url: turso.url, authToken: turso.authToken }),
});

const accounts = await prisma.$queryRawUnsafe(`
  SELECT
    a.shop,
    a.subscriptionTokens,
    a.purchasedTokens,
    a.trialTokens,
    a.usedTokens,
    (a.subscriptionTokens + a.purchasedTokens + a.trialTokens) AS availableTokens,
    s.planKey,
    s.status,
    s.overageEnabled,
    s.usageLineItemId,
    s.cappedAmount,
    s.trialEndsAt
  FROM Account a
  LEFT JOIN AppSubscription s ON s.shop = a.shop
  WHERE a.usedTokens BETWEEN 280000 AND 290000
     OR a.trialTokens >= 1500000
     OR (a.subscriptionTokens + a.purchasedTokens + a.trialTokens) BETWEEN 1990000 AND 2010000
  ORDER BY a.usedTokens DESC
  LIMIT 30
`);

const summary = await prisma.$queryRawUnsafe(`
  SELECT
    COUNT(*) AS accounts,
    SUM(CASE WHEN s.id IS NULL THEN 1 ELSE 0 END) AS noSub,
    SUM(CASE WHEN s.status = 'ACTIVE' THEN 1 ELSE 0 END) AS activeSub,
    SUM(CASE WHEN s.overageEnabled = 1 AND s.usageLineItemId IS NOT NULL AND s.usageLineItemId != '' THEN 1 ELSE 0 END) AS overageReady,
    SUM(CASE WHEN s.id IS NOT NULL AND (s.overageEnabled = 0 OR s.usageLineItemId IS NULL OR s.usageLineItemId = '') THEN 1 ELSE 0 END) AS subWithoutOverage
  FROM Account a
  LEFT JOIN AppSubscription s ON s.shop = a.shop
`);

const subs = await prisma.$queryRawUnsafe(`
  SELECT shop, planKey, status, overageEnabled, usageLineItemId, cappedAmount, trialEndsAt, tokensPerPeriod
  FROM AppSubscription
  LIMIT 50
`);

console.log(
  JSON.stringify(
    {
      overlay,
      host: new URL(turso.url).host,
      urlKey: turso.urlKey,
      summary,
      matchCount: accounts.length,
      matches: accounts,
      allSubs: subs,
    },
    null,
    2,
  ),
);
await prisma.$disconnect();
