-- Drop appName from PlanCatalog and TokenBillingRule.

DELETE FROM "PlanCatalog" WHERE "planKey" LIKE 'gd_%';

DELETE FROM "TokenBillingRule"
WHERE "rowid" NOT IN (
  SELECT t.rowid
  FROM "TokenBillingRule" AS t
  WHERE t.rowid = (
    SELECT t2.rowid
    FROM "TokenBillingRule" AS t2
    WHERE t2.feature = t.feature AND t2.modelKey = t.modelKey
    ORDER BY
      CASE t2.appName
        WHEN 'product-improve' THEN 0
        WHEN 'generate-description' THEN 1
        WHEN 'spark' THEN 2
        ELSE 3
      END,
      datetime(t2.updatedAt) DESC
    LIMIT 1
  )
);

DELETE FROM "TokenBillingRule" WHERE "ruleKey" LIKE 'gd:%';

DROP INDEX "PlanCatalog_appName_enabled_sortOrder_idx";
ALTER TABLE "PlanCatalog" DROP COLUMN "appName";
CREATE INDEX "PlanCatalog_enabled_sortOrder_idx" ON "PlanCatalog"("enabled", "sortOrder");

DROP INDEX "TokenBillingRule_appName_feature_modelKey_key";
DROP INDEX "TokenBillingRule_appName_feature_enabled_idx";
ALTER TABLE "TokenBillingRule" DROP COLUMN "appName";
CREATE UNIQUE INDEX "TokenBillingRule_feature_modelKey_key" ON "TokenBillingRule"("feature", "modelKey");
CREATE INDEX "TokenBillingRule_feature_enabled_idx" ON "TokenBillingRule"("feature", "enabled");
