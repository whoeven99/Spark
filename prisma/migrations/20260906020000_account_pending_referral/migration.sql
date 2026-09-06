-- Account.pendingReferralCode: hold referral code until subscription confirms.
ALTER TABLE "Account" ADD COLUMN "pendingReferralCode" TEXT;
