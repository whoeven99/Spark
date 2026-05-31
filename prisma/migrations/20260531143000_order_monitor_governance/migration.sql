-- Order Monitor governance data foundation.

ALTER TABLE "ShopOrderLineItem" ADD COLUMN "inventoryItemId" TEXT;

ALTER TABLE "ShopInventoryLevel" ADD COLUMN "variantId" TEXT;
ALTER TABLE "ShopInventoryLevel" ADD COLUMN "productId" TEXT;
ALTER TABLE "ShopInventoryLevel" ADD COLUMN "sku" TEXT;
ALTER TABLE "ShopInventoryLevel" ADD COLUMN "productTitle" TEXT;
ALTER TABLE "ShopInventoryLevel" ADD COLUMN "variantTitle" TEXT;

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

CREATE UNIQUE INDEX "ShopRefundLineItem_shop_refundLineItemId_key" ON "ShopRefundLineItem"("shop", "refundLineItemId");
CREATE INDEX "ShopOrderLineItem_shop_inventoryItemId_idx" ON "ShopOrderLineItem"("shop", "inventoryItemId");
CREATE INDEX "ShopInventoryLevel_shop_sku_idx" ON "ShopInventoryLevel"("shop", "sku");
CREATE INDEX "ShopInventoryLevel_shop_variantId_idx" ON "ShopInventoryLevel"("shop", "variantId");
CREATE INDEX "ShopRefundLineItem_shop_shopifyRefundId_idx" ON "ShopRefundLineItem"("shop", "shopifyRefundId");
CREATE INDEX "ShopRefundLineItem_shop_shopifyOrderId_idx" ON "ShopRefundLineItem"("shop", "shopifyOrderId");
CREATE INDEX "ShopRefundLineItem_shop_lineItemId_idx" ON "ShopRefundLineItem"("shop", "lineItemId");
CREATE INDEX "ShopRefundLineItem_shop_sku_idx" ON "ShopRefundLineItem"("shop", "sku");
CREATE INDEX "ShopRefundLineItem_shop_reason_idx" ON "ShopRefundLineItem"("shop", "reason");
