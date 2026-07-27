import { getGoogleOAuthClient, GOOGLE_TOKEN_URL } from "../adsCatalog/googleOAuth.server";
import { formatOutboundNetworkError } from "../common/outboundError.server";

export type GscSite = {
  siteUrl: string;
  permissionLevel: string;
};

export type GscQueryRow = {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type GscSearchAnalyticsResult = {
  rows: GscQueryRow[];
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

/** 查询站点的搜索分析数据，按查询词分组，返回 top N 行。 */
export async function querySearchAnalytics(
  accessToken: string,
  siteUrl: string,
  days: number,
  rowLimit = 25,
): Promise<GscSearchAnalyticsResult> {
  const { startDate, endDate } = buildDateRange(days);
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
        body: JSON.stringify({
          startDate,
          endDate,
          dimensions: ["query"],
          rowLimit,
          orderBy: [{ fieldName: "clicks", sortOrder: "DESCENDING" }],
        }),
      },
    );
    const json = (await response.json().catch(() => ({}))) as {
      rows?: Array<{
        keys?: string[];
        clicks?: number;
        impressions?: number;
        ctr?: number;
        position?: number;
      }>;
      error?: { message?: string };
    };
    if (!response.ok) {
      throw new Error(json.error?.message || `HTTP ${response.status}`);
    }
    const rows: GscQueryRow[] = (json.rows ?? []).map((r) => ({
      query: r.keys?.[0] ?? "",
      clicks: r.clicks ?? 0,
      impressions: r.impressions ?? 0,
      ctr: r.ctr ?? 0,
      position: r.position ?? 0,
    }));
    return { rows, startDate, endDate };
  } catch (e) {
    throw new Error(formatOutboundNetworkError(e));
  }
}
