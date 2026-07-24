-- AITaskEstimation：从「按 taskType 一个全局值」升级为「按 (taskType, bucket) 分桶自校准」。
-- 新增 bucket 列（旧数据落 'default'），唯一键由 (taskType) 改为 (taskType, bucket)。
ALTER TABLE "AITaskEstimation" ADD COLUMN "bucket" TEXT NOT NULL DEFAULT 'default';

DROP INDEX "AITaskEstimation_taskType_key";

CREATE UNIQUE INDEX "AITaskEstimation_taskType_bucket_key" ON "AITaskEstimation"("taskType", "bucket");
