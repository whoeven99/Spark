-- CreateTable
CREATE TABLE "WorkspaceFile" (
    "id"               TEXT NOT NULL PRIMARY KEY,
    "shop"             TEXT NOT NULL,
    "name"             TEXT NOT NULL,
    "mimeType"         TEXT NOT NULL DEFAULT '',
    "originalSize"     INTEGER NOT NULL,
    "charCount"        INTEGER NOT NULL,
    "blobPath"         TEXT NOT NULL,
    "originalBlobPath" TEXT NOT NULL DEFAULT '',
    "createdAt"        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "WorkspaceFile_shop_createdAt_idx" ON "WorkspaceFile"("shop", "createdAt");
