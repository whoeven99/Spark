import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";
import { fetchShopBasicInfo } from "../shopify/fetchShopBasicInfo.server";
import type {
  RangeKey,
  ReportQueryResult,
  ReportTab,
  ShopifyReportsAccess,
  ShopifyReportsPageData,
} from "../../lib/shopifyReports";
import { buildPresetQuery, listReportPresets, type ReportPreset } from "./reportPresets.server";
import { executeShopifyqlQuery } from "./shopifyqlQuery.server";

type PresetRun = ReportQueryResult & { accessDenied: boolean };

function emptyPageData(
  tab: ReportTab,
  range: RangeKey,
  access: ShopifyReportsAccess,
): ShopifyReportsPageData {
  return {
    tab,
    range,
    access,
    currencyCode: null,
    ianaTimezone: null,
    queries: [],
  };
}

async function runPreset(
  admin: ShopifyAdminGraphqlClient,
  preset: ReportPreset,
  range: RangeKey,
): Promise<PresetRun> {
  const query = buildPresetQuery(preset, range);
  const result = await executeShopifyqlQuery(admin, query);
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

function toQueryResult(run: PresetRun): ReportQueryResult {
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

export async function loadShopifyReports(options: {
  admin: ShopifyAdminGraphqlClient;
  tab: ReportTab;
  range: RangeKey;
  hasReadReports: boolean;
}): Promise<ShopifyReportsPageData> {
  const { admin, tab, range, hasReadReports } = options;
  if (!hasReadReports) {
    return emptyPageData(tab, range, "missing_scope");
  }

  const [shopInfo, runs] = await Promise.all([
    fetchShopBasicInfo(admin).catch(() => null),
    Promise.all(listReportPresets(tab).map((preset) => runPreset(admin, preset, range))),
  ]);

  if (runs.some((run) => run.accessDenied)) {
    return {
      ...emptyPageData(tab, range, "access_denied"),
      currencyCode: shopInfo?.currencyCode ?? null,
      ianaTimezone: shopInfo?.ianaTimezone ?? null,
    };
  }

  return {
    tab,
    range,
    access: "ok",
    currencyCode: shopInfo?.currencyCode ?? null,
    ianaTimezone: shopInfo?.ianaTimezone ?? null,
    queries: runs.map(toQueryResult),
  };
}
