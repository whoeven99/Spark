ALTER TABLE "ShopOrder" ADD COLUMN "presentmentCurrencyCode" TEXT;
ALTER TABLE "ShopOrder" ADD COLUMN "customerLocale" TEXT;
ALTER TABLE "ShopOrder" ADD COLUMN "shippingCountryCode" TEXT;
ALTER TABLE "ShopOrder" ADD COLUMN "shippingProvinceCode" TEXT;
ALTER TABLE "ShopOrder" ADD COLUMN "billingCountryCode" TEXT;
ALTER TABLE "ShopOrder" ADD COLUMN "billingProvinceCode" TEXT;

CREATE INDEX "ShopOrder_shop_shippingCountryCode_idx" ON "ShopOrder"("shop", "shippingCountryCode");
CREATE INDEX "ShopOrder_shop_billingCountryCode_idx" ON "ShopOrder"("shop", "billingCountryCode");
