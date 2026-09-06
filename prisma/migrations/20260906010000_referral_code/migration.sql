-- ReferralCode: Admin-managed ad promo codes with usage caps.
CREATE TABLE "ReferralCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "note" TEXT,
    "tokenAmount" INTEGER NOT NULL,
    "maxUses" INTEGER NOT NULL,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT 1,
    "startsAt" DATETIME,
    "endsAt" DATETIME,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "ReferralCode_code_key" ON "ReferralCode"("code");
CREATE INDEX "ReferralCode_enabled_createdAt_idx" ON "ReferralCode"("enabled", "createdAt");

-- ReferralClaim: antifraud ledger keyed by shop domain hash (survives uninstall).
CREATE TABLE "ReferralClaim" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "codeId" TEXT NOT NULL,
    "shopHash" TEXT NOT NULL,
    "tokensDelta" INTEGER NOT NULL,
    "claimedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReferralClaim_codeId_fkey" FOREIGN KEY ("codeId") REFERENCES "ReferralCode" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ReferralClaim_shopHash_key" ON "ReferralClaim"("shopHash");
CREATE INDEX "ReferralClaim_codeId_idx" ON "ReferralClaim"("codeId");
CREATE INDEX "ReferralClaim_claimedAt_idx" ON "ReferralClaim"("claimedAt");
