/**
 * 洞察总览聚合：跨平台只读汇总，不回源平台 API。
 *
 * 数据全部来自库表：AdMetricDaily 日指标上卷、AdEntity 结构规模、AdInsightsSync 快照新鲜度、
 * GmcProductStatus / MetaProductStatus 审核分布、AdPlatformCredential 连接元数据。
 * 派生指标（CTR / CPC / ROAS）在这里算，不落库；reach / frequency 是去重指标，跨天无法
 * 还原，故总览不提供。
 *
 * 安全边界：凭证只读 platform / externalAccountId / updatedAt，credentials JSON 永不出库。
 */

import prisma from "../../db.server";
import { summarizeProductStatusGroups } from "../adsCatalog/productStatusSummary.server";
import { resolveDateWindow } from "./dateRange.server";
import { isSnapshotFresh } from "./store.server";
import type { AdsInsightsPlatform, AdsInsightsRangeDays } from "./types.server";

/** 总览覆盖的广告平台，顺序即 UI 展示顺序。 */
export const OVERVIEW_PLATFORMS: readonly AdsInsightsPlatform[] = ["meta", "google", "tiktok"];

/** 决定平台卡「已连接」的凭证行（与 ads-insights 页判断口径一致）。 */
const PLATFORM_PRIMARY_CREDENTIAL: Record<AdsInsightsPlatform, string> = {
  meta: "meta_ads",
  google: "google",
  tiktok: "tiktok_catalog",
};

/** 连接矩阵展示的生产凭证行，不含 pending 中转与沙盒。 */
const CONNECTION_PLATFORM_KEYS = [
  "meta_catalog",
  "meta_ads",
  "google_merchant",
  "google",
  "tiktok_catalog",
] as const;

export type AdsOverviewTotals = {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionsValue: number;
  /** 点击率（%）；无展示时为 null */
  ctr: number | null;
  /** 单次点击成本；无点击时为 null */
  cpc: number | null;
  /** 转化价值 / 花费；无花费时为 null */
  roas: number | null;
};

export type AdsOverviewSnapshotState = {
  dateStart: string;
  dateEnd: string;
  fetchedAt: string;
  /** 超过 store.server 的 TTL，页面打开投放明细时会自动回源 */
  stale: boolean;
};

export type AdsOverviewPlatform = {
  platform: AdsInsightsPlatform;
  connected: boolean;
  accountId: string | null;
  accountName: string | null;
  currencyCode: string | null;
  /** 区间内有落库指标时才有值 */
  totals: AdsOverviewTotals | null;
  snapshot: AdsOverviewSnapshotState | null;
  entityCounts: { campaign: number; adSet: number; ad: number };
};

export type AdsOverviewReviewChannel = "gmc" | "meta";

export type AdsOverviewReview = {
  channel: AdsOverviewReviewChannel;
  total: number;
  approved: number;
  pending: number;
  disapproved: number;
  other: number;
  lastCheckedAt: string | null;
};

export type AdsOverviewConnection = {
  /** AdPlatformCredential.platform */
  platform: string;
  connected: boolean;
  externalAccountId: string | null;
  updatedAt: string | null;
};

export type AdsOverviewSnapshot = {
  rangeDays: AdsInsightsRangeDays;
  dateStart: string;
  dateEnd: string;
  /** 已连接平台的合并指标；跨币种时仅作规模参考 */
  totals: AdsOverviewTotals;
  /** 已连接平台使用了多于一种币种，合计不做汇率换算 */
  mixedCurrency: boolean;
  /** 全部平台币种一致时的币种 */
  currencyCode: string | null;
  platforms: AdsOverviewPlatform[];
  reviews: AdsOverviewReview[];
  connections: AdsOverviewConnection[];
  generatedAt: string;
};

type MetricSums = {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionsValue: number;
};

function emptySums(): MetricSums {
  return { spend: 0, impressions: 0, clicks: 0, conversions: 0, conversionsValue: 0 };
}

function toTotals(sums: MetricSums): AdsOverviewTotals {
  return {
    ...sums,
    ctr: sums.impressions > 0 ? (sums.clicks / sums.impressions) * 100 : null,
    cpc: sums.clicks > 0 ? sums.spend / sums.clicks : null,
    roas: sums.spend > 0 ? sums.conversionsValue / sums.spend : null,
  };
}

function hasVolume(sums: MetricSums): boolean {
  return (
    sums.spend > 0 ||
    sums.impressions > 0 ||
    sums.clicks > 0 ||
    sums.conversions > 0 ||
    sums.conversionsValue > 0
  );
}

function buildReview(
  channel: AdsOverviewReviewChannel,
  groups: Array<{
    status: string;
    _count: { _all: number };
    _max: { checkedAt: Date | null };
  }>,
): AdsOverviewReview {
  let latest: Date | null = null;
  for (const group of groups) {
    const checkedAt = group._max.checkedAt;
    if (checkedAt && (!latest || checkedAt > latest)) latest = checkedAt;
  }
  return {
    channel,
    ...summarizeProductStatusGroups(groups),
    lastCheckedAt: latest ? latest.toISOString() : null,
  };
}

/**
 * 读取一个店铺的广告总览。
 *
 * 全部为库内聚合查询，不触发任何平台 API；商户点开投放明细时才由
 * `adsInsights/index.server.ts` 判断快照是否过期并回源。
 */
export async function buildAdsOverview(params: {
  shop: string;
  rangeDays: AdsInsightsRangeDays;
  now?: Date;
}): Promise<AdsOverviewSnapshot> {
  const { shop, rangeDays } = params;
  const now = params.now ?? new Date();
  const { dateStart, dateEnd } = resolveDateWindow(rangeDays, now);

  const [metricGroups, entityGroups, syncRows, gmcGroups, metaGroups, credentialRows] =
    await Promise.all([
      prisma.adMetricDaily.groupBy({
        by: ["platform"],
        where: { shop, date: { gte: dateStart, lte: dateEnd } },
        _sum: {
          spend: true,
          impressions: true,
          clicks: true,
          conversions: true,
          conversionsValue: true,
        },
      }),
      prisma.adEntity.groupBy({
        by: ["platform", "level"],
        where: { shop },
        _count: { _all: true },
      }),
      prisma.adInsightsSync.findMany({ where: { shop } }),
      prisma.gmcProductStatus.groupBy({
        by: ["status"],
        where: { shop },
        _count: { _all: true },
        _max: { checkedAt: true },
      }),
      prisma.metaProductStatus.groupBy({
        by: ["status"],
        where: { shop },
        _count: { _all: true },
        _max: { checkedAt: true },
      }),
      // 只取索引列与时间戳：credentials JSON 不允许离开服务端。
      prisma.adPlatformCredential.findMany({
        where: { shop, platform: { in: [...CONNECTION_PLATFORM_KEYS] } },
        select: { platform: true, externalAccountId: true, updatedAt: true },
      }),
    ]);

  const sumsByPlatform = new Map<string, MetricSums>();
  for (const group of metricGroups) {
    sumsByPlatform.set(group.platform, {
      spend: group._sum.spend ?? 0,
      impressions: group._sum.impressions ?? 0,
      clicks: group._sum.clicks ?? 0,
      conversions: group._sum.conversions ?? 0,
      conversionsValue: group._sum.conversionsValue ?? 0,
    });
  }

  const entityCountsByPlatform = new Map<string, { campaign: number; adSet: number; ad: number }>();
  for (const group of entityGroups) {
    const current = entityCountsByPlatform.get(group.platform) ?? {
      campaign: 0,
      adSet: 0,
      ad: 0,
    };
    if (group.level === "campaign") current.campaign = group._count._all;
    else if (group.level === "adSet") current.adSet = group._count._all;
    else if (group.level === "ad") current.ad = group._count._all;
    entityCountsByPlatform.set(group.platform, current);
  }

  const syncByPlatform = new Map(syncRows.map((row) => [row.platform, row]));
  const credentialByPlatform = new Map(credentialRows.map((row) => [row.platform, row]));

  const platforms: AdsOverviewPlatform[] = OVERVIEW_PLATFORMS.map((platform) => {
    const credential = credentialByPlatform.get(PLATFORM_PRIMARY_CREDENTIAL[platform]);
    const sync = syncByPlatform.get(platform);
    const sums = sumsByPlatform.get(platform);
    return {
      platform,
      connected: Boolean(credential),
      accountId: sync?.accountId ?? credential?.externalAccountId ?? null,
      accountName: sync?.accountName ?? null,
      currencyCode: sync?.currencyCode ?? null,
      totals: sums && hasVolume(sums) ? toTotals(sums) : null,
      snapshot: sync
        ? {
            dateStart: sync.dateStart,
            dateEnd: sync.dateEnd,
            fetchedAt: sync.fetchedAt.toISOString(),
            stale: !isSnapshotFresh(sync.fetchedAt, now.getTime()),
          }
        : null,
      entityCounts: entityCountsByPlatform.get(platform) ?? { campaign: 0, adSet: 0, ad: 0 },
    };
  });

  const combined = emptySums();
  const currencies = new Set<string>();
  for (const item of platforms) {
    if (!item.connected || !item.totals) continue;
    combined.spend += item.totals.spend;
    combined.impressions += item.totals.impressions;
    combined.clicks += item.totals.clicks;
    combined.conversions += item.totals.conversions;
    combined.conversionsValue += item.totals.conversionsValue;
    if (item.currencyCode) currencies.add(item.currencyCode);
  }

  const connections: AdsOverviewConnection[] = CONNECTION_PLATFORM_KEYS.map((platform) => {
    const row = credentialByPlatform.get(platform);
    return {
      platform,
      connected: Boolean(row),
      externalAccountId: row?.externalAccountId ?? null,
      updatedAt: row?.updatedAt.toISOString() ?? null,
    };
  });

  return {
    rangeDays,
    dateStart,
    dateEnd,
    totals: toTotals(combined),
    mixedCurrency: currencies.size > 1,
    currencyCode: currencies.size === 1 ? [...currencies][0]! : null,
    platforms,
    reviews: [buildReview("gmc", gmcGroups), buildReview("meta", metaGroups)],
    connections,
    generatedAt: now.toISOString(),
  };
}
