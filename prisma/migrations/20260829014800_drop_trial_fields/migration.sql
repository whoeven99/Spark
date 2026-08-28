-- Drop Shopify / product trial columns; balances become dual-pool (subscription + purchased).
ALTER TABLE "Account" DROP COLUMN "trialTokens";
ALTER TABLE "Account" DROP COLUMN "trialDailyUsed";
ALTER TABLE "Account" DROP COLUMN "trialDailyResetAt";
ALTER TABLE "PlanCatalog" DROP COLUMN "trialDays";
ALTER TABLE "AppSubscription" DROP COLUMN "trialEndsAt";
ALTER TABLE "AccountPeriodUsage" DROP COLUMN "trialTokensRemaining";
