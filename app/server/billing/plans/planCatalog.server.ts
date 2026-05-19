import prisma from "../../../db.server";
import { BillingError, BILLING_ERROR_CODE } from "../errors.server";
import { PLAN_CATALOG_KIND, type PlanCatalogKind } from "../types.server";

export type PlanRecord = {
  planKey: string;
  appName: string;
  kind: PlanCatalogKind;
  billingInterval: string | null;
  displayName: string;
  tokens: number;
  priceAmount: string;
  currencyCode: string;
  trialDays: number | null;
  shopifyPlanName: string | null;
};

export async function listEnabledPlansForApp(
  appName: string,
): Promise<PlanRecord[]> {
  const rows = await prisma.planCatalog.findMany({
    where: { appName, enabled: true },
    orderBy: [{ sortOrder: "asc" }, { planKey: "asc" }],
  });
  return rows.map((row) => ({
    planKey: row.planKey,
    appName: row.appName,
    kind: row.kind as PlanCatalogKind,
    billingInterval: row.billingInterval,
    displayName: row.displayName,
    tokens: row.tokens,
    priceAmount: row.priceAmount,
    currencyCode: row.currencyCode,
    trialDays: row.trialDays,
    shopifyPlanName: row.shopifyPlanName,
  }));
}

export async function getPlanByKey(planKey: string): Promise<PlanRecord> {
  const row = await prisma.planCatalog.findUnique({ where: { planKey } });
  if (!row || !row.enabled) {
    throw new BillingError(
      `未找到套餐：${planKey}`,
      BILLING_ERROR_CODE.PLAN_NOT_FOUND,
      404,
    );
  }
  return {
    planKey: row.planKey,
    appName: row.appName,
    kind: row.kind as PlanCatalogKind,
    billingInterval: row.billingInterval,
    displayName: row.displayName,
    tokens: row.tokens,
    priceAmount: row.priceAmount,
    currencyCode: row.currencyCode,
    trialDays: row.trialDays,
    shopifyPlanName: row.shopifyPlanName,
  };
}

export async function getInternalTrialPlan(
  appName: string,
): Promise<PlanRecord | null> {
  const row = await prisma.planCatalog.findFirst({
    where: {
      appName,
      kind: PLAN_CATALOG_KIND.INTERNAL_TRIAL,
      enabled: true,
    },
    orderBy: { sortOrder: "asc" },
  });
  if (!row) return null;
  return getPlanByKey(row.planKey);
}
