-- AlterTable AppSubscription: pending plan-change checkout slot
ALTER TABLE "AppSubscription" ADD COLUMN "pendingShopifySubscriptionId" TEXT;
ALTER TABLE "AppSubscription" ADD COLUMN "pendingPlanKey" TEXT;
ALTER TABLE "AppSubscription" ADD COLUMN "pendingConfirmationUrl" TEXT;
ALTER TABLE "AppSubscription" ADD COLUMN "pendingCreatedAt" DATETIME;

CREATE INDEX "AppSubscription_pendingShopifySubscriptionId_idx" ON "AppSubscription"("pendingShopifySubscriptionId");
