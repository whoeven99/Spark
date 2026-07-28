import { getGoogleOAuthClient, GOOGLE_TOKEN_URL } from "../adsCatalog/googleOAuth.server";
import { formatOutboundNetworkError } from "../common/outboundError.server";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type Ga4Property = {
  propertyId: string;
  propertyName: string;
  accountName: string;
};

export type Ga4Dimension =
  | "date"
  | "sessionDefaultChannelGroup"
  | "country"
  | "deviceCategory"
  | "landingPage";

export type Ga4Row = {
  key: string;
  users: number;
  sessions: number;
  pageViews: number;
  revenue: number;
};

export type Ga4Summary = {
  totalUsers: number;
  totalSessions: number;
  totalPageViews: number;
  totalRevenue: number;
};

// ─── Token refresh ─────────────────────────────────────────────────────────────

export async function refreshGa4AccessToken(refreshToken: string): Promise<string> {
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
    throw new Error(`GA4 token refresh failed: HTTP ${response.status} ${text.slice(0, 200)}`);
  }
  const json = JSON.parse(text) as { access_token?: string };
  if (!json.access_token) {
    throw new Error("GA4 token refresh returned no access_token");
  }
  return json.access_token;
}

// ─── Admin API: list GA4 properties ───────────────────────────────────────────

type RawAccountSummary = {
  account?: string;
  displayName?: string;
  propertySummaries?: Array<{
    property?: string;
    displayName?: string;
  }>;
};

/** 列出该 Google 账号下所有可访问的 GA4 属性。 */
export async function listGa4Properties(accessToken: string): Promise<Ga4Property[]> {
  try {
    const response = await fetch(
      "https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=50",
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const json = (await response.json().catch(() => ({}))) as {
      accountSummaries?: RawAccountSummary[];
      error?: { message?: string };
    };
    if (!response.ok) {
      throw new Error(json.error?.message || `HTTP ${response.status}`);
    }

    const properties: Ga4Property[] = [];
    for (const account of json.accountSummaries ?? []) {
      const accountName = account.displayName ?? account.account ?? "";
      for (const prop of account.propertySummaries ?? []) {
        if (prop.property) {
          properties.push({
            propertyId: prop.property,
            propertyName: prop.displayName ?? prop.property,
            accountName,
          });
        }
      }
    }
    return properties;
  } catch (e) {
    throw new Error(formatOutboundNetworkError(e));
  }
}

// ─── Data API: run report ──────────────────────────────────────────────────────

function buildDateRange(days: number): { startDate: string; endDate: string } {
  const end = new Date();
  end.setDate(end.getDate() - 1);
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: fmt(start), endDate: fmt(end) };
}

/** 从 properties/123 中提取数字部分。 */
function extractPropertyNumericId(propertyId: string): string {
  return propertyId.replace(/^properties\//, "");
}

/** GA4 日期格式 YYYYMMDD → YYYY-MM-DD */
function normalizeGa4Date(raw: string): string {
  if (raw.length === 8 && !raw.includes("-")) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  }
  return raw;
}

type RawGa4Row = {
  dimensionValues?: Array<{ value?: string }>;
  metricValues?: Array<{ value?: string }>;
};

type RawGa4Response = {
  rows?: RawGa4Row[];
  totals?: RawGa4Row[];
  error?: { message?: string };
};

const REPORT_METRICS = [
  { name: "activeUsers" },
  { name: "sessions" },
  { name: "screenPageViews" },
  { name: "purchaseRevenue" },
];

async function runReport(
  accessToken: string,
  propertyId: string,
  body: object,
): Promise<RawGa4Response> {
  const numericId = extractPropertyNumericId(propertyId);
  try {
    const response = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${numericId}:runReport`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );
    const json = (await response.json().catch(() => ({}))) as RawGa4Response;
    if (!response.ok) {
      throw new Error(json.error?.message || `HTTP ${response.status}`);
    }
    return json;
  } catch (e) {
    throw new Error(formatOutboundNetworkError(e));
  }
}

function parseRow(raw: RawGa4Row): Omit<Ga4Row, "key"> {
  const m = raw.metricValues ?? [];
  return {
    users: parseFloat(m[0]?.value ?? "0") || 0,
    sessions: parseFloat(m[1]?.value ?? "0") || 0,
    pageViews: parseFloat(m[2]?.value ?? "0") || 0,
    revenue: parseFloat(m[3]?.value ?? "0") || 0,
  };
}

/** 查询汇总指标与按日时序数据（用于图表）。 */
export async function queryGa4SummaryAndTimeSeries(
  accessToken: string,
  propertyId: string,
  days: number,
): Promise<{
  summary: Ga4Summary;
  timeSeries: Ga4Row[];
  startDate: string;
  endDate: string;
}> {
  const { startDate, endDate } = buildDateRange(days);
  const result = await runReport(accessToken, propertyId, {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "date" }],
    metrics: REPORT_METRICS,
    orderBys: [{ dimension: { dimensionName: "date" }, desc: false }],
  });

  const timeSeries: Ga4Row[] = (result.rows ?? []).map((r) => ({
    key: normalizeGa4Date(r.dimensionValues?.[0]?.value ?? ""),
    ...parseRow(r),
  }));

  const summary: Ga4Summary = {
    totalUsers: timeSeries.reduce((s, r) => s + r.users, 0),
    totalSessions: timeSeries.reduce((s, r) => s + r.sessions, 0),
    totalPageViews: timeSeries.reduce((s, r) => s + r.pageViews, 0),
    totalRevenue: timeSeries.reduce((s, r) => s + r.revenue, 0),
  };

  return { summary, timeSeries, startDate, endDate };
}

/** 按维度查询报表数据（用于维度表格）。 */
export async function queryGa4ByDimension(
  accessToken: string,
  propertyId: string,
  days: number,
  dimension: Ga4Dimension,
  rowLimit = 25,
): Promise<{ rows: Ga4Row[]; startDate: string; endDate: string }> {
  const { startDate, endDate } = buildDateRange(days);

  if (dimension === "date") {
    const { timeSeries } = await queryGa4SummaryAndTimeSeries(accessToken, propertyId, days);
    return { rows: timeSeries, startDate, endDate };
  }

  const result = await runReport(accessToken, propertyId, {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: dimension }],
    metrics: REPORT_METRICS,
    limit: rowLimit,
    orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
  });

  const rows: Ga4Row[] = (result.rows ?? []).map((r) => ({
    key: r.dimensionValues?.[0]?.value ?? "",
    ...parseRow(r),
  }));

  return { rows, startDate, endDate };
}
