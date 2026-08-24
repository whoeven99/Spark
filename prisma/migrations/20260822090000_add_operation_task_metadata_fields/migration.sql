-- 为经营任务补齐正式建模字段（docs/DAILY_OPERATIONS_WORKFLOWS.md §13）。

ALTER TABLE "OperationTask" ADD COLUMN "sourceType" TEXT NOT NULL DEFAULT 'rule';
ALTER TABLE "OperationTask" ADD COLUMN "objective" TEXT;
ALTER TABLE "OperationTask" ADD COLUMN "impactMetrics" JSONB;
ALTER TABLE "OperationTask" ADD COLUMN "estimatedLift" TEXT;
ALTER TABLE "OperationTask" ADD COLUMN "roiImpactSummary" TEXT;
ALTER TABLE "OperationTask" ADD COLUMN "confidence" TEXT;
ALTER TABLE "OperationTask" ADD COLUMN "riskEnvironment" TEXT;
ALTER TABLE "OperationTask" ADD COLUMN "aiContextPayload" JSONB;
