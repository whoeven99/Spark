import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  getGscCredential,
  setGscCredential,
} from "../server/googleSearchConsole/gscCredentials.server";
import {
  type GscDimension,
  type GscDimensionRow,
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
  timeSeries: GscDimensionRow[];
  rows: GscDimensionRow[];
  dimension: GscDimension;
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
  if (n === 14 || n === 28 || n === 30 || n === 90) return n;
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

function parseDimension(raw: string | null): GscDimension {
  if (raw && VALID_DIMENSIONS.includes(raw as GscDimension)) return raw as GscDimension;
  return "query";
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const days = parseDays(url.searchParams.get("days"));
  const dimension = parseDimension(url.searchParams.get("dimension"));

  const credential = await getGscCredential(session.shop);
  if (!credential) {
    return Response.json({ ok: true, connected: false } satisfies GscStatusNotConnected);
  }

  let accessToken = credential.accessToken;

  try {
    if (credential.refreshToken) {
      try {
        accessToken = await refreshGscAccessToken(credential.refreshToken);
        await setGscCredential(session.shop, { ...credential, accessToken });
      } catch {
        // refresh 失败时继续用旧 token 尝试
      }
    }

    const [summaryData, dimensionData] = await Promise.all([
      querySummaryAndTimeSeries(accessToken, credential.siteUrl, days),
      querySearchAnalyticsByDimension(accessToken, credential.siteUrl, days, dimension),
    ]);

    return Response.json({
      ok: true,
      connected: true,
      siteUrl: credential.siteUrl,
      startDate: summaryData.startDate,
      endDate: summaryData.endDate,
      summary: summaryData.summary,
      timeSeries: summaryData.timeSeries,
      rows: dimensionData.rows,
      dimension,
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
