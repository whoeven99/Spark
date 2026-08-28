-- AlterTable PlanCatalog: overage pricing defaults
ALTER TABLE "PlanCatalog" ADD COLUMN "overagePricePerThousand" TEXT;
ALTER TABLE "PlanCatalog" ADD COLUMN "defaultOverageCapAmount" TEXT;
ALTER TABLE "PlanCatalog" ADD COLUMN "overageTerms" TEXT;

-- AlterTable AppSubscription: usage line + cap state
ALTER TABLE "AppSubscription" ADD COLUMN "usageLineItemId" TEXT;
ALTER TABLE "AppSubscription" ADD COLUMN "overagePricePerThousand" TEXT;
ALTER TABLE "AppSubscription" ADD COLUMN "cappedAmount" TEXT;
ALTER TABLE "AppSubscription" ADD COLUMN "cappedCurrency" TEXT;
ALTER TABLE "AppSubscription" ADD COLUMN "usageBalanceUsed" TEXT;
ALTER TABLE "AppSubscription" ADD COLUMN "overagePendingTokens" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AppSubscription" ADD COLUMN "overageEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable OverageUsageCharge
CREATE TABLE "OverageUsageCharge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "appSubscriptionId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "tokens" INTEGER NOT NULL,
    "amount" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL,
    "shopifyUsageRecordId" TEXT,
    "periodStart" DATETIME,
    "periodEnd" DATETIME,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OverageUsageCharge_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Account" ("shop") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OverageUsageCharge_appSubscriptionId_fkey" FOREIGN KEY ("appSubscriptionId") REFERENCES "AppSubscription" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "OverageUsageCharge_idempotencyKey_key" ON "OverageUsageCharge"("idempotencyKey");
CREATE INDEX "OverageUsageCharge_shop_createdAt_idx" ON "OverageUsageCharge"("shop", "createdAt");
CREATE INDEX "OverageUsageCharge_appSubscriptionId_status_idx" ON "OverageUsageCharge"("appSubscriptionId", "status");
