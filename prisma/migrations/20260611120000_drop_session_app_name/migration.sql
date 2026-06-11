-- 撤销 20260609180000_session_app_name：Session.appName 从未被业务代码读写，属于未完成功能，清理之。
-- 1. 先删复合索引（索引存在时无法 DROP COLUMN）
DROP INDEX IF EXISTS "Session_appName_shop_idx";

-- 2. 恢复原单列索引
CREATE INDEX IF NOT EXISTS "Session_shop_idx" ON "Session"("shop");

-- 3. 删除 appName 列（需 SQLite 3.35+ / libSQL）
ALTER TABLE "Session" DROP COLUMN "appName";
