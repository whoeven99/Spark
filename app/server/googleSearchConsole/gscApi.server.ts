import { getGoogleOAuthClient, GOOGLE_TOKEN_URL } from "../adsCatalog/googleOAuth.server";
import { formatOutboundNetworkError } from "../common/outboundError.server";

export type GscSite = {
  siteUrl: string;
  permissionLevel: string;
};

export type GscSearchType = "web" | "image" | "video" | "news" | "discover" | "googleNews";

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

export type GscSitemap = {
  path: string;
  lastSubmitted: string | null;
  lastDownloaded: string | null;
  isPending: boolean;
  isSitemapsIndex: boolean;
  warnings: number;
  errors: number;
  submittedUrls: number;
};

// Backward compatibility aliases
export type GscQueryRow = GscDimensionRow & { query: string };
export type GscSearchAnalyticsResult = {
  rows: GscDimensionRow[];
  startDate: string;
  endDate: string;
};

type RawGscRow = {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
};

type SearchAnalyticsOptions = {
  startDate: string;
  endDate: string;
  searchType?: GscSearchType;
  dimensions?: GscDimension[];
  rowLimit?: number;
  orderBy?: Array<{ fieldName: string; sortOrder: "ASCENDING" | "DESCENDING" }>;
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

/** 列出站点已提交的 Sitemap 及错误/警告统计。 */
export async function listGscSitemaps(accessToken: string, siteUrl: string): Promise<GscSitemap[]> {
  const encodedSite = encodeURIComponent(siteUrl);
  try {
    const response = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodedSite}/sitemaps`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const json = (await response.json().catch(() => ({}))) as {
      sitemap?: Array<{
        path?: string;
        lastSubmitted?: string;
        lastDownloaded?: string;
        isPending?: boolean;
        isSitemapsIndex?: boolean;
        warnings?: number;
        errors?: number;
        contents?: Array<{ type?: string; submitted?: number }>;
      }>;
      error?: { message?: string };
    };
    if (!response.ok) {
      throw new Error(json.error?.message || `HTTP ${response.status}`);
    }
    return (json.sitemap ?? []).map((item) => ({
      path: item.path ?? "",
      lastSubmitted: item.lastSubmitted ?? null,
      lastDownloaded: item.lastDownloaded ?? null,
      isPending: Boolean(item.isPending),
      isSitemapsIndex: Boolean(item.isSitemapsIndex),
      warnings: item.warnings ?? 0,
      errors: item.errors ?? 0,
      submittedUrls: (item.contents ?? []).reduce((sum, c) => sum + (c.submitted ?? 0), 0),
    }));
  } catch (e) {
    throw new Error(formatOutboundNetworkError(e));
  }
}

export function buildDateRange(days: number): { startDate: string; endDate: string } {
  const endDate = new Date();
  endDate.setDate(endDate.getDate() - 1);
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - (days - 1));
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: fmt(startDate), endDate: fmt(endDate) };
}

/** 上一等长周期的日期范围（用于环比）。 */
export function buildPreviousDateRange(days: number): { startDate: string; endDate: string } {
  const { startDate: currentStart } = buildDateRange(days);
  const prevEnd = new Date(currentStart + "T00:00:00");
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - (days - 1));
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: fmt(prevStart), endDate: fmt(prevEnd) };
}

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

function mapRawRows(rawRows: RawGscRow[]): GscDimensionRow[] {
  return rawRows.map((r) => ({
    key: r.keys?.[0] ?? "",
    clicks: r.clicks ?? 0,
    impressions: r.impressions ?? 0,
    ctr: r.ctr ?? 0,
    position: r.position ?? 0,
  }));
}

function buildAnalyticsBody(options: SearchAnalyticsOptions): Record<string, unknown> {
  const body: Record<string, unknown> = {
    startDate: options.startDate,
    endDate: options.endDate,
  };
  if (options.searchType && options.searchType !== "web") {
    body.type = options.searchType;
  }
  if (options.dimensions?.length) {
    body.dimensions = options.dimensions;
  }
  if (options.rowLimit !== undefined) {
    body.rowLimit = options.rowLimit;
  }
  if (options.orderBy?.length) {
    body.orderBy = options.orderBy;
  }
  return body;
}

function mapSummaryRow(rawRows: RawGscRow[]): GscSummary {
  const row = rawRows[0];
  if (!row) {
    return { totalClicks: 0, totalImpressions: 0, avgCtr: 0, avgPosition: 0 };
  }
  return {
    totalClicks: row.clicks ?? 0,
    totalImpressions: row.impressions ?? 0,
    avgCtr: row.ctr ?? 0,
    avgPosition: row.position ?? 0,
  };
}

/** 查询指定日期范围的汇总指标（无维度分组，与 GSC 控制台一致）。 */
export async function queryAggregateSummary(
  accessToken: string,
  siteUrl: string,
  startDate: string,
  endDate: string,
  searchType: GscSearchType = "web",
): Promise<GscSummary> {
  const rawRows = await doSearchAnalyticsQuery(
    accessToken,
    siteUrl,
    buildAnalyticsBody({ startDate, endDate, searchType }),
  );
  return mapSummaryRow(rawRows);
}

/** 按指定维度查询搜索分析数据。 */
export async function querySearchAnalyticsByDimension(
  accessToken: string,
  siteUrl: string,
  days: number,
  dimension: GscDimension,
  rowLimit = 50,
  searchType: GscSearchType = "web",
): Promise<{ rows: GscDimensionRow[]; startDate: string; endDate: string }> {
  const { startDate, endDate } = buildDateRange(days);
  const rawRows = await doSearchAnalyticsQuery(
    accessToken,
    siteUrl,
    buildAnalyticsBody({
      startDate,
      endDate,
      searchType,
      dimensions: [dimension],
      rowLimit,
      orderBy:
        dimension === "date"
          ? [{ fieldName: "date", sortOrder: "ASCENDING" }]
          : [{ fieldName: "clicks", sortOrder: "DESCENDING" }],
    }),
  );
  return { rows: mapRawRows(rawRows), startDate, endDate };
}

/** 查询汇总指标、环比与按日时序数据（用于图表）。 */
export async function querySummaryAndTimeSeries(
  accessToken: string,
  siteUrl: string,
  days: number,
  searchType: GscSearchType = "web",
): Promise<{
  summary: GscSummary;
  previousSummary: GscSummary;
  timeSeries: GscDimensionRow[];
  startDate: string;
  endDate: string;
}> {
  const { startDate, endDate } = buildDateRange(days);
  const previousRange = buildPreviousDateRange(days);

  const [summaryRows, previousRows, timeSeriesRows] = await Promise.all([
    doSearchAnalyticsQuery(
      accessToken,
      siteUrl,
      buildAnalyticsBody({ startDate, endDate, searchType }),
    ),
    doSearchAnalyticsQuery(
      accessToken,
      siteUrl,
      buildAnalyticsBody({
        startDate: previousRange.startDate,
        endDate: previousRange.endDate,
        searchType,
      }),
    ),
    doSearchAnalyticsQuery(
      accessToken,
      siteUrl,
      buildAnalyticsBody({
        startDate,
        endDate,
        searchType,
        dimensions: ["date"],
        rowLimit: Math.max(days, 90),
        orderBy: [{ fieldName: "date", sortOrder: "ASCENDING" }],
      }),
    ),
  ]);

  return {
    summary: mapSummaryRow(summaryRows),
    previousSummary: mapSummaryRow(previousRows),
    timeSeries: mapRawRows(timeSeriesRows),
    startDate,
    endDate,
  };
}

/** 兼容旧版调用：按 query 维度查询，返回旧格式结果。 */
export async function querySearchAnalytics(
  accessToken: string,
  siteUrl: string,
  days: number,
  rowLimit = 50,
): Promise<GscSearchAnalyticsResult> {
  return querySearchAnalyticsByDimension(accessToken, siteUrl, days, "query", rowLimit);
}
