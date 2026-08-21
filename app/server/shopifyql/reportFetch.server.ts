import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";
import { fetchShopBasicInfo } from "../shopify/fetchShopBasicInfo.server";
import {
  emptyReportsPage,
  type RangeKey,
  type ReportQueryResult,
  type ReportTab,
  type ShopifyReportsPageData,
} from "../../lib/shopifyReports";
import { buildPresetQuery, listReportPresets, type ReportPreset } from "./reportPresets.server";
import { executeShopifyqlQuery } from "./shopifyqlQuery.server";

const THROTTLE_WAIT_CAP_MS = 15_000;

export async function waitForRetry(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function runPreset(
  admin: ShopifyAdminGraphqlClient,
  preset: ReportPreset,
  range: RangeKey,
): Promise<ReportQueryResult & { accessDenied: boolean }> {
  const query = buildPresetQuery(preset, range);
  let result = await executeShopifyqlQuery(admin, query);
  if (result.throttled) {
    await waitForRetry(Math.min(result.retryAfterMs ?? 1_000, THROTTLE_WAIT_CAP_MS));
    result = await executeShopifyqlQuery(admin, query);
  }
  return {
    id: preset.id,
    kind: preset.kind,
    query,
    titleKey: preset.titleKey,
    seriesKeys: preset.seriesKeys,
    xKey: preset.xKey,
    columns: result.columns,
    rows: result.rows,
    parseErrors: result.parseErrors,
    error: result.ok ? null : result.error,
    accessDenied: result.accessDenied,
  };
}

function toQueryResult(run: ReportQueryResult & { accessDenied: boolean }): ReportQueryResult {
  return {
    id: run.id,
    kind: run.kind,
    query: run.query,
    titleKey: run.titleKey,
    seriesKeys: run.seriesKeys,
    xKey: run.xKey,
    columns: run.columns,
    rows: run.rows,
    parseErrors: run.parseErrors,
    error: run.error,
  };
}

/** 串行打当前 Tab 的全部 ShopifyQL preset，禁止 Promise.all。 */
export async function fetchReportPageFromShopify(options: {
  admin: ShopifyAdminGraphqlClient;
  tab: ReportTab;
  range: RangeKey;
  now?: Date;
}): Promise<ShopifyReportsPageData> {
  const { admin, tab, range } = options;
  const shopInfo = await fetchShopBasicInfo(admin).catch(() => null);
  const runs: Array<ReportQueryResult & { accessDenied: boolean }> = [];
  for (const preset of listReportPresets(tab)) {
    runs.push(await runPreset(admin, preset, range));
  }

  const fetchedAt = (options.now ?? new Date()).toISOString();
  if (runs.some((run) => run.accessDenied)) {
    return emptyReportsPage(tab, range, "access_denied", {
      currencyCode: shopInfo?.currencyCode ?? null,
      ianaTimezone: shopInfo?.ianaTimezone ?? null,
      freshness: "fresh",
      fetchedAt,
      refreshing: false,
    });
  }

  return {
    tab,
    range,
    access: "ok",
    currencyCode: shopInfo?.currencyCode ?? null,
    ianaTimezone: shopInfo?.ianaTimezone ?? null,
    queries: runs.map(toQueryResult),
    freshness: "fresh",
    fetchedAt,
    refreshing: false,
  };
}
