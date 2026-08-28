-- Fix ShopRefund date columns declared as `numeric` on some Turso DBs.
-- Prisma/libSQL treats NUMERIC affinity as f64 on read, but DateTime writes are ISO text
-- → findMany fails: expected an f64 number in column 'processedAt', found "...+00:00".
-- Rebuild with DATETIME (same as ShopOrder / init migration).

PRAGMA foreign_keys=OFF;

CREATE TABLE "new_ShopRefund" (
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

INSERT INTO "new_ShopRefund" (
    "id",
    "shop",
    "shopifyRefundId",
    "shopifyOrderId",
    "refundAmount",
    "shippingRefundAmount",
    "shippingRefundTax",
    "refundNote",
    "reason",
    "processedAt",
    "createdAt",
    "syncedAt"
)
SELECT
    "id",
    "shop",
    "shopifyRefundId",
    "shopifyOrderId",
    "refundAmount",
    COALESCE("shippingRefundAmount", 0),
    COALESCE("shippingRefundTax", 0),
    "refundNote",
    "reason",
    "processedAt",
    "createdAt",
    "syncedAt"
FROM "ShopRefund";

DROP TABLE "ShopRefund";
ALTER TABLE "new_ShopRefund" RENAME TO "ShopRefund";

CREATE INDEX "ShopRefund_shop_shopifyOrderId_idx" ON "ShopRefund"("shop", "shopifyOrderId");
CREATE INDEX "ShopRefund_shop_processedAt_idx" ON "ShopRefund"("shop", "processedAt");
CREATE UNIQUE INDEX "ShopRefund_shop_shopifyRefundId_key" ON "ShopRefund"("shop", "shopifyRefundId");

PRAGMA foreign_keys=ON;
