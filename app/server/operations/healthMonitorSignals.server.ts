import prisma from "../../db.server";
import { buildAdsOverview } from "../adsInsights/overview.server";
import {
  querySummaryAndTimeSeries,
  refreshGscAccessToken,
} from "../googleSearchConsole/gscApi.server";
import {
  getGscCredential,
  setGscCredential,
} from "../googleSearchConsole/gscCredentials.server";
import { getShopCostConfig } from "./roi/costConfig.server";
import { gradeBusinessRoi, ROI_GRADE_RULES, type RoiGrade } from "./roi/roiCore.server";

/**
 * Health Monitor 的外部信号：每日诊断快照覆盖不到、需要另外取数的健康项输入。
 *
 * 约束：
 * - 每个信号独立降级。任一失败只让对应监测项回到「待接入」，不影响整页与其它监测项。
 * - 只做库内聚合，外加一次带超时的 Search Console 调用。
 * - 重计算（SKU 成本回补、渠道 ROI、客户价值重建）不放这里：`loadValueLayer`
 *   已明确标注是数秒级冷路径，不能进页面 loader。因此定价项只输出成本口径配置状态，
 *   真实毛利率仍由经营 → ROI 页的价值层负责。
 */

/** Search Console 观察窗口；GSC 数据本身有 2-3 天延迟，取 28 天更稳。 */
const SEO_WINDOW_DAYS = 28;

/** 单次外部调用超时，超时按「取不到」降级，不阻塞首屏。 */
const GSC_TIMEOUT_MS = 4000;

export type AdsRoasSignal = {
  /** 是否连接了任一广告平台 */
  connected: boolean;
  connectedPlatforms: string[];
  /** 转化价值 / 花费；无花费时为 null */
  roas: number | null;
  spend: number;
  conversionsValue: number;
  currencyCode: string | null;
  /** 跨币种时合计只作规模参考 */
  mixedCurrency: boolean;
  /** 按 ROI 等级规则表判定（roi = roas - 1）；无 ROAS 时为 null */
  grade: RoiGrade | null;
  gradeMeaning: string | null;
  /** 达标线 ROAS，由 ROI 等级规则表的 A 级下限派生 */
  targetRoas: number;
  dateStart: string;
  dateEnd: string;
};

export type SeoCtrSignal = {
  connected: boolean;
  siteUrl: string | null;
  /** 点击 / 曝光，百分比；无曝光时为 null */
  ctrPercent: number | null;
  clicks: number;
  impressions: number;
  avgPosition: number | null;
  startDate: string | null;
  endDate: string | null;
};

export type PricingCostSignal = {
  /** 商家是否显式配置过成本口径（false = 全默认估算） */
  isConfigured: boolean;
  defaultGrossMarginPercent: number;
  /** 已同步的 Shopify SKU 单位成本行数 */
  skuCostCount: number;
};

export type HealthMonitorSignals = {
  ads: AdsRoasSignal | null;
  seo: SeoCtrSignal | null;
  pricing: PricingCostSignal | null;
};

async function withTimeout<T>(task: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      task,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** ROI 等级规则表里「达标」（A 级）的下限，用于派生广告达标线。 */
const ROI_TARGET_MIN = ROI_GRADE_RULES.find((rule) => rule.grade === "A")?.minValue ?? 0.2;

/** 达标线 ROAS：ROAS 1.0 等于打平（roi = 0），A 级下限对应 1 + 0.2。 */
const TARGET_ROAS = 1 + ROI_TARGET_MIN;

/**
 * 广告 ROAS：复用洞察总览的库内上卷口径，不回源平台 API。
 *
 * 等级判定复用 ROI 等级规则表，换算关系是 `roi = roas - 1`（ROAS 1.0 = 打平）。
 * 注意这是广告口径粗算：分子是平台上报的转化价值，没有扣商品成本、折扣与退款，
 * 所以它不等于 `roiCore` 定义的经营 Business ROI，展示时必须标明口径差异。
 */
async function loadAdsRoasSignal(shop: string, now: Date): Promise<AdsRoasSignal> {
  const overview = await buildAdsOverview({ shop, rangeDays: 7, now });
  const connectedPlatforms = overview.platforms
    .filter((platform) => platform.connected)
    .map((platform) => platform.platform);
  const roas = overview.totals.roas;
  const gradeRule = roas === null ? null : gradeBusinessRoi(roas - 1);

  return {
    connected: connectedPlatforms.length > 0,
    connectedPlatforms,
    roas,
    spend: overview.totals.spend,
    conversionsValue: overview.totals.conversionsValue,
    currencyCode: overview.currencyCode,
    mixedCurrency: overview.mixedCurrency,
    grade: gradeRule?.grade ?? null,
    gradeMeaning: gradeRule?.meaning ?? null,
    targetRoas: TARGET_ROAS,
    dateStart: overview.dateStart,
    dateEnd: overview.dateEnd,
  };
}

/**
 * SEO CTR：未连接 Search Console 时直接返回未连接，不发外部请求。
 *
 * CTR 用 总点击 / 总曝光，与页面上「CTR = 点击量 / 曝光量」的口径说明保持一致；
 * 只有拿不到曝光时才退回 GSC 自己的按日 ctr 均值。
 */
async function loadSeoCtrSignal(shop: string): Promise<SeoCtrSignal> {
  const credential = await getGscCredential(shop);
  if (!credential) {
    return {
      connected: false,
      siteUrl: null,
      ctrPercent: null,
      clicks: 0,
      impressions: 0,
      avgPosition: null,
      startDate: null,
      endDate: null,
    };
  }

  let accessToken = credential.accessToken;
  if (credential.refreshToken) {
    try {
      accessToken = await withTimeout(
        refreshGscAccessToken(credential.refreshToken),
        GSC_TIMEOUT_MS,
        "GSC token refresh",
      );
      await setGscCredential(shop, { ...credential, accessToken });
    } catch (error) {
      console.warn(`[healthMonitorSignals] GSC token refresh failed shop=${shop}:`, error);
    }
  }

  const data = await withTimeout(
    querySummaryAndTimeSeries(accessToken, credential.siteUrl, SEO_WINDOW_DAYS),
    GSC_TIMEOUT_MS,
    "GSC search analytics",
  );

  const { totalClicks, totalImpressions, avgCtr, avgPosition } = data.summary;
  const ctrPercent =
    totalImpressions > 0
      ? (totalClicks / totalImpressions) * 100
      : avgCtr > 0
        ? avgCtr * 100
        : null;

  return {
    connected: true,
    siteUrl: credential.siteUrl,
    ctrPercent,
    clicks: totalClicks,
    impressions: totalImpressions,
    avgPosition: avgPosition > 0 ? avgPosition : null,
    startDate: data.startDate,
    endDate: data.endDate,
  };
}

/** 成本口径配置状态：单行配置 + SKU 成本覆盖计数，都是轻量查询。 */
async function loadPricingCostSignal(shop: string): Promise<PricingCostSignal> {
  const [config, skuCostCount] = await Promise.all([
    getShopCostConfig(shop),
    prisma.shopSkuCost.count({ where: { shop } }).catch((error) => {
      console.warn(`[healthMonitorSignals] shopSkuCost count failed shop=${shop}:`, error);
      return 0;
    }),
  ]);

  return {
    isConfigured: config.isConfigured,
    defaultGrossMarginPercent: config.defaultGrossMarginPercent,
    skuCostCount,
  };
}

export async function loadHealthMonitorSignals(params: {
  shop: string;
  now?: Date;
}): Promise<HealthMonitorSignals> {
  const now = params.now ?? new Date();
  const [ads, seo, pricing] = await Promise.all([
    loadAdsRoasSignal(params.shop, now).catch((error) => {
      console.warn(`[healthMonitorSignals] ads signal failed shop=${params.shop}:`, error);
      return null;
    }),
    loadSeoCtrSignal(params.shop).catch((error) => {
      console.warn(`[healthMonitorSignals] seo signal failed shop=${params.shop}:`, error);
      return null;
    }),
    loadPricingCostSignal(params.shop).catch((error) => {
      console.warn(`[healthMonitorSignals] pricing signal failed shop=${params.shop}:`, error);
      return null;
    }),
  ]);

  return { ads, seo, pricing };
}
