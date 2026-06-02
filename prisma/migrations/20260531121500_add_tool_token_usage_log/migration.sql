-- CreateTable
CREATE TABLE "ToolTokenUsageLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "appName" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "modelKey" TEXT NOT NULL,
    "rawTokens" INTEGER NOT NULL,
    "billedTokens" INTEGER NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ToolTokenUsageLog_shop_appName_fkey" FOREIGN KEY ("shop", "appName") REFERENCES "Account" ("shop", "appName") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ToolTokenUsageLog_shop_appName_createdAt_idx" ON "ToolTokenUsageLog"("shop", "appName", "createdAt");

-- CreateIndex
CREATE INDEX "ToolTokenUsageLog_shop_appName_feature_createdAt_idx" ON "ToolTokenUsageLog"("shop", "appName", "feature", "createdAt");

-- CreateIndex
CREATE INDEX "ToolTokenUsageLog_feature_createdAt_idx" ON "ToolTokenUsageLog"("feature", "createdAt");

-- Backfill existing tool usage records from BillingLog metadata, then remove them.
INSERT INTO "ToolTokenUsageLog" (
    "id", "shop", "appName", "feature", "modelKey", "rawTokens", "billedTokens", "inputTokens", "outputTokens", "createdAt"
)
SELECT
    'ttul_' || "id",
    "shop",
    "appName",
    COALESCE(CAST(json_extract("metadata", '$.feature') AS TEXT), '_unknown'),
    COALESCE(CAST(json_extract("metadata", '$.modelKey') AS TEXT), '_default'),
    CAST(COALESCE(json_extract("metadata", '$.rawTokens'), ABS(COALESCE("tokensDelta", 0)), COALESCE("usedTokens", 0), 0) AS INTEGER),
    CAST(COALESCE(json_extract("metadata", '$.billedTokens'), ABS(COALESCE("tokensDelta", 0)), COALESCE("usedTokens", 0), 0) AS INTEGER),
    CAST(COALESCE(json_extract("metadata", '$.inputTokens'), 0) AS INTEGER),
    CAST(COALESCE(json_extract("metadata", '$.outputTokens'), 0) AS INTEGER),
    "createdAt"
FROM "BillingLog"
WHERE "eventType" = 'TOOL_TOKEN_USED';

DELETE FROM "BillingLog"
WHERE "eventType" = 'TOOL_TOKEN_USED';
