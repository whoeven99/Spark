import { getGoogleOAuthClient, GOOGLE_TOKEN_URL } from "../adsCatalog/googleOAuth.server";
import { formatOutboundNetworkError } from "../common/outboundError.server";

export type GscSite = {
  siteUrl: string;
  permissionLevel: string;
};

export type GscDimension = "query" | "page" | "country" | "device" | "searchAppearance" | "date";

export type GscDimensionRow = {
  key: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type GscSummary = {
  totalClicks: number;
  totalImpressions: number;
  avgCtr: number;
  avgPosition: number;
};

// Backward compatibility aliases
export type GscQueryRow = GscDimensionRow & { query: string };
export type GscSearchAnalyticsResult = {
  rows: GscDimensionRow[];
  startDate: string;
  endDate: string;
};

/** 用 refresh token 换新的 access token。 */
export async function refreshGscAccessToken(refreshToken: string): Promise<string> {
  const { clientId, clientSecret } = getGoogleOAuthClient();
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }).toString(),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`GSC token refresh failed: HTTP ${response.status} ${text.slice(0, 200)}`);
  }
  const json = JSON.parse(text) as { access_token?: string };
  if (!json.access_token) {
    throw new Error("GSC token refresh returned no access_token");
  }
  return json.access_token;
}

/** 列出该 Google 账号下的所有已验证站点。 */
export async function listGscSites(accessToken: string): Promise<GscSite[]> {
  try {
    const response = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json = (await response.json().catch(() => ({}))) as {
      siteEntry?: Array<{ siteUrl?: string; permissionLevel?: string }>;
      error?: { message?: string };
    };
    if (!response.ok) {
      throw new Error(json.error?.message || `HTTP ${response.status}`);
    }
    return (json.siteEntry ?? []).map((s) => ({
      siteUrl: s.siteUrl ?? "",
      permissionLevel: s.permissionLevel ?? "siteOwner",
    }));
  } catch (e) {
    throw new Error(formatOutboundNetworkError(e));
  }
}

function buildDateRange(days: number): { startDate: string; endDate: string } {
  const endDate = new Date();
  endDate.setDate(endDate.getDate() - 1);
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - (days - 1));
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: fmt(startDate), endDate: fmt(endDate) };
}

type RawGscRow = {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
};

async function doSearchAnalyticsQuery(
  accessToken: string,
  siteUrl: string,
  body: object,
): Promise<RawGscRow[]> {
  const encodedSite = encodeURIComponent(siteUrl);
  try {
    const response = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodedSite}/searchAnalytics/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );
    const json = (await response.json().catch(() => ({}))) as {
      rows?: RawGscRow[];
      error?: { message?: string };
    };
    if (!response.ok) {
      throw new Error(json.error?.message || `HTTP ${response.status}`);
    }
    return json.rows ?? [];
  } catch (e) {
    throw new Error(formatOutboundNetworkError(e));
  }
}

/** 按指定维度查询搜索分析数据。 */
export async function querySearchAnalyticsByDimension(
  accessToken: string,
  siteUrl: string,
  days: number,
  dimension: GscDimension,
  rowLimit = 25,
): Promise<{ rows: GscDimensionRow[]; startDate: string; endDate: string }> {
  const { startDate, endDate } = buildDateRange(days);
  const rawRows = await doSearchAnalyticsQuery(accessToken, siteUrl, {
    startDate,
    endDate,
    dimensions: [dimension],
    rowLimit,
    orderBy:
      dimension === "date"
        ? [{ fieldName: "date", sortOrder: "ASCENDING" }]
        : [{ fieldName: "clicks", sortOrder: "DESCENDING" }],
  });
  const rows: GscDimensionRow[] = rawRows.map((r) => ({
    key: r.keys?.[0] ?? "",
    clicks: r.clicks ?? 0,
    impressions: r.impressions ?? 0,
    ctr: r.ctr ?? 0,
    position: r.position ?? 0,
  }));
  return { rows, startDate, endDate };
}

/** 查询汇总指标与按日时序数据（用于图表）。 */
export async function querySummaryAndTimeSeries(
  accessToken: string,
  siteUrl: string,
  days: number,
): Promise<{ summary: GscSummary; timeSeries: GscDimensionRow[]; startDate: string; endDate: string }> {
  const { startDate, endDate } = buildDateRange(days);
  const rawRows = await doSearchAnalyticsQuery(accessToken, siteUrl, {
    startDate,
    endDate,
    dimensions: ["date"],
    rowLimit: 90,
    orderBy: [{ fieldName: "date", sortOrder: "ASCENDING" }],
  });
  const timeSeries: GscDimensionRow[] = rawRows.map((r) => ({
    key: r.keys?.[0] ?? "",
    clicks: r.clicks ?? 0,
    impressions: r.impressions ?? 0,
    ctr: r.ctr ?? 0,
    position: r.position ?? 0,
  }));
  const totalClicks = timeSeries.reduce((s, r) => s + r.clicks, 0);
  const totalImpressions = timeSeries.reduce((s, r) => s + r.impressions, 0);
  const avgCtr =
    timeSeries.length > 0
      ? timeSeries.reduce((s, r) => s + r.ctr, 0) / timeSeries.length
      : 0;
  const avgPosition =
    timeSeries.length > 0
      ? timeSeries.reduce((s, r) => s + r.position, 0) / timeSeries.length
      : 0;
  return {
    summary: { totalClicks, totalImpressions, avgCtr, avgPosition },
    timeSeries,
    startDate,
    endDate,
  };
}

/** 兼容旧版调用：按 query 维度查询，返回旧格式结果。 */
export async function querySearchAnalytics(
  accessToken: string,
  siteUrl: string,
  days: number,
  rowLimit = 25,
): Promise<GscSearchAnalyticsResult> {
  return querySearchAnalyticsByDimension(accessToken, siteUrl, days, "query", rowLimit);
}
