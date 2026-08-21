import prisma from "../../db.server";
import {
  emptyReportsPage,
  isRangeKey,
  isRecord,
  isReportTab,
  type RangeKey,
  type ReportQueryResult,
  type ShopifyReportsAccess,
  type ShopifyReportsPageData,
  type ReportTab,
} from "../../lib/shopifyReports";
import { sparkKvDel, sparkKvGet, sparkKvKey, sparkKvSet } from "../kv/sparkKv.server";

export const REPORT_SNAPSHOT_FRESH_MS = 30 * 60 * 1000;
export const REPORT_PAGE_CACHE_TTL_SECONDS = 300;
export const REPORT_LOCK_TTL_SECONDS = 180;
export const REPORT_QUEUE_DEDUP_SECONDS = 120;

export function reportPageCacheKey(shop: string, tab: ReportTab, range: RangeKey): string {
  return sparkKvKey("shopify-reports", "page", shop, tab, range);
}

export function reportLockKey(shop: string): string {
  return sparkKvKey("shopify-reports", "lock", shop);
}

export function reportQueuedKey(shop: string, tab: ReportTab, range: RangeKey): string {
  return sparkKvKey("shopify-reports", "queued", shop, tab, range);
}

export function isReportSnapshotFresh(fetchedAt: Date, now: Date = new Date()): boolean {
  return now.getTime() - fetchedAt.getTime() < REPORT_SNAPSHOT_FRESH_MS;
}

function isQueryResult(value: unknown): value is ReportQueryResult {
  if (!isRecord(value)) return false;
  return typeof value.id === "string" && Array.isArray(value.rows) && Array.isArray(value.columns);
}

function parseQueries(payload: unknown): ReportQueryResult[] {
  if (!Array.isArray(payload)) return [];
  return payload.filter(isQueryResult);
}

function parseAccess(value: string): ShopifyReportsAccess {
  return value === "access_denied" ? "access_denied" : "ok";
}

export function pageFromSnapshot(params: {
  tab: ReportTab;
  range: RangeKey;
  access: string;
  currencyCode: string | null;
  ianaTimezone: string | null;
  payload: unknown;
  fetchedAt: Date;
  now?: Date;
  refreshing?: boolean;
}): ShopifyReportsPageData {
  const now = params.now ?? new Date();
  const fresh = isReportSnapshotFresh(params.fetchedAt, now);
  return {
    tab: params.tab,
    range: params.range,
    access: parseAccess(params.access),
    currencyCode: params.currencyCode,
    ianaTimezone: params.ianaTimezone,
    queries: parseQueries(params.payload),
    freshness: fresh ? "fresh" : "stale",
    fetchedAt: params.fetchedAt.toISOString(),
    refreshing: Boolean(params.refreshing) || !fresh,
  };
}

export async function readReportPageCache(
  shop: string,
  tab: ReportTab,
  range: RangeKey,
): Promise<ShopifyReportsPageData | null> {
  const raw = await sparkKvGet(reportPageCacheKey(shop, tab, range));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return null;
    const cachedTab = String(parsed.tab);
    const cachedRange = String(parsed.range);
    if (!isReportTab(cachedTab) || !isRangeKey(cachedRange) || !Array.isArray(parsed.queries)) {
      return null;
    }
    return {
      ...emptyReportsPage(cachedTab, cachedRange, parseAccess(String(parsed.access ?? "ok"))),
      currencyCode: typeof parsed.currencyCode === "string" ? parsed.currencyCode : null,
      ianaTimezone: typeof parsed.ianaTimezone === "string" ? parsed.ianaTimezone : null,
      queries: parseQueries(parsed.queries),
      freshness: parsed.freshness === "stale" || parsed.freshness === "loading" ? parsed.freshness : "fresh",
      fetchedAt: typeof parsed.fetchedAt === "string" ? parsed.fetchedAt : null,
      refreshing: Boolean(parsed.refreshing),
    };
  } catch {
    return null;
  }
}

export async function writeReportPageCache(
  shop: string,
  tab: ReportTab,
  range: RangeKey,
  page: ShopifyReportsPageData,
): Promise<void> {
  await sparkKvSet(
    reportPageCacheKey(shop, tab, range),
    JSON.stringify(page),
    REPORT_PAGE_CACHE_TTL_SECONDS,
  );
}

export async function dropReportPageCache(
  shop: string,
  tab: ReportTab,
  range: RangeKey,
): Promise<void> {
  await sparkKvDel(reportPageCacheKey(shop, tab, range));
}

export async function loadReportSnapshot(params: {
  shop: string;
  tab: ReportTab;
  range: RangeKey;
  now?: Date;
}): Promise<ShopifyReportsPageData | null> {
  const row = await prisma.shopifyReportSnapshot.findUnique({
    where: { shop_tab_range: { shop: params.shop, tab: params.tab, range: params.range } },
  });
  if (!row) return null;
  return pageFromSnapshot({
    tab: params.tab,
    range: params.range,
    access: row.access,
    currencyCode: row.currencyCode,
    ianaTimezone: row.ianaTimezone,
    payload: row.payload,
    fetchedAt: row.fetchedAt,
    now: params.now,
  });
}

export async function saveReportSnapshot(params: {
  shop: string;
  page: ShopifyReportsPageData;
  fetchedAt?: Date;
  lastError?: string | null;
}): Promise<void> {
  const fetchedAt = params.fetchedAt ?? (params.page.fetchedAt ? new Date(params.page.fetchedAt) : new Date());
  const access = params.page.access === "access_denied" ? "access_denied" : "ok";
  await prisma.shopifyReportSnapshot.upsert({
    where: {
      shop_tab_range: {
        shop: params.shop,
        tab: params.page.tab,
        range: params.page.range,
      },
    },
    create: {
      shop: params.shop,
      tab: params.page.tab,
      range: params.page.range,
      access,
      currencyCode: params.page.currencyCode,
      ianaTimezone: params.page.ianaTimezone,
      payload: params.page.queries,
      fetchedAt,
      lastError: params.lastError ?? null,
    },
    update: {
      access,
      currencyCode: params.page.currencyCode,
      ianaTimezone: params.page.ianaTimezone,
      payload: params.page.queries,
      fetchedAt,
      lastError: params.lastError ?? null,
    },
  });
}
