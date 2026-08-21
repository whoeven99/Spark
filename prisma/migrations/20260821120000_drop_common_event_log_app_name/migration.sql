-- 生产库遗留列：Prisma schema 已移除 appName，但早期部署的 CommonEventLog 仍含 NOT NULL appName。
-- 本地由 init 迁移创建的库无此列；若 migrate 报错可对该环境 mark applied 或跳过本文件。
DROP INDEX IF EXISTS "CommonEventLog_shop_appName_createdAt_idx";

ALTER TABLE "CommonEventLog" DROP COLUMN "appName";

CREATE UNIQUE INDEX "CommonEventLog_shop_eventType_referenceId_key"
  ON "CommonEventLog"("shop", "eventType", "referenceId");
