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
