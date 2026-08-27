-- prod Turso 遗留多 app schema：Account 已在 add_trial_daily_usage 去掉 appName，
-- 但 ToolTokenUsageLog / BillingLog / AppSubscription / AccountPeriodUsage 仍引用 Account(shop, appName)，
-- 导致 foreign key mismatch。此处按当前 Prisma schema 重建四表，外键仅引用 Account(shop)。
-- 测试库 init 从未建 appName，重建为幂等（列清单一致，仅换 FK 定义）。

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

-- 清理 prod 遗留 appName 索引（测试库 IF EXISTS 安全跳过）
DROP INDEX IF EXISTS "ToolTokenUsageLog_shop_appName_createdAt_idx";
DROP INDEX IF EXISTS "ToolTokenUsageLog_shop_appName_feature_createdAt_idx";
DROP INDEX IF EXISTS "BillingLog_shop_appName_createdAt_idx";
DROP INDEX IF EXISTS "AppSubscription_shop_appName_key";
DROP INDEX IF EXISTS "AccountPeriodUsage_shop_appName_periodEnd_idx";

-- AppSubscription（AccountPeriodUsage 依赖其 id，先重建并保留 id）
CREATE TABLE "new_AppSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "planKey" TEXT NOT NULL,
    "shopifySubscriptionId" TEXT NOT NULL,
    "billingInterval" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "tokensPerPeriod" INTEGER NOT NULL,
    "trialEndsAt" DATETIME,
    "currentPeriodStart" DATETIME,
    "currentPeriodEnd" DATETIME,
    "cancelledAt" DATETIME,
    "confirmationUrl" TEXT,
    "rawPayload" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AppSubscription_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Account" ("shop") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_AppSubscription" (
    "id", "shop", "planKey", "shopifySubscriptionId", "billingInterval", "status",
    "tokensPerPeriod", "trialEndsAt", "currentPeriodStart", "currentPeriodEnd",
    "cancelledAt", "confirmationUrl", "rawPayload", "createdAt", "updatedAt"
)
SELECT
    "id", "shop", "planKey", "shopifySubscriptionId", "billingInterval", "status",
    "tokensPerPeriod", "trialEndsAt", "currentPeriodStart", "currentPeriodEnd",
    "cancelledAt", "confirmationUrl", "rawPayload", "createdAt", "updatedAt"
FROM "AppSubscription";
DROP TABLE "AppSubscription";
ALTER TABLE "new_AppSubscription" RENAME TO "AppSubscription";
CREATE UNIQUE INDEX "AppSubscription_shopifySubscriptionId_key" ON "AppSubscription"("shopifySubscriptionId");
CREATE INDEX "AppSubscription_status_idx" ON "AppSubscription"("status");
CREATE UNIQUE INDEX "AppSubscription_shop_key" ON "AppSubscription"("shop");

-- AccountPeriodUsage
CREATE TABLE "new_AccountPeriodUsage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "appSubscriptionId" TEXT NOT NULL,
    "planKey" TEXT NOT NULL,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "usedTokens" INTEGER NOT NULL,
    "subscriptionTokensAllocated" INTEGER NOT NULL,
    "purchasedTokensRemaining" INTEGER NOT NULL DEFAULT 0,
    "trialTokensRemaining" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccountPeriodUsage_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Account" ("shop") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AccountPeriodUsage_appSubscriptionId_fkey" FOREIGN KEY ("appSubscriptionId") REFERENCES "AppSubscription" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_AccountPeriodUsage" (
    "id", "shop", "appSubscriptionId", "planKey", "periodStart", "periodEnd",
    "usedTokens", "subscriptionTokensAllocated", "purchasedTokensRemaining",
    "trialTokensRemaining", "archivedAt"
)
SELECT
    "id", "shop", "appSubscriptionId", "planKey", "periodStart", "periodEnd",
    "usedTokens", "subscriptionTokensAllocated", "purchasedTokensRemaining",
    "trialTokensRemaining", "archivedAt"
FROM "AccountPeriodUsage";
DROP TABLE "AccountPeriodUsage";
ALTER TABLE "new_AccountPeriodUsage" RENAME TO "AccountPeriodUsage";
CREATE INDEX "AccountPeriodUsage_shop_periodEnd_idx" ON "AccountPeriodUsage"("shop", "periodEnd");
CREATE UNIQUE INDEX "AccountPeriodUsage_appSubscriptionId_periodStart_periodEnd_key" ON "AccountPeriodUsage"("appSubscriptionId", "periodStart", "periodEnd");

-- BillingLog
CREATE TABLE "new_BillingLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "planKey" TEXT,
    "referenceId" TEXT,
    "tokensDelta" INTEGER,
    "usedTokens" INTEGER,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BillingLog_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Account" ("shop") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_BillingLog" (
    "id", "shop", "eventType", "planKey", "referenceId", "tokensDelta", "usedTokens", "metadata", "createdAt"
)
SELECT
    "id", "shop", "eventType", "planKey", "referenceId", "tokensDelta", "usedTokens", "metadata", "createdAt"
FROM "BillingLog";
DROP TABLE "BillingLog";
ALTER TABLE "new_BillingLog" RENAME TO "BillingLog";
CREATE INDEX "BillingLog_shop_createdAt_idx" ON "BillingLog"("shop", "createdAt");
CREATE INDEX "BillingLog_eventType_createdAt_idx" ON "BillingLog"("eventType", "createdAt");
CREATE INDEX "BillingLog_referenceId_idx" ON "BillingLog"("referenceId");

-- ToolTokenUsageLog
CREATE TABLE "new_ToolTokenUsageLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "modelKey" TEXT NOT NULL,
    "rawTokens" INTEGER NOT NULL,
    "billedTokens" INTEGER NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ToolTokenUsageLog_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Account" ("shop") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ToolTokenUsageLog" (
    "id", "shop", "feature", "modelKey", "rawTokens", "billedTokens", "inputTokens", "outputTokens", "createdAt"
)
SELECT
    "id", "shop", "feature", "modelKey", "rawTokens", "billedTokens", "inputTokens", "outputTokens", "createdAt"
FROM "ToolTokenUsageLog";
DROP TABLE "ToolTokenUsageLog";
ALTER TABLE "new_ToolTokenUsageLog" RENAME TO "ToolTokenUsageLog";
CREATE INDEX "ToolTokenUsageLog_shop_createdAt_idx" ON "ToolTokenUsageLog"("shop", "createdAt");
CREATE INDEX "ToolTokenUsageLog_shop_feature_createdAt_idx" ON "ToolTokenUsageLog"("shop", "feature", "createdAt");
CREATE INDEX "ToolTokenUsageLog_feature_createdAt_idx" ON "ToolTokenUsageLog"("feature", "createdAt");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
