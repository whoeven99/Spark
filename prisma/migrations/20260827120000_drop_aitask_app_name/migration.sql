-- spark 代码重构后 AITask* 模型已去掉 appName，但部分 prod Turso 仍保留旧列与索引。
-- 缺列时写入会触发 NOT NULL constraint failed: AITaskBatch.appName。
-- 测试库 init 从未建 appName，turso-migrate 对 DROP COLUMN 缺列会跳过。
DROP INDEX IF EXISTS "AITaskBatch_shop_appName_createdAt_idx";
DROP INDEX IF EXISTS "AITask_shop_appName_taskType_createdAt_idx";
DROP INDEX IF EXISTS "AITaskEstimation_appName_taskType_key";

ALTER TABLE "AITaskBatch" DROP COLUMN "appName";
ALTER TABLE "AITask" DROP COLUMN "appName";
ALTER TABLE "AITaskEstimation" DROP COLUMN "appName";
