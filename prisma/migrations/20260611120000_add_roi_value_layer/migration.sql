-- ROI 归一统计体系 · A 步：成本口径配置 + SKU 单位成本 + 客户价值快照。

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

-- CreateIndex
CREATE UNIQUE INDEX "ShopCostConfig_shop_key" ON "ShopCostConfig"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "ShopSkuCost_shop_inventoryItemId_key" ON "ShopSkuCost"("shop", "inventoryItemId");

-- CreateIndex
CREATE INDEX "ShopSkuCost_shop_sku_idx" ON "ShopSkuCost"("shop", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "ShopCustomerValue_shop_shopifyCustomerId_key" ON "ShopCustomerValue"("shop", "shopifyCustomerId");

-- CreateIndex
CREATE INDEX "ShopCustomerValue_shop_segment_idx" ON "ShopCustomerValue"("shop", "segment");

-- CreateIndex
CREATE INDEX "ShopCustomerValue_shop_customerValueScore_idx" ON "ShopCustomerValue"("shop", "customerValueScore");
