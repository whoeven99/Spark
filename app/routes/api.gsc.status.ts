import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  getGscCredential,
  setGscCredential,
} from "../server/googleSearchConsole/gscCredentials.server";
import {
  type GscDimension,
  type GscDimensionRow,
  type GscSearchType,
  type GscSummary,
  querySearchAnalyticsByDimension,
  querySummaryAndTimeSeries,
  refreshGscAccessToken,
} from "../server/googleSearchConsole/gscApi.server";

export type GscStatusOk = {
  ok: true;
  connected: true;
  siteUrl: string;
  startDate: string;
  endDate: string;
  summary: GscSummary;
  previousSummary: GscSummary;
  timeSeries: GscDimensionRow[];
  rows: GscDimensionRow[];
  dimension: GscDimension;
  searchType: GscSearchType;
};

export type GscStatusNotConnected = {
  ok: true;
  connected: false;
};

export type GscStatusError = {
  ok: false;
  error: string;
};

export type GscStatusResponse = GscStatusOk | GscStatusNotConnected | GscStatusError;

function parseDays(raw: string | null): number {
  const n = Number(raw);
  if (n === 28 || n === 90) return n;
  return 7;
}

const VALID_DIMENSIONS: GscDimension[] = [
  "query",
  "page",
  "country",
  "device",
  "searchAppearance",
  "date",
];

const VALID_SEARCH_TYPES: GscSearchType[] = [
  "web",
  "image",
  "video",
  "news",
  "discover",
  "googleNews",
];

function parseDimension(raw: string | null): GscDimension {
  if (raw && VALID_DIMENSIONS.includes(raw as GscDimension)) return raw as GscDimension;
  return "query";
}

function parseSearchType(raw: string | null): GscSearchType {
  if (raw && VALID_SEARCH_TYPES.includes(raw as GscSearchType)) return raw as GscSearchType;
  return "web";
}

async function resolveGscAccessToken(shop: string) {
  const credential = await getGscCredential(shop);
  if (!credential) return null;

  let accessToken = credential.accessToken;
  if (credential.refreshToken) {
    try {
      accessToken = await refreshGscAccessToken(credential.refreshToken);
      await setGscCredential(shop, { ...credential, accessToken });
    } catch {
      // refresh 失败时继续用旧 token 尝试
    }
  }
  return { ...credential, accessToken };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const days = parseDays(url.searchParams.get("days"));
  const dimension = parseDimension(url.searchParams.get("dimension"));
  const searchType = parseSearchType(url.searchParams.get("searchType"));

  const credential = await resolveGscAccessToken(session.shop);
  if (!credential) {
    return Response.json({ ok: true, connected: false } satisfies GscStatusNotConnected);
  }

  try {
    const [summaryData, dimensionData] = await Promise.all([
      querySummaryAndTimeSeries(credential.accessToken, credential.siteUrl, days, searchType),
      querySearchAnalyticsByDimension(
        credential.accessToken,
        credential.siteUrl,
        days,
        dimension,
        50,
        searchType,
      ),
    ]);

    return Response.json({
      ok: true,
      connected: true,
      siteUrl: credential.siteUrl,
      startDate: summaryData.startDate,
      endDate: summaryData.endDate,
      summary: summaryData.summary,
      previousSummary: summaryData.previousSummary,
      timeSeries: summaryData.timeSeries,
      rows: dimensionData.rows,
      dimension,
      searchType,
    } satisfies GscStatusOk);
  } catch (e) {
    return Response.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "获取 Search Console 数据失败",
      } satisfies GscStatusError,
      { status: 200 },
    );
  }
};
