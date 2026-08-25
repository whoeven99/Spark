/**
 * Web Pixel 漏斗读取层（docs/DAILY_OPERATIONS_WORKFLOWS.md §7.2 流量波动 / §7.3 转化率）。
 *
 * Web Pixel 扩展（extensions/ciwi-spark-web-pixel）已把全部标准事件写入阿里云 SLS，
 * 此前没有任何代码读回。本模块用 SLS SQL 分析查询把会话与结账漏斗聚合出来，
 * 供 diagnosis.server.ts 计算「流量波动」「转化率」两个诊断项。
 *
 * 设计要点：
 * - 一次窗口查询用一条 `GROUP BY event` 的 SQL 聚合，避免逐事件多次往返；
 * - `approx_distinct(clientId)` 近似去重得到会话/独立访客数；
 * - 任何「未配置 / 查询失败 / 索引未开」都静默降级为 null，诊断层据此跳过这两项，
 *   与全仓既有的 SLS「静默降级」风格一致；
 * - 纯函数（解析聚合行、计算漏斗指标）单测覆盖，IO 仅薄包一层。
 */

import { getAliyunLogConfig } from "./config.server";
import { getSlsClient } from "./slsClient.server";

/** 漏斗各环节对应的 SLS 事件名（与 shopifyAnalyticsModule 上报口径一致）。 */
export const PIXEL_FUNNEL_EVENTS = {
  pageViewed: "spark:shopify:page_viewed",
  addedToCart: "spark:shopify:product_added_to_cart",
  checkoutStarted: "spark:shopify:checkout_started",
  paymentSubmitted: "spark:shopify:payment_info_submitted",
  checkoutCompleted: "spark:shopify:checkout_completed",
} as const;

/** 单窗口的漏斗计数（事件次数 + 近似独立访客数）。 */
export type PixelFunnelCounts = {
  /** page_viewed 的独立 clientId 数，作为会话/访客口径。 */
  sessions: number;
  /** page_viewed 事件次数（浏览量）。 */
  pageViews: number;
  /** 发生过加购的独立访客数。 */
  addToCartVisitors: number;
  /** checkout_started 事件次数。 */
  checkoutStarted: number;
  /** payment_info_submitted 事件次数（支付尝试）。 */
  paymentSubmitted: number;
  /** checkout_completed 事件次数（完成结账）。 */
  checkoutCompleted: number;
};

/** 由计数派生的漏斗比率（无分母时为 null）。 */
export type PixelFunnelMetrics = {
  /** 会话转化率 = 完成结账 / 会话 * 100 */
  conversionRate: number | null;
  /** 加购率 = 加购访客 / 会话 * 100 */
  addToCartRate: number | null;
  /** 结账完成率 = 完成结账 / 发起结账 * 100 */
  checkoutRate: number | null;
  /** 支付成功率 = 完成结账 / 支付尝试 * 100 */
  paymentRate: number | null;
};

export type PixelFunnelWindows = {
  current: PixelFunnelCounts | null;
  previous: PixelFunnelCounts | null;
};

export type PixelFunnelRanges = {
  currentFrom: Date;
  currentTo: Date;
  prevFrom: Date;
  prevTo: Date;
};

/** diagnosis.server.ts 注入用的加载器签名（便于单测打桩）。 */
export type PixelFunnelLoader = (
  shop: string,
  ranges: PixelFunnelRanges,
) => Promise<PixelFunnelWindows | null>;

const EMPTY_COUNTS: PixelFunnelCounts = {
  sessions: 0,
  pageViews: 0,
  addToCartVisitors: 0,
  checkoutStarted: 0,
  paymentSubmitted: 0,
  checkoutCompleted: 0,
};

function toInt(value: string | undefined): number {
  if (!value) return 0;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/**
 * 把 `GROUP BY event` 的 SQL 聚合行解析为漏斗计数。**纯函数**。
 *
 * 每行形如 `{ event: "spark:shopify:page_viewed", cnt: "1234", uv: "567" }`。
 * 缺失的事件按 0 计。
 */
export function parseFunnelRows(rows: Array<Record<string, string>>): PixelFunnelCounts {
  const counts: PixelFunnelCounts = { ...EMPTY_COUNTS };
  for (const row of rows) {
    const event = (row.event ?? "").trim();
    const cnt = toInt(row.cnt);
    const uv = toInt(row.uv);
    switch (event) {
      case PIXEL_FUNNEL_EVENTS.pageViewed:
        counts.pageViews = cnt;
        counts.sessions = uv;
        break;
      case PIXEL_FUNNEL_EVENTS.addedToCart:
        counts.addToCartVisitors = uv;
        break;
      case PIXEL_FUNNEL_EVENTS.checkoutStarted:
        counts.checkoutStarted = cnt;
        break;
      case PIXEL_FUNNEL_EVENTS.paymentSubmitted:
        counts.paymentSubmitted = cnt;
        break;
      case PIXEL_FUNNEL_EVENTS.checkoutCompleted:
        counts.checkoutCompleted = cnt;
        break;
      default:
        break;
    }
  }
  return counts;
}

function ratio(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

/** 由漏斗计数派生比率。**纯函数**。 */
export function buildFunnelMetrics(counts: PixelFunnelCounts): PixelFunnelMetrics {
  return {
    conversionRate: ratio(counts.checkoutCompleted, counts.sessions),
    addToCartRate: ratio(counts.addToCartVisitors, counts.sessions),
    checkoutRate: ratio(counts.checkoutCompleted, counts.checkoutStarted),
    paymentRate: ratio(counts.checkoutCompleted, counts.paymentSubmitted),
  };
}

/** 转义查询值里的双引号，避免破坏 SLS 查询语法。 */
function escapeQueryValue(value: string): string {
  return value.replace(/"/g, '\\"');
}

/**
 * 构造一条 SLS 分析查询：按店铺过滤、按 event 分组聚合次数与独立访客。
 * 暴露为纯函数便于单测断言查询语句稳定。
 */
export function buildFunnelQuery(shop: string): string {
  const safeShop = escapeQueryValue(shop.trim().toLowerCase());
  return (
    `shopName: "${safeShop}" | ` +
    "SELECT event, COUNT(*) AS cnt, approx_distinct(clientId) AS uv " +
    "GROUP BY event ORDER BY cnt DESC LIMIT 100"
  );
}

/**
 * 查询单个时间窗口的漏斗计数。配置缺失 / 查询异常 → 返回 null（静默降级）。
 */
export async function queryPixelFunnelWindow(
  shop: string,
  from: Date,
  to: Date,
): Promise<PixelFunnelCounts | null> {
  const cfg = getAliyunLogConfig();
  if (!cfg) return null;
  const client = getSlsClient();
  if (!client) return null;
  if (!(from instanceof Date) || !(to instanceof Date) || from >= to) return null;

  try {
    const rows = await client.getLogs(cfg.project, cfg.logstore, from, to, {
      query: buildFunnelQuery(shop),
      line: 100,
    });
    if (!Array.isArray(rows)) return null;
    return parseFunnelRows(rows);
  } catch (err) {
    console.warn(`[pixelQuery] getLogs failed (shop=${shop}):`, err);
    return null;
  }
}

/**
 * 默认加载器：并行查询当前 / 上一周期两个窗口。
 * 未配置时返回 null（诊断层据此整体跳过 pixel 诊断项）；
 * 已配置但单窗口失败时该窗口为 null（仍可计算可用部分）。
 */
export const loadPixelFunnel: PixelFunnelLoader = async (shop, ranges) => {
  if (!getAliyunLogConfig()) return null;
  const [current, previous] = await Promise.all([
    queryPixelFunnelWindow(shop, ranges.currentFrom, ranges.currentTo),
    queryPixelFunnelWindow(shop, ranges.prevFrom, ranges.prevTo),
  ]);
  if (!current && !previous) return null;
  return { current, previous };
};
