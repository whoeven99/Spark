-- Auto-generated from prisma/migrations by scripts/turso-sync.cjs
-- Do not edit manually unless necessary.

-- CreateTable
CREATE TABLE IF NOT EXISTS "Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "appName" TEXT NOT NULL,
    "subscriptionTokens" INTEGER NOT NULL DEFAULT 0,
    "purchasedTokens" INTEGER NOT NULL DEFAULT 0,
    "trialTokens" INTEGER NOT NULL DEFAULT 0,
    "usedTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AccountPeriodUsage" (
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
    FOREIGN KEY ("shop", "appName") REFERENCES "Account" ("shop", "appName") ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY ("appSubscriptionId") REFERENCES "AppSubscription" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AdPlatformCredential" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "credentials" json NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AppSubscription" (
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
    "rawPayload" json,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "BillingLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "appName" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "planKey" TEXT,
    "referenceId" TEXT,
    "tokensDelta" INTEGER,
    "usedTokens" INTEGER,
    "metadata" json,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("shop", "appName") REFERENCES "Account" ("shop", "appName") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PlanCatalog" (
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

-- CreateTable
CREATE TABLE IF NOT EXISTS "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" DATETIME,
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" DATETIME
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Session_generate_description" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" DATETIME,
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" DATETIME
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Suggestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Account_shop_idx" ON "Account"("shop" ASC);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Account_shop_appName_key" ON "Account"("shop" ASC, "appName" ASC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AccountPeriodUsage_shop_appName_periodEnd_idx" ON "AccountPeriodUsage"("shop" ASC, "appName" ASC, "periodEnd" ASC);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AccountPeriodUsage_appSubscriptionId_periodStart_periodEnd_key" ON "AccountPeriodUsage"("appSubscriptionId" ASC, "periodStart" ASC, "periodEnd" ASC);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AdPlatformCredential_shop_platform_key" ON "AdPlatformCredential"("shop" ASC, "platform" ASC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AppSubscription_status_idx" ON "AppSubscription"("status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AppSubscription_shopifySubscriptionId_key" ON "AppSubscription"("shopifySubscriptionId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AppSubscription_shop_appName_key" ON "AppSubscription"("shop" ASC, "appName" ASC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BillingLog_referenceId_idx" ON "BillingLog"("referenceId" ASC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BillingLog_eventType_createdAt_idx" ON "BillingLog"("eventType" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BillingLog_shop_appName_createdAt_idx" ON "BillingLog"("shop" ASC, "appName" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PlanCatalog_appName_enabled_sortOrder_idx" ON "PlanCatalog"("appName" ASC, "enabled" ASC, "sortOrder" ASC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Suggestion_shop_createdAt_idx" ON "Suggestion"("shop" ASC, "createdAt" ASC);
