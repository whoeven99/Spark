-- Consolidate billing / session / AI task scope from (shop, appName) to shop-only.

-- 1) Merge duplicate Account rows per shop (sum token pools; keep canonical app row).
CREATE TEMP TABLE account_canonical AS
SELECT a.id AS canonical_id, a.shop, a.appName AS canonical_app
FROM Account AS a
WHERE a.rowid = (
  SELECT a2.rowid
  FROM Account AS a2
  WHERE a2.shop = a.shop
  ORDER BY
    CASE a2.appName
      WHEN 'product-improve' THEN 0
      WHEN 'generate-description' THEN 1
      WHEN 'spark' THEN 2
      WHEN 'chat' THEN 3
      ELSE 4
    END,
    datetime(a2.updatedAt) DESC
  LIMIT 1
);

UPDATE Account
SET
  subscriptionTokens = (
    SELECT COALESCE(SUM(a2.subscriptionTokens), 0)
    FROM Account AS a2
    WHERE a2.shop = Account.shop
  ),
  purchasedTokens = (
    SELECT COALESCE(SUM(a2.purchasedTokens), 0)
    FROM Account AS a2
    WHERE a2.shop = Account.shop
  ),
  trialTokens = (
    SELECT COALESCE(SUM(a2.trialTokens), 0)
    FROM Account AS a2
    WHERE a2.shop = Account.shop
  ),
  usedTokens = (
    SELECT COALESCE(SUM(a2.usedTokens), 0)
    FROM Account AS a2
    WHERE a2.shop = Account.shop
  )
WHERE id IN (SELECT canonical_id FROM account_canonical);

UPDATE BillingLog
SET appName = (
  SELECT canonical_app FROM account_canonical WHERE account_canonical.shop = BillingLog.shop
);

UPDATE ToolTokenUsageLog
SET appName = (
  SELECT canonical_app FROM account_canonical WHERE account_canonical.shop = ToolTokenUsageLog.shop
);

UPDATE AccountPeriodUsage
SET appName = (
  SELECT canonical_app FROM account_canonical WHERE account_canonical.shop = AccountPeriodUsage.shop
);

DELETE FROM AccountPeriodUsage
WHERE appSubscriptionId IN (
  SELECT s.id
  FROM AppSubscription AS s
  INNER JOIN account_canonical AS c ON c.shop = s.shop
  WHERE s.appName != c.canonical_app
);

DELETE FROM AppSubscription
WHERE rowid IN (
  SELECT s.rowid
  FROM AppSubscription AS s
  INNER JOIN account_canonical AS c ON c.shop = s.shop
  WHERE s.appName != c.canonical_app
);

DELETE FROM Account
WHERE id NOT IN (SELECT canonical_id FROM account_canonical);

-- Keep one EWMA row per taskType before dropping appName.
DELETE FROM AITaskEstimation
WHERE id NOT IN (
  SELECT e.id
  FROM AITaskEstimation AS e
  WHERE e.rowid = (
    SELECT e2.rowid
    FROM AITaskEstimation AS e2
    WHERE e2.taskType = e.taskType
    ORDER BY e2.sampleCount DESC, datetime(e2.updatedAt) DESC
    LIMIT 1
  )
);

-- 2) Redefine tables without appName columns.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_AITask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "taskType" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "result" JSONB,
    "estimatedCredits" INTEGER,
    "actualCredits" INTEGER,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "errorMsg" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AITask_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "AITaskBatch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_AITask" ("actualCredits", "batchId", "completedAt", "config", "createdAt", "errorMsg", "estimatedCredits", "id", "result", "shop", "startedAt", "status", "taskType", "updatedAt")
SELECT "actualCredits", "batchId", "completedAt", "config", "createdAt", "errorMsg", "estimatedCredits", "id", "result", "shop", "startedAt", "status", "taskType", "updatedAt" FROM "AITask";
DROP TABLE "AITask";
ALTER TABLE "new_AITask" RENAME TO "AITask";
CREATE INDEX "AITask_shop_taskType_createdAt_idx" ON "AITask"("shop", "taskType", "createdAt");
CREATE INDEX "AITask_batchId_idx" ON "AITask"("batchId");

CREATE TABLE "new_AITaskBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "taskType" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_AITaskBatch" ("config", "createdAt", "id", "shop", "taskType")
SELECT "config", "createdAt", "id", "shop", "taskType" FROM "AITaskBatch";
DROP TABLE "AITaskBatch";
ALTER TABLE "new_AITaskBatch" RENAME TO "AITaskBatch";
CREATE INDEX "AITaskBatch_shop_createdAt_idx" ON "AITaskBatch"("shop", "createdAt");

CREATE TABLE "new_Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "subscriptionTokens" INTEGER NOT NULL DEFAULT 0,
    "purchasedTokens" INTEGER NOT NULL DEFAULT 0,
    "trialTokens" INTEGER NOT NULL DEFAULT 0,
    "usedTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Account" ("createdAt", "id", "purchasedTokens", "shop", "subscriptionTokens", "trialTokens", "updatedAt", "usedTokens")
SELECT "createdAt", "id", "purchasedTokens", "shop", "subscriptionTokens", "trialTokens", "updatedAt", "usedTokens" FROM "Account";
DROP TABLE "Account";
ALTER TABLE "new_Account" RENAME TO "Account";
CREATE UNIQUE INDEX "Account_shop_key" ON "Account"("shop");

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
INSERT INTO "new_AppSubscription" ("billingInterval", "cancelledAt", "confirmationUrl", "createdAt", "currentPeriodEnd", "currentPeriodStart", "id", "planKey", "rawPayload", "shop", "shopifySubscriptionId", "status", "tokensPerPeriod", "trialEndsAt", "updatedAt")
SELECT "billingInterval", "cancelledAt", "confirmationUrl", "createdAt", "currentPeriodEnd", "currentPeriodStart", "id", "planKey", "rawPayload", "shop", "shopifySubscriptionId", "status", "tokensPerPeriod", "trialEndsAt", "updatedAt" FROM "AppSubscription";
DROP TABLE "AppSubscription";
ALTER TABLE "new_AppSubscription" RENAME TO "AppSubscription";
CREATE UNIQUE INDEX "AppSubscription_shopifySubscriptionId_key" ON "AppSubscription"("shopifySubscriptionId");
CREATE INDEX "AppSubscription_status_idx" ON "AppSubscription"("status");
CREATE UNIQUE INDEX "AppSubscription_shop_key" ON "AppSubscription"("shop");

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
INSERT INTO "new_AccountPeriodUsage" ("appSubscriptionId", "archivedAt", "id", "periodEnd", "periodStart", "planKey", "purchasedTokensRemaining", "shop", "subscriptionTokensAllocated", "trialTokensRemaining", "usedTokens")
SELECT "appSubscriptionId", "archivedAt", "id", "periodEnd", "periodStart", "planKey", "purchasedTokensRemaining", "shop", "subscriptionTokensAllocated", "trialTokensRemaining", "usedTokens" FROM "AccountPeriodUsage";
DROP TABLE "AccountPeriodUsage";
ALTER TABLE "new_AccountPeriodUsage" RENAME TO "AccountPeriodUsage";
CREATE INDEX "AccountPeriodUsage_shop_periodEnd_idx" ON "AccountPeriodUsage"("shop", "periodEnd");
CREATE UNIQUE INDEX "AccountPeriodUsage_appSubscriptionId_periodStart_periodEnd_key" ON "AccountPeriodUsage"("appSubscriptionId", "periodStart", "periodEnd");

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
INSERT INTO "new_BillingLog" ("createdAt", "eventType", "id", "metadata", "planKey", "referenceId", "shop", "tokensDelta", "usedTokens")
SELECT "createdAt", "eventType", "id", "metadata", "planKey", "referenceId", "shop", "tokensDelta", "usedTokens" FROM "BillingLog";
DROP TABLE "BillingLog";
ALTER TABLE "new_BillingLog" RENAME TO "BillingLog";
CREATE INDEX "BillingLog_shop_createdAt_idx" ON "BillingLog"("shop", "createdAt");
CREATE INDEX "BillingLog_eventType_createdAt_idx" ON "BillingLog"("eventType", "createdAt");
CREATE INDEX "BillingLog_referenceId_idx" ON "BillingLog"("referenceId");

CREATE TABLE "new_CommonEventLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "topic" TEXT,
    "referenceId" TEXT,
    "payload" JSONB,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_CommonEventLog" ("createdAt", "eventType", "id", "metadata", "payload", "referenceId", "shop", "topic")
SELECT "createdAt", "eventType", "id", "metadata", "payload", "referenceId", "shop", "topic" FROM "CommonEventLog";
DROP TABLE "CommonEventLog";
ALTER TABLE "new_CommonEventLog" RENAME TO "CommonEventLog";
CREATE INDEX "CommonEventLog_shop_createdAt_idx" ON "CommonEventLog"("shop", "createdAt");
CREATE INDEX "CommonEventLog_eventType_createdAt_idx" ON "CommonEventLog"("eventType", "createdAt");
CREATE INDEX "CommonEventLog_referenceId_idx" ON "CommonEventLog"("referenceId");

CREATE TABLE "new_Session" (
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
    "refreshTokenExpires" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Session" ("accessToken", "accountOwner", "collaborator", "createdAt", "email", "emailVerified", "expires", "firstName", "id", "isOnline", "lastName", "locale", "refreshToken", "refreshTokenExpires", "scope", "shop", "state", "updatedAt", "userId")
SELECT "accessToken", "accountOwner", "collaborator", "createdAt", "email", "emailVerified", "expires", "firstName", "id", "isOnline", "lastName", "locale", "refreshToken", "refreshTokenExpires", "scope", "shop", "state", "updatedAt", "userId" FROM "Session";
DROP TABLE "Session";
ALTER TABLE "new_Session" RENAME TO "Session";
CREATE INDEX "Session_shop_idx" ON "Session"("shop");

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
INSERT INTO "new_ToolTokenUsageLog" ("billedTokens", "createdAt", "feature", "id", "inputTokens", "modelKey", "outputTokens", "rawTokens", "shop")
SELECT "billedTokens", "createdAt", "feature", "id", "inputTokens", "modelKey", "outputTokens", "rawTokens", "shop" FROM "ToolTokenUsageLog";
DROP TABLE "ToolTokenUsageLog";
ALTER TABLE "new_ToolTokenUsageLog" RENAME TO "ToolTokenUsageLog";
CREATE INDEX "ToolTokenUsageLog_shop_createdAt_idx" ON "ToolTokenUsageLog"("shop", "createdAt");
CREATE INDEX "ToolTokenUsageLog_shop_feature_createdAt_idx" ON "ToolTokenUsageLog"("shop", "feature", "createdAt");
CREATE INDEX "ToolTokenUsageLog_feature_createdAt_idx" ON "ToolTokenUsageLog"("feature", "createdAt");

CREATE TABLE "new_AppVisitSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "utm" TEXT NOT NULL,
    "query" TEXT,
    "referer" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_AppVisitSource" ("createdAt", "id", "path", "query", "referer", "shop", "utm")
SELECT "createdAt", "id", "path", "query", "referer", "shop", "utm" FROM "AppVisitSource";
DROP TABLE "AppVisitSource";
ALTER TABLE "new_AppVisitSource" RENAME TO "AppVisitSource";
CREATE INDEX "AppVisitSource_shop_createdAt_idx" ON "AppVisitSource"("shop", "createdAt");
CREATE INDEX "AppVisitSource_utm_createdAt_idx" ON "AppVisitSource"("utm", "createdAt");
CREATE INDEX "AppVisitSource_utm_path_idx" ON "AppVisitSource"("utm", "path");

CREATE TABLE "new_AITaskEstimation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskType" TEXT NOT NULL,
    "ewmaCredits" REAL,
    "ewmaSeconds" REAL,
    "sampleCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_AITaskEstimation" ("ewmaCredits", "ewmaSeconds", "id", "sampleCount", "taskType", "updatedAt")
SELECT "ewmaCredits", "ewmaSeconds", "id", "sampleCount", "taskType", "updatedAt" FROM "AITaskEstimation";
DROP TABLE "AITaskEstimation";
ALTER TABLE "new_AITaskEstimation" RENAME TO "AITaskEstimation";
CREATE UNIQUE INDEX "AITaskEstimation_taskType_key" ON "AITaskEstimation"("taskType");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
