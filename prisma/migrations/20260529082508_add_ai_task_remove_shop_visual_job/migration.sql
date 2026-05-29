/*
  Warnings:

  - You are about to drop the `ShopVisualJob` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "ShopVisualJob";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "AITaskBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "appName" TEXT NOT NULL,
    "taskType" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AITask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "appName" TEXT NOT NULL,
    "taskType" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "result" JSONB,
    "estimatedCredits" INTEGER,
    "actualCredits" INTEGER,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "errorMsg" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AITask_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "AITaskBatch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AITaskLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "elapsedSeconds" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AITaskLog_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "AITask" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AITaskBatch_shop_appName_createdAt_idx" ON "AITaskBatch"("shop", "appName", "createdAt");

-- CreateIndex
CREATE INDEX "AITask_shop_appName_taskType_createdAt_idx" ON "AITask"("shop", "appName", "taskType", "createdAt");

-- CreateIndex
CREATE INDEX "AITask_batchId_idx" ON "AITask"("batchId");

-- CreateIndex
CREATE INDEX "AITaskLog_taskId_createdAt_idx" ON "AITaskLog"("taskId", "createdAt");
