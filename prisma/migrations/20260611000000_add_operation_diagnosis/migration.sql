-- 每日经营诊断快照 + 诊断项 + 四象限待办任务（docs/DAILY_OPERATIONS_WORKFLOWS.md 阶段一）。

-- CreateTable
CREATE TABLE "OperationDiagnosisSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "snapshotDate" TEXT NOT NULL,
    "hasData" BOOLEAN NOT NULL DEFAULT true,
    "metrics" JSONB NOT NULL,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "OperationDiagnosisItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "metrics" JSONB NOT NULL,
    "evidence" JSONB NOT NULL,
    "reasoning" JSONB NOT NULL,
    "formulas" JSONB NOT NULL,
    CONSTRAINT "OperationDiagnosisItem_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "OperationDiagnosisSnapshot" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OperationTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "snapshotId" TEXT,
    "sourceKey" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "quadrant" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "triggerReason" TEXT NOT NULL,
    "relatedObjects" JSONB NOT NULL,
    "suggestedActions" JSONB NOT NULL,
    "ownerRole" TEXT,
    "dueWindow" TEXT NOT NULL,
    "dueAt" DATETIME,
    "resolvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OperationTask_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "OperationDiagnosisSnapshot" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "OperationDiagnosisSnapshot_shop_snapshotDate_key" ON "OperationDiagnosisSnapshot"("shop", "snapshotDate");

-- CreateIndex
CREATE INDEX "OperationDiagnosisSnapshot_shop_generatedAt_idx" ON "OperationDiagnosisSnapshot"("shop", "generatedAt");

-- CreateIndex
CREATE INDEX "OperationDiagnosisItem_shop_key_idx" ON "OperationDiagnosisItem"("shop", "key");

-- CreateIndex
CREATE INDEX "OperationDiagnosisItem_snapshotId_idx" ON "OperationDiagnosisItem"("snapshotId");

-- CreateIndex
CREATE INDEX "OperationTask_shop_status_quadrant_idx" ON "OperationTask"("shop", "status", "quadrant");

-- CreateIndex
CREATE INDEX "OperationTask_shop_dedupeKey_status_idx" ON "OperationTask"("shop", "dedupeKey", "status");

-- CreateIndex
CREATE INDEX "OperationTask_shop_createdAt_idx" ON "OperationTask"("shop", "createdAt");
