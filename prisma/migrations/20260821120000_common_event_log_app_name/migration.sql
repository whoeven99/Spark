-- CommonEventLog.appName 已写入 Prisma schema，但 init 建表时没有该列，也从未补过 ALTER。
-- 卸载 webhook 的 findFirst / create 会 SELECT/INSERT appName，缺列即 SQL_INPUT_ERROR。
ALTER TABLE "CommonEventLog" ADD COLUMN "appName" TEXT NOT NULL DEFAULT 'spark';

CREATE UNIQUE INDEX IF NOT EXISTS "CommonEventLog_shop_eventType_referenceId_key"
  ON "CommonEventLog"("shop", "eventType", "referenceId");
