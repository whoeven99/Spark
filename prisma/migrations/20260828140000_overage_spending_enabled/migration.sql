-- AlterTable AppSubscription: on-demand spending toggle + local spend limit
ALTER TABLE "AppSubscription" ADD COLUMN "overageSpendingEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "AppSubscription" ADD COLUMN "overageSpendLimit" TEXT;
