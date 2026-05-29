-- Token 计费系数表：业务能力 × 模型/提供商 → multiplier（见 prisma/token-billing-rule-seed.sql）
CREATE TABLE "TokenBillingRule" (
    "ruleKey" TEXT NOT NULL PRIMARY KEY,
    "appName" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "modelKey" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "multiplier" REAL NOT NULL,
    "baseTokenCost" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "TokenBillingRule_appName_feature_modelKey_key"
    ON "TokenBillingRule"("appName", "feature", "modelKey");

CREATE INDEX "TokenBillingRule_appName_feature_enabled_idx"
    ON "TokenBillingRule"("appName", "feature", "enabled");
