-- PlanCatalog.appName 已写入 Prisma schema 与 billing-plan-catalog-seed.sql，
-- 但 init 建表时没有该列。设置页 loadBillingContext → listEnabledPlans
-- 的 findMany 会 SELECT appName，缺列即 SQL_INPUT_ERROR / 500。
ALTER TABLE "PlanCatalog" ADD COLUMN "appName" TEXT NOT NULL DEFAULT 'spark';
