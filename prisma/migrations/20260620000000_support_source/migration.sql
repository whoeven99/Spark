-- AlterTable: 会话来源（spark | translate-v4）
ALTER TABLE "SupportConversation" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'spark';

-- 唯一约束从单列 shop 改为复合 (shop, source)，允许同一店在不同应用各有一条会话
DROP INDEX "SupportConversation_shop_key";
CREATE UNIQUE INDEX "SupportConversation_shop_source_key" ON "SupportConversation"("shop", "source");
