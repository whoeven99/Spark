import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import {
  exchangeCodeForTokens,
  getAdsCustomers,
  getGoogleAdsDeveloperToken,
  getGoogleOAuthClient,
  getRedirectUri,
  verifyOAuthState,
} from "../server/adsCatalog/googleOAuth.server";
import {
  setGoogleAdsCredential,
  setGoogleAdsPending,
  clearGoogleAdsPending,
} from "../server/adsCatalog/credentialStore.server";

const CALLBACK_PATH = "/ads/google-ads/callback";

function appRedirect(host: string, params: Record<string, string>) {
  const base = process.env.SHOPIFY_APP_URL || "";
  const target = new URL("/app/ads-catalog", base || "https://example.com");
  if (host) target.searchParams.set("host", host);
  for (const [k, v] of Object.entries(params)) target.searchParams.set(k, v);
  return redirect(base ? target.toString() : target.pathname + target.search);
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const incoming = new URL(request.url);
  const state = incoming.searchParams.get("state") ?? "";
  const code = incoming.searchParams.get("code");
  const oauthError = incoming.searchParams.get("error");

  const verified = verifyOAuthState(state);
  if (!verified || verified.flow !== "ads") {
    return appRedirect("", { adsAuth: "error", reason: "state 校验失败或已过期" });
  }
  const { shop, host } = verified;

  if (oauthError) return appRedirect(host, { adsAuth: "cancelled" });
  if (!code) return appRedirect(host, { adsAuth: "error", reason: "Google 未返回授权 code" });

  const developerToken = getGoogleAdsDeveloperToken();
  if (!developerToken) {
    return appRedirect(host, {
      adsAuth: "error",
      reason: "缺少 GOOGLE_ADS_DEVELOPER_TOKEN 环境变量",
    });
  }

  try {
    const tokens = await exchangeCodeForTokens(code, getRedirectUri(CALLBACK_PATH));
    const customers = await getAdsCustomers(tokens.accessToken, developerToken);
    const { clientId, clientSecret } = getGoogleOAuthClient();

    if (customers.length === 0) {
      return appRedirect(host, {
        adsAuth: "error",
        reason: "该 Google 账号未关联任何 Google Ads 广告账户",
      });
    }

    if (customers.length === 1) {
      await clearGoogleAdsPending(shop);
      await setGoogleAdsCredential(shop, {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        customerId: customers[0].customerId,
      });
      return appRedirect(host, { adsAuth: "success", customerId: customers[0].formatted });
    }

    await setGoogleAdsPending(shop, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      clientId,
      clientSecret,
      accounts: customers.map((c) => ({ id: c.customerId, formatted: c.formatted })),
    });
    return appRedirect(host, { adsAuth: "select" });
  } catch (e) {
    return appRedirect(host, {
      adsAuth: "error",
      reason: e instanceof Error ? e.message : "Google Ads 授权失败",
    });
  }
};
