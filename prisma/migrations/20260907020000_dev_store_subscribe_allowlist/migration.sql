-- DevStoreSubscribeAllowlist: production development stores that may subscribe.
CREATE TABLE "DevStoreSubscribeAllowlist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "note" TEXT,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "DevStoreSubscribeAllowlist_shop_key" ON "DevStoreSubscribeAllowlist"("shop");
CREATE INDEX "DevStoreSubscribeAllowlist_createdAt_idx" ON "DevStoreSubscribeAllowlist"("createdAt");
