-- 广告数据落库：凭证反查索引列 + 广告实体/每日指标/回源状态。

-- 1. 凭证表加平台侧账户标识索引列（webhook 只带平台 ID，原先靠 json_extract 扫全表）。
ALTER TABLE "AdPlatformCredential" ADD COLUMN "externalAccountId" TEXT;

CREATE INDEX "AdPlatformCredential_platform_externalAccountId_idx"
  ON "AdPlatformCredential"("platform", "externalAccountId");

-- 回填已有凭证，避免等到下一次凭证写入才建立索引。
UPDATE "AdPlatformCredential"
SET "externalAccountId" = json_extract("credentials", '$.catalogId')
WHERE "platform" IN ('meta_catalog', 'tiktok_catalog')
  AND json_extract("credentials", '$.catalogId') IS NOT NULL;

UPDATE "AdPlatformCredential"
SET "externalAccountId" = json_extract("credentials", '$.merchantId')
WHERE "platform" = 'google_merchant'
  AND json_extract("credentials", '$.merchantId') IS NOT NULL;

UPDATE "AdPlatformCredential"
SET "externalAccountId" = json_extract("credentials", '$.adAccountId')
WHERE "platform" = 'meta_ads'
  AND json_extract("credentials", '$.adAccountId') IS NOT NULL;

UPDATE "AdPlatformCredential"
SET "externalAccountId" = json_extract("credentials", '$.customerId')
WHERE "platform" = 'google'
  AND json_extract("credentials", '$.customerId') IS NOT NULL;

-- 2. 广告实体层级。
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

CREATE UNIQUE INDEX "AdEntity_shop_platform_level_externalId_key"
  ON "AdEntity"("shop", "platform", "level", "externalId");

CREATE INDEX "AdEntity_shop_platform_idx" ON "AdEntity"("shop", "platform");

-- 3. 广告级每日指标（只存可加指标）。
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

CREATE UNIQUE INDEX "AdMetricDaily_shop_platform_adId_date_key"
  ON "AdMetricDaily"("shop", "platform", "adId", "date");

CREATE INDEX "AdMetricDaily_shop_platform_date_idx"
  ON "AdMetricDaily"("shop", "platform", "date");

-- 4. 回源状态。
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

CREATE UNIQUE INDEX "AdInsightsSync_shop_platform_key"
  ON "AdInsightsSync"("shop", "platform");
