-- PromoClaimLedger: antifraud install-promo claims keyed by shop domain hash.
CREATE TABLE "PromoClaimLedger" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopHash" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "tokensDelta" INTEGER NOT NULL,
    "claimedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "PromoClaimLedger_shopHash_campaignId_key" ON "PromoClaimLedger"("shopHash", "campaignId");
CREATE INDEX "PromoClaimLedger_claimedAt_idx" ON "PromoClaimLedger"("claimedAt");
