-- CreateTable
CREATE TABLE "GeneratedImageJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "blobPath" TEXT,
    "errorMsg" TEXT,
    "provider" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "GeneratedImageJob_requestId_key" ON "GeneratedImageJob"("requestId");

-- CreateIndex
CREATE INDEX "GeneratedImageJob_shop_createdAt_idx" ON "GeneratedImageJob"("shop", "createdAt");
