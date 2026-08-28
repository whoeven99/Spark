-- CreateTable
CREATE TABLE "Session" (
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
    "shopName" TEXT,
    "shopOwnerName" TEXT,
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
    "externalAccountId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "GmcProductStatus" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "contentLanguage" TEXT NOT NULL DEFAULT 'und',
    "feedLabel" TEXT NOT NULL DEFAULT 'ZZ',
    "shopifyProductId" TEXT,
    "title" TEXT,
    "status" TEXT NOT NULL,
    "issues" JSONB,
    "checkedAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "MetaProductStatus" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "catalogId" TEXT NOT NULL,
    "retailerId" TEXT NOT NULL,
    "shopifyProductId" TEXT,
    "title" TEXT,
    "status" TEXT NOT NULL,
    "issues" JSONB,
    "checkedAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AdEntity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "parentId" TEXT,
    "syncedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AdMetricDaily" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "adId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "spend" REAL NOT NULL DEFAULT 0,
    "conversions" REAL NOT NULL DEFAULT 0,
    "conversionsValue" REAL NOT NULL DEFAULT 0,
    "purchases" REAL,
    "purchaseValue" REAL,
    "addToCart" REAL,
    "landingPageViews" REAL,
    "outboundClicks" REAL,
    "videoViews" REAL,
    "thruplay" REAL,
    "leads" REAL,
    "viewContent" REAL,
    "initiateCheckout" REAL,
    "allConversions" REAL,
    "fetchedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AdInsightsSync" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "accountName" TEXT,
    "currencyCode" TEXT,
    "dateStart" TEXT NOT NULL,
    "dateEnd" TEXT NOT NULL,
    "fetchedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "subscriptionTokens" INTEGER NOT NULL DEFAULT 0,
    "purchasedTokens" INTEGER NOT NULL DEFAULT 0,
    "trialTokens" INTEGER NOT NULL DEFAULT 0,
    "usedTokens" INTEGER NOT NULL DEFAULT 0,
    "trialDailyUsed" INTEGER NOT NULL DEFAULT 0,
    "trialDailyResetAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PlanCatalog" (
    "planKey" TEXT NOT NULL PRIMARY KEY,
    "appName" TEXT NOT NULL DEFAULT 'spark',
    "kind" TEXT NOT NULL,
    "billingInterval" TEXT,
    "displayName" TEXT NOT NULL,
    "tokens" INTEGER NOT NULL,
    "priceAmount" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "trialDays" INTEGER,
    "shopifyPlanName" TEXT,
    "overagePricePerThousand" TEXT,
    "defaultOverageCapAmount" TEXT,
    "overageTerms" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AppSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "planKey" TEXT NOT NULL,
    "shopifySubscriptionId" TEXT NOT NULL,
    "billingInterval" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "tokensPerPeriod" INTEGER NOT NULL,
    "usageLineItemId" TEXT,
    "overagePricePerThousand" TEXT,
    "cappedAmount" TEXT,
    "cappedCurrency" TEXT,
    "usageBalanceUsed" TEXT,
    "overageSpendLimit" TEXT,
    "overagePendingTokens" INTEGER NOT NULL DEFAULT 0,
    "overageEnabled" BOOLEAN NOT NULL DEFAULT false,
    "overageSpendingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "trialEndsAt" DATETIME,
    "currentPeriodStart" DATETIME,
    "currentPeriodEnd" DATETIME,
    "cancelledAt" DATETIME,
    "confirmationUrl" TEXT,
    "pendingShopifySubscriptionId" TEXT,
    "pendingPlanKey" TEXT,
    "pendingConfirmationUrl" TEXT,
    "pendingCreatedAt" DATETIME,
    "rawPayload" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AppSubscription_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Account" ("shop") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OverageUsageCharge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "appSubscriptionId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "tokens" INTEGER NOT NULL,
    "amount" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL,
    "shopifyUsageRecordId" TEXT,
    "periodStart" DATETIME,
    "periodEnd" DATETIME,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OverageUsageCharge_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Account" ("shop") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OverageUsageCharge_appSubscriptionId_fkey" FOREIGN KEY ("appSubscriptionId") REFERENCES "AppSubscription" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AccountPeriodUsage" (
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
CREATE TABLE "AppVisitSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "utm" TEXT NOT NULL,
    "query" TEXT,
    "referer" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "BillingLog" (
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

-- CreateTable
CREATE TABLE "ToolTokenUsageLog" (
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

-- CreateTable
CREATE TABLE "AITaskEstimation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskType" TEXT NOT NULL,
    "bucket" TEXT NOT NULL DEFAULT 'default',
    "ewmaCredits" REAL,
    "ewmaSeconds" REAL,
    "sampleCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AITaskBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "taskType" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AITask" (
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

-- CreateTable
CREATE TABLE "AITaskLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "elapsedSeconds" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AITaskLog_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "AITask" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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
    "presentmentCurrencyCode" TEXT,
    "customerLocale" TEXT,
    "shippingCountryCode" TEXT,
    "shippingProvinceCode" TEXT,
    "billingCountryCode" TEXT,
    "billingProvinceCode" TEXT,
    "isFirstOrder" BOOLEAN NOT NULL DEFAULT false,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ShopOrderLineItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "shopifyOrderId" TEXT NOT NULL,
    "lineItemId" TEXT NOT NULL,
    "inventoryItemId" TEXT,
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
    "shippingRefundAmount" REAL NOT NULL DEFAULT 0,
    "shippingRefundTax" REAL NOT NULL DEFAULT 0,
    "refundNote" TEXT,
    "reason" TEXT,
    "processedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShopRefund_shop_shopifyOrderId_fkey" FOREIGN KEY ("shop", "shopifyOrderId") REFERENCES "ShopOrder" ("shop", "shopifyOrderId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShopRefundLineItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "shopifyRefundId" TEXT NOT NULL,
    "shopifyOrderId" TEXT NOT NULL,
    "refundLineItemId" TEXT NOT NULL,
    "lineItemId" TEXT NOT NULL,
    "inventoryItemId" TEXT,
    "variantId" TEXT,
    "productId" TEXT,
    "title" TEXT,
    "variantTitle" TEXT,
    "sku" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "subtotal" REAL NOT NULL DEFAULT 0,
    "totalTax" REAL NOT NULL DEFAULT 0,
    "reason" TEXT,
    "restockType" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShopRefundLineItem_shop_shopifyRefundId_fkey" FOREIGN KEY ("shop", "shopifyRefundId") REFERENCES "ShopRefund" ("shop", "shopifyRefundId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ShopRefundLineItem_shop_shopifyOrderId_fkey" FOREIGN KEY ("shop", "shopifyOrderId") REFERENCES "ShopOrder" ("shop", "shopifyOrderId") ON DELETE RESTRICT ON UPDATE CASCADE
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
    "variantId" TEXT,
    "productId" TEXT,
    "sku" TEXT,
    "productTitle" TEXT,
    "variantTitle" TEXT,
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
CREATE TABLE "WorkspaceFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT '',
    "originalSize" INTEGER NOT NULL,
    "charCount" INTEGER NOT NULL,
    "blobPath" TEXT NOT NULL,
    "originalBlobPath" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '新对话',
    "preview" TEXT NOT NULL DEFAULT '',
    "contextJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "payloads" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TokenBillingRule" (
    "ruleKey" TEXT NOT NULL PRIMARY KEY,
    "feature" TEXT NOT NULL,
    "modelKey" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "multiplier" REAL NOT NULL,
    "baseTokenCost" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "OperationDiagnosisSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "snapshotDate" TEXT NOT NULL,
    "hasData" BOOLEAN NOT NULL DEFAULT true,
    "metrics" JSONB NOT NULL,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "OperationDiagnosisItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "metrics" JSONB NOT NULL,
    "evidence" JSONB NOT NULL,
    "reasoning" JSONB NOT NULL,
    "formulas" JSONB NOT NULL,
    CONSTRAINT "OperationDiagnosisItem_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "OperationDiagnosisSnapshot" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OperationTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "snapshotId" TEXT,
    "sourceKey" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'rule',
    "dedupeKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "quadrant" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "triggerReason" TEXT NOT NULL,
    "objective" TEXT,
    "impactMetrics" JSONB,
    "estimatedLift" TEXT,
    "roiImpactSummary" TEXT,
    "confidence" TEXT,
    "riskEnvironment" TEXT,
    "aiContextPayload" JSONB,
    "relatedObjects" JSONB NOT NULL,
    "suggestedActions" JSONB NOT NULL,
    "ownerRole" TEXT,
    "dueWindow" TEXT NOT NULL,
    "dueAt" DATETIME,
    "resolvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OperationTask_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "OperationDiagnosisSnapshot" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShopCostConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "defaultGrossMarginPercent" REAL NOT NULL DEFAULT 60,
    "paymentFeePercent" REAL NOT NULL DEFAULT 2.9,
    "paymentFeeFixed" REAL NOT NULL DEFAULT 0.3,
    "monthlyFixedCost" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ShopSkuCost" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "variantId" TEXT,
    "sku" TEXT,
    "unitCost" REAL NOT NULL,
    "currency" TEXT,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SupportConversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'spark',
    "contactEmail" TEXT,
    "shopEmail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "lastMessage" TEXT NOT NULL DEFAULT '',
    "lastMessageAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unreadForOps" INTEGER NOT NULL DEFAULT 0,
    "unreadForShop" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SupportMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "senderName" TEXT,
    "content" TEXT NOT NULL,
    "payloads" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupportMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "SupportConversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShopCustomerValue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "shopifyCustomerId" TEXT NOT NULL,
    "segment" TEXT NOT NULL,
    "tags" JSONB NOT NULL,
    "ordersCount" INTEGER NOT NULL DEFAULT 0,
    "totalSpent" REAL NOT NULL DEFAULT 0,
    "realizedGrossProfit" REAL NOT NULL DEFAULT 0,
    "predictedFutureProfit" REAL NOT NULL DEFAULT 0,
    "dynamicLtv" REAL NOT NULL DEFAULT 0,
    "customerValueScore" REAL NOT NULL DEFAULT 0,
    "refundAmount" REAL NOT NULL DEFAULT 0,
    "refundRate" REAL NOT NULL DEFAULT 0,
    "discountOrderShare" REAL NOT NULL DEFAULT 0,
    "daysSinceLastOrder" INTEGER,
    "firstOrderAt" DATETIME,
    "lastOrderAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ImageMapping" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "targetBlobPath" TEXT NOT NULL,
    "sourceCode" TEXT NOT NULL,
    "targetCode" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "Session_shop_idx" ON "Session"("shop");

-- CreateIndex
CREATE INDEX "Suggestion_shop_createdAt_idx" ON "Suggestion"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "AdPlatformCredential_platform_externalAccountId_idx" ON "AdPlatformCredential"("platform", "externalAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "AdPlatformCredential_shop_platform_key" ON "AdPlatformCredential"("shop", "platform");

-- CreateIndex
CREATE INDEX "GmcProductStatus_shop_status_idx" ON "GmcProductStatus"("shop", "status");

-- CreateIndex
CREATE INDEX "GmcProductStatus_shop_merchantId_idx" ON "GmcProductStatus"("shop", "merchantId");

-- CreateIndex
CREATE UNIQUE INDEX "GmcProductStatus_shop_offerId_contentLanguage_feedLabel_key" ON "GmcProductStatus"("shop", "offerId", "contentLanguage", "feedLabel");

-- CreateIndex
CREATE INDEX "MetaProductStatus_shop_status_idx" ON "MetaProductStatus"("shop", "status");

-- CreateIndex
CREATE INDEX "MetaProductStatus_shop_catalogId_idx" ON "MetaProductStatus"("shop", "catalogId");

-- CreateIndex
CREATE UNIQUE INDEX "MetaProductStatus_shop_retailerId_key" ON "MetaProductStatus"("shop", "retailerId");

-- CreateIndex
CREATE INDEX "AdEntity_shop_platform_idx" ON "AdEntity"("shop", "platform");

-- CreateIndex
CREATE UNIQUE INDEX "AdEntity_shop_platform_level_externalId_key" ON "AdEntity"("shop", "platform", "level", "externalId");

-- CreateIndex
CREATE INDEX "AdMetricDaily_shop_platform_date_idx" ON "AdMetricDaily"("shop", "platform", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AdMetricDaily_shop_platform_adId_date_key" ON "AdMetricDaily"("shop", "platform", "adId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AdInsightsSync_shop_platform_key" ON "AdInsightsSync"("shop", "platform");

-- CreateIndex
CREATE UNIQUE INDEX "Account_shop_key" ON "Account"("shop");

-- CreateIndex
CREATE INDEX "PlanCatalog_enabled_sortOrder_idx" ON "PlanCatalog"("enabled", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "AppSubscription_shopifySubscriptionId_key" ON "AppSubscription"("shopifySubscriptionId");

-- CreateIndex
CREATE INDEX "AppSubscription_status_idx" ON "AppSubscription"("status");

-- CreateIndex
CREATE INDEX "AppSubscription_pendingShopifySubscriptionId_idx" ON "AppSubscription"("pendingShopifySubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "AppSubscription_shop_key" ON "AppSubscription"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "OverageUsageCharge_idempotencyKey_key" ON "OverageUsageCharge"("idempotencyKey");

-- CreateIndex
CREATE INDEX "OverageUsageCharge_shop_createdAt_idx" ON "OverageUsageCharge"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "OverageUsageCharge_appSubscriptionId_status_idx" ON "OverageUsageCharge"("appSubscriptionId", "status");

-- CreateIndex
CREATE INDEX "AccountPeriodUsage_shop_periodEnd_idx" ON "AccountPeriodUsage"("shop", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "AccountPeriodUsage_appSubscriptionId_periodStart_periodEnd_key" ON "AccountPeriodUsage"("appSubscriptionId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "CommonEventLog_shop_createdAt_idx" ON "CommonEventLog"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "CommonEventLog_eventType_createdAt_idx" ON "CommonEventLog"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "CommonEventLog_referenceId_idx" ON "CommonEventLog"("referenceId");

-- CreateIndex
CREATE UNIQUE INDEX "CommonEventLog_shop_eventType_referenceId_key" ON "CommonEventLog"("shop", "eventType", "referenceId");

-- CreateIndex
CREATE INDEX "AppVisitSource_shop_createdAt_idx" ON "AppVisitSource"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "AppVisitSource_utm_createdAt_idx" ON "AppVisitSource"("utm", "createdAt");

-- CreateIndex
CREATE INDEX "AppVisitSource_utm_path_idx" ON "AppVisitSource"("utm", "path");

-- CreateIndex
CREATE INDEX "BillingLog_shop_createdAt_idx" ON "BillingLog"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "BillingLog_eventType_createdAt_idx" ON "BillingLog"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "BillingLog_referenceId_idx" ON "BillingLog"("referenceId");

-- CreateIndex
CREATE INDEX "ToolTokenUsageLog_shop_createdAt_idx" ON "ToolTokenUsageLog"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "ToolTokenUsageLog_shop_feature_createdAt_idx" ON "ToolTokenUsageLog"("shop", "feature", "createdAt");

-- CreateIndex
CREATE INDEX "ToolTokenUsageLog_feature_createdAt_idx" ON "ToolTokenUsageLog"("feature", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AITaskEstimation_taskType_bucket_key" ON "AITaskEstimation"("taskType", "bucket");

-- CreateIndex
CREATE INDEX "AITaskBatch_shop_createdAt_idx" ON "AITaskBatch"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "AITask_shop_taskType_createdAt_idx" ON "AITask"("shop", "taskType", "createdAt");

-- CreateIndex
CREATE INDEX "AITask_batchId_idx" ON "AITask"("batchId");

-- CreateIndex
CREATE INDEX "AITaskLog_taskId_createdAt_idx" ON "AITaskLog"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "ShopOrder_shop_createdAt_idx" ON "ShopOrder"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "ShopOrder_shop_paidAt_idx" ON "ShopOrder"("shop", "paidAt");

-- CreateIndex
CREATE INDEX "ShopOrder_shop_financialStatus_idx" ON "ShopOrder"("shop", "financialStatus");

-- CreateIndex
CREATE INDEX "ShopOrder_shop_shopifyCustomerId_idx" ON "ShopOrder"("shop", "shopifyCustomerId");

-- CreateIndex
CREATE INDEX "ShopOrder_shop_shippingCountryCode_idx" ON "ShopOrder"("shop", "shippingCountryCode");

-- CreateIndex
CREATE INDEX "ShopOrder_shop_billingCountryCode_idx" ON "ShopOrder"("shop", "billingCountryCode");

-- CreateIndex
CREATE UNIQUE INDEX "ShopOrder_shop_shopifyOrderId_key" ON "ShopOrder"("shop", "shopifyOrderId");

-- CreateIndex
CREATE INDEX "ShopOrderLineItem_shop_shopifyOrderId_idx" ON "ShopOrderLineItem"("shop", "shopifyOrderId");

-- CreateIndex
CREATE INDEX "ShopOrderLineItem_shop_sku_idx" ON "ShopOrderLineItem"("shop", "sku");

-- CreateIndex
CREATE INDEX "ShopOrderLineItem_shop_inventoryItemId_idx" ON "ShopOrderLineItem"("shop", "inventoryItemId");

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
CREATE INDEX "ShopRefundLineItem_shop_shopifyRefundId_idx" ON "ShopRefundLineItem"("shop", "shopifyRefundId");

-- CreateIndex
CREATE INDEX "ShopRefundLineItem_shop_shopifyOrderId_idx" ON "ShopRefundLineItem"("shop", "shopifyOrderId");

-- CreateIndex
CREATE INDEX "ShopRefundLineItem_shop_lineItemId_idx" ON "ShopRefundLineItem"("shop", "lineItemId");

-- CreateIndex
CREATE INDEX "ShopRefundLineItem_shop_sku_idx" ON "ShopRefundLineItem"("shop", "sku");

-- CreateIndex
CREATE INDEX "ShopRefundLineItem_shop_reason_idx" ON "ShopRefundLineItem"("shop", "reason");

-- CreateIndex
CREATE UNIQUE INDEX "ShopRefundLineItem_shop_refundLineItemId_key" ON "ShopRefundLineItem"("shop", "refundLineItemId");

-- CreateIndex
CREATE INDEX "ShopCustomer_shop_email_idx" ON "ShopCustomer"("shop", "email");

-- CreateIndex
CREATE INDEX "ShopCustomer_shop_firstOrderDate_idx" ON "ShopCustomer"("shop", "firstOrderDate");

-- CreateIndex
CREATE INDEX "ShopCustomer_shop_lastOrderDate_idx" ON "ShopCustomer"("shop", "lastOrderDate");

-- CreateIndex
CREATE UNIQUE INDEX "ShopCustomer_shop_shopifyCustomerId_key" ON "ShopCustomer"("shop", "shopifyCustomerId");

-- CreateIndex
CREATE INDEX "ShopInventoryLevel_shop_sku_idx" ON "ShopInventoryLevel"("shop", "sku");

-- CreateIndex
CREATE INDEX "ShopInventoryLevel_shop_variantId_idx" ON "ShopInventoryLevel"("shop", "variantId");

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
CREATE INDEX "WorkspaceFile_shop_createdAt_idx" ON "WorkspaceFile"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "Conversation_shop_updatedAt_idx" ON "Conversation"("shop", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "TokenBillingRule_feature_enabled_idx" ON "TokenBillingRule"("feature", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "TokenBillingRule_feature_modelKey_key" ON "TokenBillingRule"("feature", "modelKey");

-- CreateIndex
CREATE INDEX "OperationDiagnosisSnapshot_shop_generatedAt_idx" ON "OperationDiagnosisSnapshot"("shop", "generatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "OperationDiagnosisSnapshot_shop_snapshotDate_key" ON "OperationDiagnosisSnapshot"("shop", "snapshotDate");

-- CreateIndex
CREATE INDEX "OperationDiagnosisItem_shop_key_idx" ON "OperationDiagnosisItem"("shop", "key");

-- CreateIndex
CREATE INDEX "OperationDiagnosisItem_snapshotId_idx" ON "OperationDiagnosisItem"("snapshotId");

-- CreateIndex
CREATE INDEX "OperationTask_shop_status_quadrant_idx" ON "OperationTask"("shop", "status", "quadrant");

-- CreateIndex
CREATE INDEX "OperationTask_shop_dedupeKey_status_idx" ON "OperationTask"("shop", "dedupeKey", "status");

-- CreateIndex
CREATE INDEX "OperationTask_shop_createdAt_idx" ON "OperationTask"("shop", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ShopCostConfig_shop_key" ON "ShopCostConfig"("shop");

-- CreateIndex
CREATE INDEX "ShopSkuCost_shop_sku_idx" ON "ShopSkuCost"("shop", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "ShopSkuCost_shop_inventoryItemId_key" ON "ShopSkuCost"("shop", "inventoryItemId");

-- CreateIndex
CREATE INDEX "SupportConversation_status_lastMessageAt_idx" ON "SupportConversation"("status", "lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "SupportConversation_shop_source_key" ON "SupportConversation"("shop", "source");

-- CreateIndex
CREATE INDEX "SupportMessage_conversationId_createdAt_idx" ON "SupportMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "ShopCustomerValue_shop_segment_idx" ON "ShopCustomerValue"("shop", "segment");

-- CreateIndex
CREATE INDEX "ShopCustomerValue_shop_customerValueScore_idx" ON "ShopCustomerValue"("shop", "customerValueScore");

-- CreateIndex
CREATE UNIQUE INDEX "ShopCustomerValue_shop_shopifyCustomerId_key" ON "ShopCustomerValue"("shop", "shopifyCustomerId");

-- CreateIndex
CREATE INDEX "ImageMapping_shop_targetCode_idx" ON "ImageMapping"("shop", "targetCode");

-- CreateIndex
CREATE UNIQUE INDEX "ImageMapping_shop_sourceUrl_targetCode_key" ON "ImageMapping"("shop", "sourceUrl", "targetCode");
