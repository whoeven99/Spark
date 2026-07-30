-- GMC 商品审核状态缓存（feed.md 阶段一：同步后即时查 / 30 分钟延迟查 / 每日 cron）。

-- CreateTable
CREATE TABLE "GmcProductStatus" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "shopifyProductId" TEXT,
    "title" TEXT,
    "status" TEXT NOT NULL,
    "issues" JSONB,
    "checkedAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "GmcProductStatus_shop_offerId_key" ON "GmcProductStatus"("shop", "offerId");

-- CreateIndex
CREATE INDEX "GmcProductStatus_shop_status_idx" ON "GmcProductStatus"("shop", "status");

-- CreateIndex
CREATE INDEX "GmcProductStatus_shop_merchantId_idx" ON "GmcProductStatus"("shop", "merchantId");
