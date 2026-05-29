/*
  Warnings:

  - You are about to alter the column `credentials` on the `AdPlatformCredential` table. The data in that column could be lost. The data in that column will be cast from `Unsupported("json")` to `Json`.
  - You are about to alter the column `rawPayload` on the `AppSubscription` table. The data in that column could be lost. The data in that column will be cast from `Unsupported("json")` to `Json`.
  - You are about to alter the column `metadata` on the `BillingLog` table. The data in that column could be lost. The data in that column will be cast from `Unsupported("json")` to `Json`.
  - You are about to alter the column `metadata` on the `CommonEventLog` table. The data in that column could be lost. The data in that column will be cast from `Unsupported("json")` to `Json`.
  - You are about to alter the column `payload` on the `CommonEventLog` table. The data in that column could be lost. The data in that column will be cast from `Unsupported("json")` to `Json`.
  - You are about to alter the column `enabled` on the `PlanCatalog` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Boolean`.
  - You are about to alter the column `metadata` on the `ShopVisualJob` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AccountPeriodUsage" (
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
    CONSTRAINT "AccountPeriodUsage_shop_appName_fkey" FOREIGN KEY ("shop", "appName") REFERENCES "Account" ("shop", "appName") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AccountPeriodUsage_appSubscriptionId_fkey" FOREIGN KEY ("appSubscriptionId") REFERENCES "AppSubscription" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_AccountPeriodUsage" ("appName", "appSubscriptionId", "archivedAt", "id", "periodEnd", "periodStart", "planKey", "purchasedTokensRemaining", "shop", "subscriptionTokensAllocated", "trialTokensRemaining", "usedTokens") SELECT "appName", "appSubscriptionId", "archivedAt", "id", "periodEnd", "periodStart", "planKey", "purchasedTokensRemaining", "shop", "subscriptionTokensAllocated", "trialTokensRemaining", "usedTokens" FROM "AccountPeriodUsage";
DROP TABLE "AccountPeriodUsage";
ALTER TABLE "new_AccountPeriodUsage" RENAME TO "AccountPeriodUsage";
CREATE INDEX "AccountPeriodUsage_shop_appName_periodEnd_idx" ON "AccountPeriodUsage"("shop", "appName", "periodEnd");
CREATE UNIQUE INDEX "AccountPeriodUsage_appSubscriptionId_periodStart_periodEnd_key" ON "AccountPeriodUsage"("appSubscriptionId", "periodStart", "periodEnd");
CREATE TABLE "new_AdPlatformCredential" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "credentials" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_AdPlatformCredential" ("createdAt", "credentials", "id", "platform", "shop", "updatedAt") SELECT "createdAt", "credentials", "id", "platform", "shop", "updatedAt" FROM "AdPlatformCredential";
DROP TABLE "AdPlatformCredential";
ALTER TABLE "new_AdPlatformCredential" RENAME TO "AdPlatformCredential";
CREATE UNIQUE INDEX "AdPlatformCredential_shop_platform_key" ON "AdPlatformCredential"("shop", "platform");
CREATE TABLE "new_AppSubscription" (
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
    "rawPayload" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AppSubscription_shop_appName_fkey" FOREIGN KEY ("shop", "appName") REFERENCES "Account" ("shop", "appName") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_AppSubscription" ("appName", "billingInterval", "cancelledAt", "confirmationUrl", "createdAt", "currentPeriodEnd", "currentPeriodStart", "id", "planKey", "rawPayload", "shop", "shopifySubscriptionId", "status", "tokensPerPeriod", "trialEndsAt", "updatedAt") SELECT "appName", "billingInterval", "cancelledAt", "confirmationUrl", "createdAt", "currentPeriodEnd", "currentPeriodStart", "id", "planKey", "rawPayload", "shop", "shopifySubscriptionId", "status", "tokensPerPeriod", "trialEndsAt", "updatedAt" FROM "AppSubscription";
DROP TABLE "AppSubscription";
ALTER TABLE "new_AppSubscription" RENAME TO "AppSubscription";
CREATE UNIQUE INDEX "AppSubscription_shopifySubscriptionId_key" ON "AppSubscription"("shopifySubscriptionId");
CREATE INDEX "AppSubscription_status_idx" ON "AppSubscription"("status");
CREATE UNIQUE INDEX "AppSubscription_shop_appName_key" ON "AppSubscription"("shop", "appName");
CREATE TABLE "new_BillingLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "appName" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "planKey" TEXT,
    "referenceId" TEXT,
    "tokensDelta" INTEGER,
    "usedTokens" INTEGER,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BillingLog_shop_appName_fkey" FOREIGN KEY ("shop", "appName") REFERENCES "Account" ("shop", "appName") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_BillingLog" ("appName", "createdAt", "eventType", "id", "metadata", "planKey", "referenceId", "shop", "tokensDelta", "usedTokens") SELECT "appName", "createdAt", "eventType", "id", "metadata", "planKey", "referenceId", "shop", "tokensDelta", "usedTokens" FROM "BillingLog";
DROP TABLE "BillingLog";
ALTER TABLE "new_BillingLog" RENAME TO "BillingLog";
CREATE INDEX "BillingLog_shop_appName_createdAt_idx" ON "BillingLog"("shop", "appName", "createdAt");
CREATE INDEX "BillingLog_eventType_createdAt_idx" ON "BillingLog"("eventType", "createdAt");
CREATE INDEX "BillingLog_referenceId_idx" ON "BillingLog"("referenceId");
CREATE TABLE "new_CommonEventLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "appName" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "topic" TEXT,
    "referenceId" TEXT,
    "payload" JSONB,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_CommonEventLog" ("appName", "createdAt", "eventType", "id", "metadata", "payload", "referenceId", "shop", "topic") SELECT "appName", "createdAt", "eventType", "id", "metadata", "payload", "referenceId", "shop", "topic" FROM "CommonEventLog";
DROP TABLE "CommonEventLog";
ALTER TABLE "new_CommonEventLog" RENAME TO "CommonEventLog";
CREATE INDEX "CommonEventLog_shop_appName_createdAt_idx" ON "CommonEventLog"("shop", "appName", "createdAt");
CREATE INDEX "CommonEventLog_eventType_createdAt_idx" ON "CommonEventLog"("eventType", "createdAt");
CREATE INDEX "CommonEventLog_referenceId_idx" ON "CommonEventLog"("referenceId");
CREATE TABLE "new_PlanCatalog" (
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
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_PlanCatalog" ("appName", "billingInterval", "createdAt", "currencyCode", "displayName", "enabled", "kind", "planKey", "priceAmount", "shopifyPlanName", "sortOrder", "tokens", "trialDays", "updatedAt") SELECT "appName", "billingInterval", "createdAt", "currencyCode", "displayName", "enabled", "kind", "planKey", "priceAmount", "shopifyPlanName", "sortOrder", "tokens", "trialDays", "updatedAt" FROM "PlanCatalog";
DROP TABLE "PlanCatalog";
ALTER TABLE "new_PlanCatalog" RENAME TO "PlanCatalog";
CREATE INDEX "PlanCatalog_appName_enabled_sortOrder_idx" ON "PlanCatalog"("appName", "enabled", "sortOrder");
CREATE TABLE "new_Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "appName" TEXT NOT NULL DEFAULT 'chat',
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
    "refreshTokenExpires" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Session" ("accessToken", "accountOwner", "appName", "collaborator", "createdAt", "email", "emailVerified", "expires", "firstName", "id", "isOnline", "lastName", "locale", "refreshToken", "refreshTokenExpires", "scope", "shop", "state", "updatedAt", "userId") SELECT "accessToken", "accountOwner", "appName", "collaborator", "createdAt", "email", "emailVerified", "expires", "firstName", "id", "isOnline", "lastName", "locale", "refreshToken", "refreshTokenExpires", "scope", "shop", "state", "updatedAt", "userId" FROM "Session";
DROP TABLE "Session";
ALTER TABLE "new_Session" RENAME TO "Session";
CREATE INDEX "Session_appName_shop_idx" ON "Session"("appName", "shop");
CREATE TABLE "new_ShopVisualJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "blobPath" TEXT,
    "errorMsg" TEXT,
    "provider" TEXT,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_ShopVisualJob" ("blobPath", "createdAt", "errorMsg", "id", "kind", "metadata", "provider", "requestId", "shop", "status", "summary", "updatedAt") SELECT "blobPath", "createdAt", "errorMsg", "id", "kind", "metadata", "provider", "requestId", "shop", "status", "summary", "updatedAt" FROM "ShopVisualJob";
DROP TABLE "ShopVisualJob";
ALTER TABLE "new_ShopVisualJob" RENAME TO "ShopVisualJob";
CREATE UNIQUE INDEX "ShopVisualJob_requestId_key" ON "ShopVisualJob"("requestId");
CREATE INDEX "ShopVisualJob_shop_kind_createdAt_idx" ON "ShopVisualJob"("shop", "kind", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
