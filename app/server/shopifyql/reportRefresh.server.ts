import prisma from "../../db.server";
import type { RangeKey, ReportTab, ShopifyReportsPageData } from "../../lib/shopifyReports";
import { sparkKvDel, sparkKvSetNx } from "../kv/sparkKv.server";
import { fetchReportPageFromShopify } from "./reportFetch.server";
import {
  REPORT_LOCK_TTL_SECONDS,
  REPORT_QUEUE_DEDUP_SECONDS,
  reportLockKey,
  reportQueuedKey,
  saveReportSnapshot,
  writeReportPageCache,
} from "./reportSnapshot.server";

const LOG_PREFIX = "[ShopifyReports][Refresh]";

export async function persistReportPage(params: {
  shop: string;
  page: ShopifyReportsPageData;
}): Promise<void> {
  const fetchedAt = params.page.fetchedAt ? new Date(params.page.fetchedAt) : new Date();
  const page: ShopifyReportsPageData = {
    ...params.page,
    freshness: "fresh",
    refreshing: false,
    fetchedAt: fetchedAt.toISOString(),
  };
  await saveReportSnapshot({
    shop: params.shop,
    page,
    fetchedAt,
    lastError: page.access === "access_denied" ? "access_denied" : null,
  });
  await writeReportPageCache(params.shop, page.tab, page.range, page);
  await prisma.shopifyReportSync.updateMany({
    where: { shop: params.shop },
    data: {
      lastSuccessAt: fetchedAt,
      lastError: page.access === "access_denied" ? "access_denied" : null,
    },
  });
}

function isUniqueConflict(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}

async function acquireTursoLock(params: {
  shop: string;
  tab: ReportTab;
  range: RangeKey;
  now: Date;
}): Promise<boolean> {
  const lockUntil = new Date(params.now.getTime() + REPORT_LOCK_TTL_SECONDS * 1000);
  const existing = await prisma.shopifyReportSync.findUnique({ where: { shop: params.shop } });
  if (!existing) {
    try {
      await prisma.shopifyReportSync.create({
        data: {
          shop: params.shop,
          status: "refreshing",
          refreshingTab: params.tab,
          refreshingRange: params.range,
          lockUntil,
        },
      });
      return true;
    } catch (error) {
      if (isUniqueConflict(error)) return false;
      throw error;
    }
  }
  if (existing.status === "refreshing" && existing.lockUntil && existing.lockUntil > params.now) {
    return false;
  }
  await prisma.shopifyReportSync.update({
    where: { shop: params.shop },
    data: {
      status: "refreshing",
      refreshingTab: params.tab,
      refreshingRange: params.range,
      lockUntil,
    },
  });
  return true;
}

export async function acquireReportShopLock(params: {
  shop: string;
  tab: ReportTab;
  range: RangeKey;
  now?: Date;
}): Promise<boolean> {
  const now = params.now ?? new Date();
  const redisLock = await sparkKvSetNx(
    reportLockKey(params.shop),
    `${params.tab}:${params.range}`,
    REPORT_LOCK_TTL_SECONDS,
  );
  if (redisLock === false) return false;
  try {
    const dbLock = await acquireTursoLock({ ...params, now });
    if (!dbLock && redisLock === true) {
      await sparkKvDel(reportLockKey(params.shop));
    }
    return dbLock;
  } catch (error) {
    if (redisLock === true) await sparkKvDel(reportLockKey(params.shop));
    throw error;
  }
}

export async function releaseReportShopLock(shop: string): Promise<void> {
  await sparkKvDel(reportLockKey(shop));
  await prisma.shopifyReportSync.updateMany({
    where: { shop },
    data: {
      status: "idle",
      refreshingTab: null,
      refreshingRange: null,
      lockUntil: null,
    },
  });
}

async function runQueuedRefresh(params: {
  shop: string;
  tab: ReportTab;
  range: RangeKey;
}): Promise<void> {
  const acquired = await acquireReportShopLock(params);
  if (!acquired) return;
  try {
    const { unauthenticated } = await import("../../shopify.server");
    const { admin } = await unauthenticated.admin(params.shop);
    const page = await fetchReportPageFromShopify({
      admin,
      tab: params.tab,
      range: params.range,
    });
    await persistReportPage({ shop: params.shop, page });
  } catch (error) {
    const lastError = error instanceof Error ? error.message : String(error);
    console.warn(`${LOG_PREFIX} failed shop=${params.shop} tab=${params.tab} ${lastError}`);
    await prisma.shopifyReportSync.updateMany({
      where: { shop: params.shop },
      data: { lastError },
    });
  } finally {
    await releaseReportShopLock(params.shop);
  }
}

export function enqueueShopifyReportRefresh(params: {
  shop: string;
  tab: ReportTab;
  range: RangeKey;
}): void {
  const timer = setTimeout(() => {
    void (async () => {
      const queued = await sparkKvSetNx(
        reportQueuedKey(params.shop, params.tab, params.range),
        "1",
        REPORT_QUEUE_DEDUP_SECONDS,
      );
      if (queued === false) return;
      await runQueuedRefresh(params);
    })().catch((error) => {
      console.warn(
        `${LOG_PREFIX} enqueue failed shop=${params.shop} ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }, 0);
  if (typeof timer.unref === "function") timer.unref();
}
