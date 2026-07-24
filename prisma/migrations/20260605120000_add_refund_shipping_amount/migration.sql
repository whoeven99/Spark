-- Track shipping refund amount and tax separately on each refund record.
ALTER TABLE "ShopRefund" ADD COLUMN "shippingRefundAmount" REAL NOT NULL DEFAULT 0;
ALTER TABLE "ShopRefund" ADD COLUMN "shippingRefundTax" REAL NOT NULL DEFAULT 0;
