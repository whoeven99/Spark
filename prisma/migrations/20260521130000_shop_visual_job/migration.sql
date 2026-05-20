-- 兼容原 GeneratedImageJob：重命名并扩展为通用视觉任务表
ALTER TABLE "GeneratedImageJob" RENAME TO "ShopVisualJob";
ALTER TABLE "ShopVisualJob" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'image_generation';
ALTER TABLE "ShopVisualJob" RENAME COLUMN "prompt" TO "summary";
ALTER TABLE "ShopVisualJob" ADD COLUMN "metadata" TEXT;

DROP INDEX IF EXISTS "GeneratedImageJob_shop_createdAt_idx";
CREATE INDEX "ShopVisualJob_shop_kind_createdAt_idx" ON "ShopVisualJob"("shop", "kind", "createdAt");
