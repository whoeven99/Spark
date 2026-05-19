-- 套餐目录
CREATE TABLE "PlanCatalog" (
    "planKey" TEXT NOT NULL PRIMARY KEY,
    "appName" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "billingInterval" TEXT,
    "displayName" TEXT NOT NULL,
    "tokens" INTEGER NOT NULL,
    "priceAmount" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "trialDays" INTEGER,
    "shopifyPlanName" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "enabled" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "PlanCatalog_appName_enabled_sortOrder_idx" ON "PlanCatalog"("appName", "enabled", "sortOrder");

-- 当前生效订阅（每 shop + appName 一条）
CREATE TABLE "AppSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "appName" TEXT NOT NULL,
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
    "rawPayload" JSON,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "AppSubscription_shop_appName_key" ON "AppSubscription"("shop", "appName");
CREATE UNIQUE INDEX "AppSubscription_shopifySubscriptionId_key" ON "AppSubscription"("shopifySubscriptionId");
CREATE INDEX "AppSubscription_status_idx" ON "AppSubscription"("status");

-- 订阅周期 token 用量归档
CREATE TABLE "AccountPeriodUsage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "appName" TEXT NOT NULL,
    "appSubscriptionId" TEXT NOT NULL,
    "planKey" TEXT NOT NULL,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "usedTokens" INTEGER NOT NULL,
    "subscriptionTokensAllocated" INTEGER NOT NULL,
    "purchasedTokensRemaining" INTEGER NOT NULL DEFAULT 0,
    "trialTokensRemaining" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccountPeriodUsage_appSubscriptionId_fkey" FOREIGN KEY ("appSubscriptionId") REFERENCES "AppSubscription" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AccountPeriodUsage_shop_appName_fkey" FOREIGN KEY ("shop", "appName") REFERENCES "Account" ("shop", "appName") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AccountPeriodUsage_appSubscriptionId_periodStart_periodEnd_key" ON "AccountPeriodUsage"("appSubscriptionId", "periodStart", "periodEnd");
CREATE INDEX "AccountPeriodUsage_shop_appName_periodEnd_idx" ON "AccountPeriodUsage"("shop", "appName", "periodEnd");

-- 计费流水
CREATE TABLE "BillingLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "appName" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "planKey" TEXT,
    "referenceId" TEXT,
    "tokensDelta" INTEGER,
    "usedTokens" INTEGER,
    "metadata" JSON,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BillingLog_shop_appName_fkey" FOREIGN KEY ("shop", "appName") REFERENCES "Account" ("shop", "appName") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "BillingLog_shop_appName_createdAt_idx" ON "BillingLog"("shop", "appName", "createdAt");
CREATE INDEX "BillingLog_eventType_createdAt_idx" ON "BillingLog"("eventType", "createdAt");
CREATE INDEX "BillingLog_referenceId_idx" ON "BillingLog"("referenceId");

-- 卫星 App generate-description 测试套餐
INSERT INTO "PlanCatalog" (
    "planKey",
    "appName",
    "kind",
    "billingInterval",
    "displayName",
    "tokens",
    "priceAmount",
    "currencyCode",
    "trialDays",
    "shopifyPlanName",
    "sortOrder",
    "enabled",
    "createdAt",
    "updatedAt"
) VALUES
    (
        'gd_trial',
        'generate-description',
        'INTERNAL_TRIAL',
        NULL,
        'Free trial',
        10000,
        '0',
        'USD',
        NULL,
        'Generate Description Free Trial',
        10,
        1,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    ),
    (
        'gd_base_monthly',
        'generate-description',
        'SUBSCRIPTION',
        'MONTHLY',
        'Base (Monthly)',
        500000,
        '29.99',
        'USD',
        7,
        'Generate Description Base Monthly',
        20,
        1,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    ),
    (
        'gd_base_annual',
        'generate-description',
        'SUBSCRIPTION',
        'ANNUAL',
        'Base (Annual)',
        6500000,
        '299.99',
        'USD',
        7,
        'Generate Description Base Annual',
        30,
        1,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    ),
    (
        'gd_pack_100k',
        'generate-description',
        'ONE_TIME_PACK',
        NULL,
        'Token pack 100K',
        100000,
        '9.99',
        'USD',
        NULL,
        'Generate Description Token Pack 100K',
        40,
        1,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    ),
    (
        'gd_pack_500k',
        'generate-description',
        'ONE_TIME_PACK',
        NULL,
        'Token pack 500K',
        500000,
        '39.99',
        'USD',
        NULL,
        'Generate Description Token Pack 500K',
        50,
        1,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    );
