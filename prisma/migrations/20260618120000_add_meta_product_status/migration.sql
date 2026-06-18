-- Meta（Facebook）Catalog 商品审核状态缓存（同步后即时查 / 30 分钟延迟查 / 每日 cron）。

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

-- CreateIndex
CREATE UNIQUE INDEX "MetaProductStatus_shop_retailerId_key" ON "MetaProductStatus"("shop", "retailerId");

-- CreateIndex
CREATE INDEX "MetaProductStatus_shop_status_idx" ON "MetaProductStatus"("shop", "status");

-- CreateIndex
CREATE INDEX "MetaProductStatus_shop_catalogId_idx" ON "MetaProductStatus"("shop", "catalogId");
