-- 店铺账户：按 shop + appName 管理 token 余额（订阅 / 按量 / 试用分池）
CREATE TABLE "Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "appName" TEXT NOT NULL,
    "subscriptionTokens" INTEGER NOT NULL DEFAULT 0,
    "purchasedTokens" INTEGER NOT NULL DEFAULT 0,
    "trialTokens" INTEGER NOT NULL DEFAULT 0,
    "availableTokens" INTEGER GENERATED ALWAYS AS ("subscriptionTokens" + "purchasedTokens" + "trialTokens") STORED,
    "usedTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "Account_shop_appName_key" ON "Account"("shop", "appName");
CREATE INDEX "Account_shop_idx" ON "Account"("shop");
