import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  getGscCredential,
  setGscCredential,
} from "../server/googleSearchConsole/gscCredentials.server";
import {
  querySearchAnalytics,
  refreshGscAccessToken,
  type GscSearchAnalyticsResult,
} from "../server/googleSearchConsole/gscApi.server";

export type GscStatusOk = {
  ok: true;
  connected: true;
  siteUrl: string;
  analytics: GscSearchAnalyticsResult;
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

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const days = parseDays(url.searchParams.get("days"));

  const credential = await getGscCredential(session.shop);
  if (!credential) {
    return Response.json({ ok: true, connected: false } satisfies GscStatusNotConnected);
  }

  let accessToken = credential.accessToken;

  try {
    // 尝试用 refresh token 获取最新 access token（防止过期）
    if (credential.refreshToken) {
      try {
        accessToken = await refreshGscAccessToken(credential.refreshToken);
        await setGscCredential(session.shop, { ...credential, accessToken });
      } catch {
        // refresh 失败时继续用旧 token 尝试；若查询也失败再上报
      }
    }

    const analytics = await querySearchAnalytics(accessToken, credential.siteUrl, days);

    return Response.json({
      ok: true,
      connected: true,
      siteUrl: credential.siteUrl,
      analytics,
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
