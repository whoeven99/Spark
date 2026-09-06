-- ReferralInstall: first-touch install attribution for ad referral links.
CREATE TABLE "ReferralInstall" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "codeId" TEXT NOT NULL,
    "shopHash" TEXT NOT NULL,
    "shop" TEXT,
    "installedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReferralInstall_codeId_fkey" FOREIGN KEY ("codeId") REFERENCES "ReferralCode" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ReferralInstall_shopHash_key" ON "ReferralInstall"("shopHash");
CREATE INDEX "ReferralInstall_codeId_idx" ON "ReferralInstall"("codeId");
CREATE INDEX "ReferralInstall_installedAt_idx" ON "ReferralInstall"("installedAt");
