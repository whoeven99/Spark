/**
 * Google Pixel Activity：从 SLS 读取 `spark:google:*` 事件，供商户 Event activity 页使用。
 *
 * 写入侧：Theme App Embed / purchase Custom Pixel → `/api/pixel-ingest`。
 * 查询侧：强制按 session.shop 过滤，禁止跨店。
 */

import {
  GOOGLE_PIXEL_ACTIVITY_EVENTS,
  GOOGLE_PIXEL_ACTIVITY_FUNNEL_EVENTS,
  GOOGLE_PIXEL_ACTIVITY_TREND_EVENTS,
  GOOGLE_PIXEL_SLS_TOPIC_PREFIX,
  fromGooglePixelSlsEvent,
  toGooglePixelSlsEvent,
  type GooglePixelActivityEvent,
  type GooglePixelActivityRange,
  parseActivityRange,
  resolveActivityRangeMs,
} from "../../lib/googlePixelActivity";
import { getAliyunLogConfig } from "./config.server";
import { getSlsClient } from "./slsClient.server";

const SLS_REQUEST_OPTIONS = { timeout: 30_000 };
const MAX_PAGE_SIZE = 100;
const SHOP_NAME_REGEX = /^[a-z0-9][a-z0-9-]{0,61}\.myshopify\.com$/;

export type GooglePixelActivityCounts = Record<GooglePixelActivityEvent, number>;

export type GooglePixelActivityFunnelStep = {
  event: GooglePixelActivityEvent;
  count: number;
  /** 相对上一阶的转化率（0-100）；首阶为 null。 */
  rateFromPrev: number | null;
};

export type GooglePixelActivityDailyPoint = {
  day: string;
  counts: Partial<Record<GooglePixelActivityEvent, number>>;
};

export type GooglePixelActivityReferralSummary = {
  paidCount: number;
  organicCount: number;
  directCount: number;
  paidPct: number;
  topReferrers: Array<{ label: string; count: number }>;
};

export type GooglePixelActivitySummary = {
  configured: boolean;
  range: GooglePixelActivityRange;
  from: number;
  to: number;
  counts: GooglePixelActivityCounts;
  daily: GooglePixelActivityDailyPoint[];
  funnel: GooglePixelActivityFunnelStep[];
  referral: GooglePixelActivityReferralSummary;
};

export type GooglePixelActivityEventRow = {
  id: string;
  time: number;
  event: string;
  googleEvent: string;
  value: string;
  currency: string;
  pagePath: string;
  pageUrl: string;
  consent: string;
  sentToGoogle: boolean | null;
  source: string;
  clientId: string;
  productId: string;
  schemaVersion: string;
  referrer: string;
  trafficSource: string;
  gclid: string;
  utmSource: string;
  utmMedium: string;
  pixelId: string;
  conversionLabel: string;
  transactionId: string;
  enhancedConversions: string;
  itemsSummary: string;
  deviceBrowser: string;
  deviceOs: string;
  deviceScreen: string;
  payload: Record<string, unknown> | null;
  payloadRaw: string;
};

export type GooglePixelActivityEventsResult = {
  configured: boolean;
  logs: GooglePixelActivityEventRow[];
  total: number;
  complete: boolean;
  page: number;
  pageSize: number;
};

function escapeQueryValue(value: string): string {
  return value.replace(/"/g, '\\"');
}

function emptyCounts(): GooglePixelActivityCounts {
  return {
    page_view: 0,
    add_to_cart: 0,
    begin_checkout: 0,
    add_payment_info: 0,
    purchase: 0,
  };
}

function toInt(value: string | undefined): number {
  if (!value) return 0;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

function ratio(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export function isValidShopName(shop: string): boolean {
  return SHOP_NAME_REGEX.test(shop.trim().toLowerCase());
}

/**
 * 检索子句：限定店铺 + Google Pixel topic。
 *
 * SLS 把 `:` 当作 Key:Value 运算符，不能写 `event: spark:google`（会在第二个
 * 冒号处报 ParameterInvalidError / unexpected COLON）。`:` 又是默认分词符，
 * `spark:google:page_view` 会拆成 spark / google / page_view，因此用两个
 * 无引号 token 条件（对齐 Admin `event: spark`），再由 parse* 精滤。
 */
export function buildGooglePixelBaseQuery(shop: string): string {
  const safeShop = escapeQueryValue(shop.trim().toLowerCase());
  return `shopName: "${safeShop}" and event: spark and event: google`;
}

export function buildGooglePixelCountQuery(shop: string): string {
  return (
    `${buildGooglePixelBaseQuery(shop)} | ` +
    "SELECT event, COUNT(*) AS cnt GROUP BY event ORDER BY cnt DESC LIMIT 100"
  );
}

export function buildGooglePixelDailyQuery(shop: string): string {
  return (
    `${buildGooglePixelBaseQuery(shop)} | ` +
    "SELECT date_format(__time__, '%Y-%m-%d') AS day, event, COUNT(*) AS cnt " +
    "GROUP BY day, event ORDER BY day ASC LIMIT 1000"
  );
}

export function buildGooglePixelEventsSearchQuery(params: {
  shop: string;
  keyword?: string;
}): string {
  const parts = [buildGooglePixelBaseQuery(params.shop)];
  const keyword = params.keyword?.trim();
  if (keyword) parts.push(`"${escapeQueryValue(keyword)}"`);
  return parts.join(" and ");
}

/** 把 GROUP BY event 行解析为卡片计数。**纯函数**。 */
export function parseActivityCountRows(
  rows: Array<Record<string, string>>,
): GooglePixelActivityCounts {
  const counts = emptyCounts();
  for (const row of rows) {
    const googleEvent = fromGooglePixelSlsEvent(row.event ?? "");
    if (!(GOOGLE_PIXEL_ACTIVITY_EVENTS as readonly string[]).includes(googleEvent)) {
      continue;
    }
    counts[googleEvent as GooglePixelActivityEvent] = toInt(row.cnt);
  }
  return counts;
}

/** 把日聚合行解析为折线序列。**纯函数**。 */
export function parseActivityDailyRows(
  rows: Array<Record<string, string>>,
): GooglePixelActivityDailyPoint[] {
  const byDay = new Map<string, Partial<Record<GooglePixelActivityEvent, number>>>();
  for (const row of rows) {
    const day = (row.day ?? "").trim();
    if (!day) continue;
    const googleEvent = fromGooglePixelSlsEvent(row.event ?? "");
    if (!(GOOGLE_PIXEL_ACTIVITY_TREND_EVENTS as readonly string[]).includes(googleEvent)) {
      continue;
    }
    const bucket = byDay.get(day) ?? {};
    bucket[googleEvent as GooglePixelActivityEvent] = toInt(row.cnt);
    byDay.set(day, bucket);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, counts]) => ({ day, counts }));
}

/** 由卡片计数构造漏斗阶梯。**纯函数**。 */
export function buildActivityFunnel(
  counts: GooglePixelActivityCounts,
): GooglePixelActivityFunnelStep[] {
  const steps: GooglePixelActivityFunnelStep[] = [];
  let prev: number | null = null;
  for (const event of GOOGLE_PIXEL_ACTIVITY_FUNNEL_EVENTS) {
    const count = counts[event];
    steps.push({
      event,
      count,
      rateFromPrev: prev === null ? null : ratio(count, prev),
    });
    prev = count;
  }
  return steps;
}

function emptyReferralSummary(): GooglePixelActivityReferralSummary {
  return {
    paidCount: 0,
    organicCount: 0,
    directCount: 0,
    paidPct: 0,
    topReferrers: [],
  };
}

function normalizeReferrerLabel(referrer: string): string {
  const trimmed = referrer.trim();
  if (!trimmed) return "Direct";
  try {
    return new URL(trimmed).hostname.replace(/^www\./i, "");
  } catch {
    return trimmed.length > 48 ? `${trimmed.slice(0, 45)}…` : trimmed;
  }
}

/** 由 page_view 原始行聚合流量来源与 Top Referrers。**纯函数**。 */
export function parseActivityTrafficRows(
  rows: Array<Record<string, string>>,
): GooglePixelActivityReferralSummary {
  let paidCount = 0;
  let organicCount = 0;
  let directCount = 0;
  const referrers = new Map<string, number>();

  for (const row of rows) {
    const payload = parsePayload(row.payload ?? "");
    const trafficSource = readString(payload, "trafficSource").toLowerCase();
    const referrer = readString(payload, "referrer");

    if (trafficSource === "paid") paidCount += 1;
    else if (trafficSource === "organic") organicCount += 1;
    else directCount += 1;

    const label = normalizeReferrerLabel(referrer);
    referrers.set(label, (referrers.get(label) ?? 0) + 1);
  }

  const total = paidCount + organicCount + directCount;
  const topReferrers = [...referrers.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([label, count]) => ({ label, count }));

  return {
    paidCount,
    organicCount,
    directCount,
    paidPct: total > 0 ? Math.round((paidCount / total) * 1000) / 10 : 0,
    topReferrers,
  };
}

function normalizeHistograms(raw: unknown): { total: number; complete: boolean } {
  if (Array.isArray(raw)) {
    const buckets = raw as Array<{ count?: number; progress?: string }>;
    return {
      total: buckets.reduce((sum, bucket) => sum + (bucket.count || 0), 0),
      complete: buckets.every((bucket) => !bucket.progress || bucket.progress === "Complete"),
    };
  }
  if (raw && typeof raw === "object") {
    const obj = raw as {
      count?: number;
      progress?: string;
      histograms?: Array<{ count?: number; progress?: string }>;
    };
    if (Array.isArray(obj.histograms)) {
      return normalizeHistograms(obj.histograms);
    }
    if (typeof obj.count === "number") {
      return {
        total: obj.count,
        complete: !obj.progress || obj.progress === "Complete",
      };
    }
  }
  return { total: 0, complete: true };
}

function parsePayload(raw: string): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // ignore
  }
  return null;
}

function readString(payload: Record<string, unknown> | null, key: string): string {
  if (!payload) return "";
  const value = payload[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function summarizeItems(payload: Record<string, unknown> | null): string {
  const items = payload?.items;
  if (!Array.isArray(items) || items.length === 0) return "";
  const first = items[0];
  const firstName =
    first && typeof first === "object" && first
      ? String(
          (first as Record<string, unknown>).item_name ||
            (first as Record<string, unknown>).title ||
            (first as Record<string, unknown>).id ||
            "",
        ).trim()
      : "";
  if (items.length === 1) return firstName || "1 item";
  return firstName ? `${items.length} items · ${firstName}` : `${items.length} items`;
}

function mapLogRow(
  record: Record<string, string>,
  index: number,
  page: number,
  pageSize: number,
): GooglePixelActivityEventRow {
  const event = (record.event || record.__topic__ || "").trim();
  const googleEvent = fromGooglePixelSlsEvent(event);
  const payloadRaw = record.payload ?? "";
  const payload = parsePayload(payloadRaw);
  const consentObj =
    payload && typeof payload.consent === "object" && payload.consent
      ? (payload.consent as Record<string, unknown>)
      : null;
  const consent =
    (consentObj && typeof consentObj.marketing === "string"
      ? consentObj.marketing
      : "") || readString(payload, "consent") || "unknown";
  const valueRaw = payload?.value;
  const value =
    typeof valueRaw === "number" || typeof valueRaw === "string"
      ? String(valueRaw)
      : "";
  const sent =
    typeof payload?.sentToGoogle === "boolean" ? payload.sentToGoogle : null;
  const deviceObj =
    payload && typeof payload.device === "object" && payload.device
      ? (payload.device as Record<string, unknown>)
      : null;

  return {
    id: `${record.__time__ ?? ""}-${(page - 1) * pageSize + index}`,
    time: Number(record.__time__ ?? 0) * 1000,
    event,
    googleEvent,
    value,
    currency: readString(payload, "currency"),
    pagePath: readString(payload, "pagePath"),
    pageUrl: readString(payload, "pageUrl"),
    consent,
    sentToGoogle: sent,
    source: record.source ?? "",
    clientId: record.clientId ?? "",
    productId: (record.productId ?? "").trim(),
    schemaVersion: (record.schemaVersion ?? "").trim(),
    referrer: readString(payload, "referrer"),
    trafficSource: readString(payload, "trafficSource"),
    gclid: readString(payload, "gclid"),
    utmSource: readString(payload, "utmSource"),
    utmMedium: readString(payload, "utmMedium"),
    pixelId: readString(payload, "pixelId"),
    conversionLabel: readString(payload, "conversionLabel"),
    transactionId: readString(payload, "transaction_id"),
    enhancedConversions: readString(payload, "enhancedConversions"),
    itemsSummary: summarizeItems(payload),
    deviceBrowser: readString(deviceObj, "browser"),
    deviceOs: readString(deviceObj, "os"),
    deviceScreen: readString(deviceObj, "screen"),
    payload,
    payloadRaw,
  };
}

function resolveWindow(range: GooglePixelActivityRange): { from: Date; to: Date; fromMs: number; toMs: number } {
  const toMs = Date.now();
  const fromMs = toMs - resolveActivityRangeMs(range);
  return { from: new Date(fromMs), to: new Date(toMs), fromMs, toMs };
}

export async function loadGooglePixelActivitySummary(params: {
  shop: string;
  range?: string | null;
}): Promise<GooglePixelActivitySummary> {
  const shop = params.shop.trim().toLowerCase();
  const range = parseActivityRange(params.range);
  const { from, to, fromMs, toMs } = resolveWindow(range);
  const empty: GooglePixelActivitySummary = {
    configured: false,
    range,
    from: fromMs,
    to: toMs,
    counts: emptyCounts(),
    daily: [],
    funnel: buildActivityFunnel(emptyCounts()),
    referral: emptyReferralSummary(),
  };

  if (!isValidShopName(shop)) return empty;
  const cfg = getAliyunLogConfig();
  const client = getSlsClient();
  if (!cfg || !client) return empty;

  try {
    const baseQuery = buildGooglePixelBaseQuery(shop);
    const [countRows, dailyRows, trafficRows] = await Promise.all([
      client.getLogs(
        cfg.project,
        cfg.logstore,
        from,
        to,
        { query: buildGooglePixelCountQuery(shop), line: 100 },
        SLS_REQUEST_OPTIONS,
      ),
      client.getLogs(
        cfg.project,
        cfg.logstore,
        from,
        to,
        { query: buildGooglePixelDailyQuery(shop), line: 1000 },
        SLS_REQUEST_OPTIONS,
      ),
      // topic 精确过滤 page_view；检索子句里不能写 `event: spark:google:page_view`（冒号会触发 SLS 语法错误）。
      client
        .getLogs(
          cfg.project,
          cfg.logstore,
          from,
          to,
          {
            query: baseQuery,
            topic: toGooglePixelSlsEvent("page_view"),
            line: 3000,
          },
          SLS_REQUEST_OPTIONS,
        )
        .catch((err) => {
          console.warn(`[googlePixelActivity] traffic query failed shop=${shop}:`, err);
          return [];
        }),
    ]);
    const counts = parseActivityCountRows(
      Array.isArray(countRows) ? countRows : [],
    );
    return {
      configured: true,
      range,
      from: fromMs,
      to: toMs,
      counts,
      daily: parseActivityDailyRows(Array.isArray(dailyRows) ? dailyRows : []),
      funnel: buildActivityFunnel(counts),
      referral: parseActivityTrafficRows(Array.isArray(trafficRows) ? trafficRows : []),
    };
  } catch (err) {
    console.warn(`[googlePixelActivity] summary failed shop=${shop}:`, err);
    return { ...empty, configured: true };
  }
}

export async function loadGooglePixelActivityEvents(params: {
  shop: string;
  range?: string | null;
  event?: string | null;
  keyword?: string | null;
  page?: number;
  pageSize?: number;
  fromMs?: number;
  toMs?: number;
}): Promise<GooglePixelActivityEventsResult> {
  const shop = params.shop.trim().toLowerCase();
  const range = parseActivityRange(params.range);
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, params.pageSize ?? 50));
  const empty: GooglePixelActivityEventsResult = {
    configured: false,
    logs: [],
    total: 0,
    complete: true,
    page,
    pageSize,
  };
  if (!isValidShopName(shop)) return empty;

  const cfg = getAliyunLogConfig();
  const client = getSlsClient();
  if (!cfg || !client) return empty;

  const now = Date.now();
  const toMs = params.toMs && params.toMs > 0 ? params.toMs : now;
  const fromMs =
    params.fromMs && params.fromMs > 0
      ? params.fromMs
      : toMs - resolveActivityRangeMs(range);
  if (fromMs >= toMs) return { ...empty, configured: true };

  const eventFilter = (params.event ?? "").trim();
  const topic =
    eventFilter && !eventFilter.startsWith(GOOGLE_PIXEL_SLS_TOPIC_PREFIX)
      ? toGooglePixelSlsEvent(eventFilter)
      : eventFilter || undefined;

  const query = buildGooglePixelEventsSearchQuery({
    shop,
    keyword: params.keyword ?? undefined,
  });

  try {
    const [records, histograms] = await Promise.all([
      client.getLogs(
        cfg.project,
        cfg.logstore,
        new Date(fromMs),
        new Date(toMs),
        {
          query,
          topic,
          line: pageSize,
          offset: (page - 1) * pageSize,
          reverse: true,
        },
        SLS_REQUEST_OPTIONS,
      ),
      client.getHistograms(
        cfg.project,
        cfg.logstore,
        new Date(fromMs),
        new Date(toMs),
        { query, topic },
        SLS_REQUEST_OPTIONS,
      ),
    ]);
    const hist = normalizeHistograms(histograms);
    const logs = (Array.isArray(records) ? records : []).map((row, index) =>
      mapLogRow(row, index, page, pageSize),
    );
    return {
      configured: true,
      logs,
      total: hist.total,
      complete: hist.complete,
      page,
      pageSize,
    };
  } catch (err) {
    console.warn(`[googlePixelActivity] events failed shop=${shop}:`, err);
    return { ...empty, configured: true };
  }
}
