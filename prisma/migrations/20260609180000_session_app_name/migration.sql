-- Session 表增加 appName，支持多 App 共用 Session 存储（与 Prisma schema 对齐）。
ALTER TABLE "Session" ADD COLUMN "appName" TEXT NOT NULL DEFAULT 'chat';

-- 旧索引仅按 shop；改为 appName + shop 复合索引。
DROP INDEX IF EXISTS "Session_shop_idx";
CREATE INDEX "Session_appName_shop_idx" ON "Session"("appName", "shop");
