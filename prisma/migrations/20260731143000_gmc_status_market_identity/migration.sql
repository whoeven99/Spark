ALTER TABLE "GmcProductStatus"
  ADD COLUMN "contentLanguage" TEXT NOT NULL DEFAULT 'und';

ALTER TABLE "GmcProductStatus"
  ADD COLUMN "feedLabel" TEXT NOT NULL DEFAULT 'ZZ';

DROP INDEX IF EXISTS "GmcProductStatus_shop_offerId_key";

CREATE UNIQUE INDEX "GmcProductStatus_shop_offerId_contentLanguage_feedLabel_key"
  ON "GmcProductStatus"("shop", "offerId", "contentLanguage", "feedLabel");
