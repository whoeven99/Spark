/**
 * 广告洞察落库与读库。
 *
 * 页面默认读库，不再每次打开都打三个平台的 API：回源时固定拉 30 天的广告级
 * 日指标，7 / 14 天视图直接在库里切窗口；更高层级（广告组、系列）用 SUM 上卷，
 * CTR / CPC / ROAS 这类派生指标查询时算，不落库。
 *
 * reach / frequency 是去重指标，跨天无法还原，因此不入库，上卷后返回 null。
 */

import prisma from "../../db.server";
import type { Prisma } from "../../generated/prisma";
import { resolveDateWindow } from "./dateRange.server";
import { mergeMetrics, nestEntityHierarchy, type EntityAd } from "./nest.server";
import {
  emptyMetrics,
  finalizeMetrics,
  type AdsInsightsCampaign,
  type AdsInsightsMetrics,
  type AdsInsightsPlatform,
  type AdsInsightsRangeDays,
  type AdsInsightsResult,
} from "./types.server";

const LOG_PREFIX = "[AdsInsights][Store]";

/** 广告数据当日会持续变动，超过这个时长就回源重拉。 */
export const SNAPSHOT_TTL_MS = 30 * 60 * 1000;

/** 回源固定拉满 30 天，这样 7 / 14 天视图都能直接从库里切。 */
export const FETCH_RANGE_DAYS: AdsInsightsRangeDays = 30;

/** campaign | adSet | ad */
type EntityLevel = "campaign" | "adSet" | "ad";

export function isSnapshotFresh(fetchedAt: Date, now: number = Date.now()): boolean {
  return now - fetchedAt.getTime() < SNAPSHOT_TTL_MS;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function collectEntityRows(params: {
  shop: string;
  platform: AdsInsightsPlatform;
  accountId: string;
  campaigns: AdsInsightsCampaign[];
  syncedAt: Date;
}): Prisma.AdEntityCreateManyInput[] {
  const { shop, platform, accountId, syncedAt } = params;
  // 唯一键是 shop+platform+level+externalId，先去重再写，避免 createMany 整笔失败。
  const byKey = new Map<string, Prisma.AdEntityCreateManyInput>();
  const put = (
    level: EntityLevel,
    externalId: string,
    name: string,
    status: string,
    parentId: string | null,
  ) => {
    if (!externalId) return;
    byKey.set(`${level}|${externalId}`, {
      shop,
      platform,
      accountId,
      level,
      externalId,
      name,
      status,
      parentId,
      syncedAt,
    });
  };

  for (const campaign of params.campaigns) {
    put("campaign", campaign.id, campaign.name, campaign.status, null);
    for (const adSet of campaign.adSets) {
      put("adSet", adSet.id, adSet.name, adSet.status, campaign.id);
      for (const ad of adSet.ads) {
        put("ad", ad.id, ad.name, ad.status, adSet.id);
      }
    }
  }

  return [...byKey.values()];
}

/**
 * 落库一次回源结果。
 *
 * 实体整批替换（账户结构以最新一次拉取为准），日指标只覆盖本次窗口，
 * 窗口之外的历史保留。
 */
export async function saveInsightsSnapshot(params: {
  shop: string;
  result: AdsInsightsResult;
}): Promise<void> {
  const { shop, result } = params;
  if (!result.daily) return;

  const platform = result.platform;
  const accountId = result.accountId;
  const fetchedAt = new Date();

  const entityRows = collectEntityRows({
    shop,
    platform,
    accountId,
    campaigns: result.campaigns,
    syncedAt: fetchedAt,
  });

  const byAdDate = new Map<string, Prisma.AdMetricDailyCreateManyInput>();
  for (const row of result.daily) {
    if (!row.adId || !row.date) continue;
    const m = row.metrics;
    byAdDate.set(`${row.adId}|${row.date}`, {
      shop,
      platform,
      accountId,
      adId: row.adId,
      date: row.date,
      impressions: Math.round(m.impressions),
      clicks: Math.round(m.clicks),
      spend: m.spend,
      conversions: m.conversions,
      conversionsValue: m.conversionsValue,
      purchases: m.purchases,
      purchaseValue: m.purchaseValue,
      addToCart: m.addToCart,
      landingPageViews: m.landingPageViews,
      outboundClicks: m.outboundClicks,
      videoViews: m.videoViews,
      thruplay: m.thruplay,
      leads: m.leads,
      viewContent: m.viewContent,
      initiateCheckout: m.initiateCheckout,
      allConversions: m.allConversions,
      fetchedAt,
    });
  }
  const metricRows = [...byAdDate.values()];

  const syncPayload = {
    accountId,
    accountName: result.accountName ?? null,
    currencyCode: result.currencyCode ?? null,
    dateStart: result.dateStart,
    dateEnd: result.dateEnd,
    fetchedAt,
  };

  await prisma.$transaction([
    prisma.adEntity.deleteMany({ where: { shop, platform } }),
    ...chunk(entityRows, 200).map((batch) => prisma.adEntity.createMany({ data: batch })),
    prisma.adMetricDaily.deleteMany({
      where: { shop, platform, date: { gte: result.dateStart, lte: result.dateEnd } },
    }),
    ...chunk(metricRows, 200).map((batch) =>
      prisma.adMetricDaily.createMany({ data: batch }),
    ),
    prisma.adInsightsSync.upsert({
      where: { shop_platform: { shop, platform } },
      update: syncPayload,
      create: { shop, platform, ...syncPayload },
    }),
  ]);

  console.info(
    `${LOG_PREFIX} saved shop=${shop} platform=${platform} entities=${entityRows.length} metricRows=${metricRows.length} window=${result.dateStart}~${result.dateEnd}`,
  );
}

function metricsFromRows(
  rows: Array<{
    impressions: number;
    clicks: number;
    spend: number;
    conversions: number;
    conversionsValue: number;
    purchases: number | null;
    purchaseValue: number | null;
    addToCart: number | null;
    landingPageViews: number | null;
    outboundClicks: number | null;
    videoViews: number | null;
    thruplay: number | null;
    leads: number | null;
    viewContent: number | null;
    initiateCheckout: number | null;
    allConversions: number | null;
  }>,
): AdsInsightsMetrics {
  let merged = emptyMetrics();
  for (const row of rows) {
    merged = mergeMetrics(
      merged,
      finalizeMetrics({
        impressions: row.impressions,
        clicks: row.clicks,
        spend: row.spend,
        conversions: row.conversions,
        conversionsValue: row.conversionsValue,
        purchases: row.purchases,
        purchaseValue: row.purchaseValue,
        addToCart: row.addToCart,
        landingPageViews: row.landingPageViews,
        outboundClicks: row.outboundClicks,
        videoViews: row.videoViews,
        thruplay: row.thruplay,
        leads: row.leads,
        viewContent: row.viewContent,
        initiateCheckout: row.initiateCheckout,
        allConversions: row.allConversions,
      }),
    );
  }
  return merged;
}

function sortBySpendDesc(campaigns: AdsInsightsCampaign[]): AdsInsightsCampaign[] {
  for (const campaign of campaigns) {
    campaign.adSets.sort((a, b) => b.metrics.spend - a.metrics.spend);
  }
  campaigns.sort((a, b) => b.metrics.spend - a.metrics.spend);
  return campaigns;
}

/**
 * 读取快照。
 *
 * 返回 null 表示需要回源：从未拉过，或库里覆盖的窗口比请求的区间短。
 * 新鲜度由调用方用 `isSnapshotFresh` 判断，这样过期也能先拿旧数据兜底。
 */
export async function loadInsightsSnapshot(params: {
  shop: string;
  platform: AdsInsightsPlatform;
  rangeDays: AdsInsightsRangeDays;
  now?: Date;
}): Promise<{ result: AdsInsightsResult; fetchedAt: Date } | null> {
  const { shop, platform, rangeDays } = params;
  const sync = await prisma.adInsightsSync.findUnique({
    where: { shop_platform: { shop, platform } },
  });
  if (!sync) return null;

  const { dateStart, dateEnd } = resolveDateWindow(rangeDays, params.now);
  // 库里起点晚于请求起点时数据不完整，交给调用方回源。
  if (sync.dateStart > dateStart) return null;

  const [entities, metrics] = await Promise.all([
    prisma.adEntity.findMany({ where: { shop, platform } }),
    prisma.adMetricDaily.findMany({
      where: { shop, platform, date: { gte: dateStart, lte: dateEnd } },
    }),
  ]);

  const metricsByAdId = new Map<string, typeof metrics>();
  for (const row of metrics) {
    const bucket = metricsByAdId.get(row.adId);
    if (bucket) bucket.push(row);
    else metricsByAdId.set(row.adId, [row]);
  }

  const ads: EntityAd[] = [];
  const adSets: Array<{ id: string; name: string; status: string; campaignId: string }> = [];
  const campaignEntities: Array<{ id: string; name: string; status: string }> = [];
  const adSetParent = new Map<string, string>();

  for (const entity of entities) {
    if (entity.level === "campaign") {
      campaignEntities.push({ id: entity.externalId, name: entity.name, status: entity.status });
    } else if (entity.level === "adSet") {
      adSetParent.set(entity.externalId, entity.parentId ?? "");
      adSets.push({
        id: entity.externalId,
        name: entity.name,
        status: entity.status,
        campaignId: entity.parentId ?? "",
      });
    }
  }

  for (const entity of entities) {
    if (entity.level !== "ad") continue;
    const adSetId = entity.parentId ?? "";
    ads.push({
      id: entity.externalId,
      name: entity.name,
      status: entity.status,
      campaignId: adSetParent.get(adSetId) ?? "",
      adSetId,
      metrics: metricsFromRows(metricsByAdId.get(entity.externalId) ?? []),
    });
  }

  const campaigns = sortBySpendDesc(
    nestEntityHierarchy({ campaigns: campaignEntities, adSets, ads }),
  );

  return {
    result: {
      platform,
      accountId: sync.accountId,
      accountName: sync.accountName,
      currencyCode: sync.currencyCode,
      rangeDays,
      dateStart,
      dateEnd,
      campaigns,
      keywords: [],
      searchTerms: [],
      creatives: [],
    },
    fetchedAt: sync.fetchedAt,
  };
}
