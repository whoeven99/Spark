import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  getGa4Credential,
  setGa4Credential,
} from "../server/googleAnalytics/ga4Credentials.server";
import {
  type Ga4Dimension,
  type Ga4Row,
  type Ga4Summary,
  queryGa4ByDimension,
  queryGa4SummaryAndTimeSeries,
  refreshGa4AccessToken,
} from "../server/googleAnalytics/ga4Api.server";

export type Ga4StatusOk = {
  ok: true;
  connected: true;
  propertyId: string;
  propertyName: string;
  startDate: string;
  endDate: string;
  summary: Ga4Summary;
  timeSeries: Ga4Row[];
  rows: Ga4Row[];
  dimension: Ga4Dimension;
};

export type Ga4StatusNotConnected = {
  ok: true;
  connected: false;
};

export type Ga4StatusError = {
  ok: false;
  error: string;
};

export type Ga4StatusResponse = Ga4StatusOk | Ga4StatusNotConnected | Ga4StatusError;

function parseDays(raw: string | null): number {
  const n = Number(raw);
  if (n === 28 || n === 90) return n;
  return 7;
}

const VALID_DIMENSIONS: Ga4Dimension[] = [
  "date",
  "sessionDefaultChannelGroup",
  "country",
  "deviceCategory",
  "landingPage",
];

function parseDimension(raw: string | null): Ga4Dimension {
  if (raw && VALID_DIMENSIONS.includes(raw as Ga4Dimension)) return raw as Ga4Dimension;
  return "sessionDefaultChannelGroup";
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const days = parseDays(url.searchParams.get("days"));
  const dimension = parseDimension(url.searchParams.get("dimension"));

  const credential = await getGa4Credential(session.shop);
  if (!credential) {
    return Response.json({ ok: true, connected: false } satisfies Ga4StatusNotConnected);
  }

  let accessToken = credential.accessToken;

  try {
    if (credential.refreshToken) {
      try {
        accessToken = await refreshGa4AccessToken(credential.refreshToken);
        await setGa4Credential(session.shop, { ...credential, accessToken });
      } catch {
        // refresh 失败时继续用旧 token 尝试
      }
    }

    const [{ summary, timeSeries, startDate, endDate }, { rows }] = await Promise.all([
      queryGa4SummaryAndTimeSeries(accessToken, credential.propertyId, days),
      queryGa4ByDimension(accessToken, credential.propertyId, days, dimension),
    ]);

    return Response.json({
      ok: true,
      connected: true,
      propertyId: credential.propertyId,
      propertyName: credential.propertyName,
      startDate,
      endDate,
      summary,
      timeSeries,
      rows,
      dimension,
    } satisfies Ga4StatusOk);
  } catch (e) {
    return Response.json({
      ok: false,
      error: e instanceof Error ? e.message : "获取 GA4 数据失败",
    } satisfies Ga4StatusError);
  }
};
