-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "subscriptionTokens" INTEGER NOT NULL DEFAULT 0,
    "purchasedTokens" INTEGER NOT NULL DEFAULT 0,
    "trialTokens" INTEGER NOT NULL DEFAULT 0,
    "usedTokens" INTEGER NOT NULL DEFAULT 0,
    "trialDailyUsed" INTEGER NOT NULL DEFAULT 0,
    "trialDailyResetAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Account" ("createdAt", "id", "purchasedTokens", "shop", "subscriptionTokens", "trialTokens", "updatedAt", "usedTokens") SELECT "createdAt", "id", "purchasedTokens", "shop", "subscriptionTokens", "trialTokens", "updatedAt", "usedTokens" FROM "Account";
DROP TABLE "Account";
ALTER TABLE "new_Account" RENAME TO "Account";
CREATE UNIQUE INDEX "Account_shop_key" ON "Account"("shop");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
