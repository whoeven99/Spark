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

/** 套餐目录变更频率低，进程内缓存减轻 Turso 往返。 */
const PLAN_CATALOG_CACHE_TTL_MS = 5 * 60 * 1000;

type CacheEntry<T> = { value: T; expiresAt: number };

const listByAppCache = new Map<string, CacheEntry<PlanRecord[]>>();
const planByKeyCache = new Map<string, CacheEntry<PlanRecord>>();

function readCache<T>(map: Map<string, CacheEntry<T>>, key: string): T | undefined {
  const entry = map.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    map.delete(key);
    return undefined;
  }
  return entry.value;
}

function writeCache<T>(map: Map<string, CacheEntry<T>>, key: string, value: T): void {
  map.set(key, {
    value,
    expiresAt: Date.now() + PLAN_CATALOG_CACHE_TTL_MS,
  });
}

function rowToPlanRecord(row: {
  planKey: string;
  appName: string;
  kind: string;
  billingInterval: string | null;
  displayName: string;
  tokens: number;
  priceAmount: string;
  currencyCode: string;
  trialDays: number | null;
  shopifyPlanName: string | null;
}): PlanRecord {
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

/** 测试或种子脚本写入后可使缓存失效。 */
export function invalidatePlanCatalogCache(): void {
  listByAppCache.clear();
  planByKeyCache.clear();
}

export async function listEnabledPlansForApp(
  appName: string,
): Promise<PlanRecord[]> {
  const cached = readCache(listByAppCache, appName);
  if (cached) return cached;

  const rows = await prisma.planCatalog.findMany({
    where: { appName, enabled: true },
    orderBy: [{ sortOrder: "asc" }, { planKey: "asc" }],
  });
  const plans = rows.map(rowToPlanRecord);
  writeCache(listByAppCache, appName, plans);
  for (const plan of plans) {
    writeCache(planByKeyCache, plan.planKey, plan);
  }
  return plans;
}

export async function getPlanByKey(planKey: string): Promise<PlanRecord> {
  const cached = readCache(planByKeyCache, planKey);
  if (cached) return cached;

  const row = await prisma.planCatalog.findUnique({ where: { planKey } });
  if (!row || !row.enabled) {
    throw new BillingError(
      `未找到套餐：${planKey}`,
      BILLING_ERROR_CODE.PLAN_NOT_FOUND,
      404,
    );
  }
  const plan = rowToPlanRecord(row);
  writeCache(planByKeyCache, planKey, plan);
  return plan;
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
