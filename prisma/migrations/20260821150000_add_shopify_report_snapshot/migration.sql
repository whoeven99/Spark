-- ShopifyQL 官方报表：整页 JSON 快照 + 每店回源锁。

CREATE TABLE "ShopifyReportSnapshot" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "shop" TEXT NOT NULL,
  "tab" TEXT NOT NULL,
  "range" TEXT NOT NULL,
  "access" TEXT NOT NULL DEFAULT 'ok',
  "currencyCode" TEXT,
  "ianaTimezone" TEXT,
  "payload" JSONB NOT NULL,
  "fetchedAt" DATETIME NOT NULL,
  "lastError" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "ShopifyReportSnapshot_shop_tab_range_key"
  ON "ShopifyReportSnapshot"("shop", "tab", "range");

CREATE INDEX "ShopifyReportSnapshot_shop_fetchedAt_idx"
  ON "ShopifyReportSnapshot"("shop", "fetchedAt");

CREATE TABLE "ShopifyReportSync" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "shop" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'idle',
  "refreshingTab" TEXT,
  "refreshingRange" TEXT,
  "lockUntil" DATETIME,
  "lastSuccessAt" DATETIME,
  "lastError" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "ShopifyReportSync_shop_key" ON "ShopifyReportSync"("shop");
