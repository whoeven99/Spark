-- CreateTable
CREATE TABLE "AITaskEstimation" (
    "id"          TEXT NOT NULL PRIMARY KEY,
    "appName"     TEXT NOT NULL,
    "taskType"    TEXT NOT NULL,
    "ewmaCredits" REAL,
    "ewmaSeconds" REAL,
    "sampleCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt"   DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "AITaskEstimation_appName_taskType_key" ON "AITaskEstimation"("appName", "taskType");
