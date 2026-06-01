-- CreateTable
CREATE TABLE "Session" (
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

-- CreateTable
CREATE TABLE "Suggestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AdPlatformCredential" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "credentials" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Account" (
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
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
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
    "rawPayload" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AppSubscription_shop_appName_fkey" FOREIGN KEY ("shop", "appName") REFERENCES "Account" ("shop", "appName") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
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
    CONSTRAINT "AccountPeriodUsage_shop_appName_fkey" FOREIGN KEY ("shop", "appName") REFERENCES "Account" ("shop", "appName") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AccountPeriodUsage_appSubscriptionId_fkey" FOREIGN KEY ("appSubscriptionId") REFERENCES "AppSubscription" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CommonEventLog" (
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

-- CreateTable
CREATE TABLE "BillingLog" (
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

-- CreateTable
CREATE TABLE "ShopVisualJob" (
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

-- CreateTable
CREATE TABLE "ShopOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "shopifyOrderId" TEXT NOT NULL,
    "orderNumber" INTEGER NOT NULL,
    "email" TEXT,
    "financialStatus" TEXT,
    "fulfillmentStatus" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "currency" TEXT NOT NULL,
    "totalPrice" REAL NOT NULL,
    "subtotalPrice" REAL NOT NULL DEFAULT 0,
    "totalDiscounts" REAL NOT NULL DEFAULT 0,
    "totalTax" REAL NOT NULL DEFAULT 0,
    "totalShipping" REAL NOT NULL DEFAULT 0,
    "cancelledAt" DATETIME,
    "cancelReason" TEXT,
    "createdAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    "processedAt" DATETIME,
    "paidAt" DATETIME,
    "closedAt" DATETIME,
    "shopifyCustomerId" TEXT,
    "customerFirstName" TEXT,
    "customerLastName" TEXT,
    "customerEmail" TEXT,
    "tags" TEXT,
    "sourceName" TEXT,
    "landingSite" TEXT,
    "referringSite" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "isFirstOrder" BOOLEAN NOT NULL DEFAULT false,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ShopOrderLineItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "shopifyOrderId" TEXT NOT NULL,
    "lineItemId" TEXT NOT NULL,
    "variantId" TEXT,
    "productId" TEXT,
    "title" TEXT NOT NULL,
    "variantTitle" TEXT,
    "sku" TEXT,
    "quantity" INTEGER NOT NULL,
    "price" REAL NOT NULL,
    "totalDiscount" REAL NOT NULL DEFAULT 0,
    "vendor" TEXT,
    CONSTRAINT "ShopOrderLineItem_shop_shopifyOrderId_fkey" FOREIGN KEY ("shop", "shopifyOrderId") REFERENCES "ShopOrder" ("shop", "shopifyOrderId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShopRefund" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "shopifyRefundId" TEXT NOT NULL,
    "shopifyOrderId" TEXT NOT NULL,
    "refundAmount" REAL NOT NULL DEFAULT 0,
    "refundNote" TEXT,
    "reason" TEXT,
    "processedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShopRefund_shop_shopifyOrderId_fkey" FOREIGN KEY ("shop", "shopifyOrderId") REFERENCES "ShopOrder" ("shop", "shopifyOrderId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShopCustomer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "shopifyCustomerId" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "ordersCount" INTEGER NOT NULL DEFAULT 0,
    "totalSpent" REAL NOT NULL DEFAULT 0,
    "firstOrderDate" DATETIME,
    "lastOrderDate" DATETIME,
    "state" TEXT,
    "tags" TEXT,
    "acceptsMarketing" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ShopInventoryLevel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "locationName" TEXT,
    "available" INTEGER NOT NULL DEFAULT 0,
    "onHand" INTEGER NOT NULL DEFAULT 0,
    "committed" INTEGER NOT NULL DEFAULT 0,
    "incoming" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ShopFulfillment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "shopifyFulfillmentId" TEXT NOT NULL,
    "shopifyOrderId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "trackingCompany" TEXT,
    "trackingNumber" TEXT,
    "trackingUrl" TEXT,
    "shipmentStatus" TEXT,
    "createdAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    "shippedAt" DATETIME,
    "deliveredAt" DATETIME,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShopFulfillment_shop_shopifyOrderId_fkey" FOREIGN KEY ("shop", "shopifyOrderId") REFERENCES "ShopOrder" ("shop", "shopifyOrderId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShopSyncCheckpoint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "lastSyncedAt" DATETIME NOT NULL,
    "lastCursor" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TokenBillingRule" (
    "ruleKey" TEXT NOT NULL PRIMARY KEY,
    "appName" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "modelKey" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "multiplier" REAL NOT NULL,
    "baseTokenCost" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "Session_appName_shop_idx" ON "Session"("appName", "shop");

-- CreateIndex
CREATE INDEX "Suggestion_shop_createdAt_idx" ON "Suggestion"("shop", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdPlatformCredential_shop_platform_key" ON "AdPlatformCredential"("shop", "platform");

-- CreateIndex
CREATE INDEX "Account_shop_idx" ON "Account"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "Account_shop_appName_key" ON "Account"("shop", "appName");

-- CreateIndex
CREATE INDEX "PlanCatalog_appName_enabled_sortOrder_idx" ON "PlanCatalog"("appName", "enabled", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "AppSubscription_shopifySubscriptionId_key" ON "AppSubscription"("shopifySubscriptionId");

-- CreateIndex
CREATE INDEX "AppSubscription_status_idx" ON "AppSubscription"("status");

-- CreateIndex
CREATE UNIQUE INDEX "AppSubscription_shop_appName_key" ON "AppSubscription"("shop", "appName");

-- CreateIndex
CREATE INDEX "AccountPeriodUsage_shop_appName_periodEnd_idx" ON "AccountPeriodUsage"("shop", "appName", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "AccountPeriodUsage_appSubscriptionId_periodStart_periodEnd_key" ON "AccountPeriodUsage"("appSubscriptionId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "CommonEventLog_shop_appName_createdAt_idx" ON "CommonEventLog"("shop", "appName", "createdAt");

-- CreateIndex
CREATE INDEX "CommonEventLog_eventType_createdAt_idx" ON "CommonEventLog"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "CommonEventLog_referenceId_idx" ON "CommonEventLog"("referenceId");

-- CreateIndex
CREATE INDEX "BillingLog_shop_appName_createdAt_idx" ON "BillingLog"("shop", "appName", "createdAt");

-- CreateIndex
CREATE INDEX "BillingLog_eventType_createdAt_idx" ON "BillingLog"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "BillingLog_referenceId_idx" ON "BillingLog"("referenceId");

-- CreateIndex
CREATE UNIQUE INDEX "ShopVisualJob_requestId_key" ON "ShopVisualJob"("requestId");

-- CreateIndex
CREATE INDEX "ShopVisualJob_shop_kind_createdAt_idx" ON "ShopVisualJob"("shop", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "ShopOrder_shop_createdAt_idx" ON "ShopOrder"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "ShopOrder_shop_paidAt_idx" ON "ShopOrder"("shop", "paidAt");

-- CreateIndex
CREATE INDEX "ShopOrder_shop_financialStatus_idx" ON "ShopOrder"("shop", "financialStatus");

-- CreateIndex
CREATE INDEX "ShopOrder_shop_shopifyCustomerId_idx" ON "ShopOrder"("shop", "shopifyCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "ShopOrder_shop_shopifyOrderId_key" ON "ShopOrder"("shop", "shopifyOrderId");

-- CreateIndex
CREATE INDEX "ShopOrderLineItem_shop_shopifyOrderId_idx" ON "ShopOrderLineItem"("shop", "shopifyOrderId");

-- CreateIndex
CREATE INDEX "ShopOrderLineItem_shop_sku_idx" ON "ShopOrderLineItem"("shop", "sku");

-- CreateIndex
CREATE INDEX "ShopOrderLineItem_shop_productId_idx" ON "ShopOrderLineItem"("shop", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "ShopOrderLineItem_shop_lineItemId_key" ON "ShopOrderLineItem"("shop", "lineItemId");

-- CreateIndex
CREATE INDEX "ShopRefund_shop_shopifyOrderId_idx" ON "ShopRefund"("shop", "shopifyOrderId");

-- CreateIndex
CREATE INDEX "ShopRefund_shop_processedAt_idx" ON "ShopRefund"("shop", "processedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ShopRefund_shop_shopifyRefundId_key" ON "ShopRefund"("shop", "shopifyRefundId");

-- CreateIndex
CREATE INDEX "ShopCustomer_shop_email_idx" ON "ShopCustomer"("shop", "email");

-- CreateIndex
CREATE INDEX "ShopCustomer_shop_firstOrderDate_idx" ON "ShopCustomer"("shop", "firstOrderDate");

-- CreateIndex
CREATE INDEX "ShopCustomer_shop_lastOrderDate_idx" ON "ShopCustomer"("shop", "lastOrderDate");

-- CreateIndex
CREATE UNIQUE INDEX "ShopCustomer_shop_shopifyCustomerId_key" ON "ShopCustomer"("shop", "shopifyCustomerId");

-- CreateIndex
CREATE INDEX "ShopInventoryLevel_shop_locationId_idx" ON "ShopInventoryLevel"("shop", "locationId");

-- CreateIndex
CREATE INDEX "ShopInventoryLevel_shop_available_idx" ON "ShopInventoryLevel"("shop", "available");

-- CreateIndex
CREATE UNIQUE INDEX "ShopInventoryLevel_shop_inventoryItemId_locationId_key" ON "ShopInventoryLevel"("shop", "inventoryItemId", "locationId");

-- CreateIndex
CREATE INDEX "ShopFulfillment_shop_shopifyOrderId_idx" ON "ShopFulfillment"("shop", "shopifyOrderId");

-- CreateIndex
CREATE INDEX "ShopFulfillment_shop_status_idx" ON "ShopFulfillment"("shop", "status");

-- CreateIndex
CREATE INDEX "ShopFulfillment_shop_createdAt_idx" ON "ShopFulfillment"("shop", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ShopFulfillment_shop_shopifyFulfillmentId_key" ON "ShopFulfillment"("shop", "shopifyFulfillmentId");

-- CreateIndex
CREATE UNIQUE INDEX "ShopSyncCheckpoint_shop_resource_key" ON "ShopSyncCheckpoint"("shop", "resource");

-- CreateIndex
CREATE INDEX "TokenBillingRule_appName_feature_enabled_idx" ON "TokenBillingRule"("appName", "feature", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "TokenBillingRule_appName_feature_modelKey_key" ON "TokenBillingRule"("appName", "feature", "modelKey");
