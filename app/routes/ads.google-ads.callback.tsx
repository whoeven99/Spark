import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import {
  buildGoogleOAuthReturnUrl,
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

function appRedirect(shop: string, host: string, params: Record<string, string>) {
  return redirect(buildGoogleOAuthReturnUrl({ shop, host, query: params }));
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const incoming = new URL(request.url);
  const state = incoming.searchParams.get("state") ?? "";
  const code = incoming.searchParams.get("code");
  const oauthError = incoming.searchParams.get("error");

  const verified = verifyOAuthState(state);
  if (!verified || verified.flow !== "ads") {
    return redirect("/auth/login");
  }
  const { shop, host } = verified;

  if (oauthError) return appRedirect(shop, host, { adsAuth: "cancelled" });
  if (!code) return appRedirect(shop, host, { adsAuth: "error", reason: "Google 未返回授权 code" });

  const developerToken = getGoogleAdsDeveloperToken();
  if (!developerToken) {
    return appRedirect(shop, host, {
      adsAuth: "error",
      reason: "缺少 GOOGLE_ADS_DEVELOPER_TOKEN 环境变量",
    });
  }

  try {
    const tokens = await exchangeCodeForTokens(code, getRedirectUri(CALLBACK_PATH));
    const customers = await getAdsCustomers(tokens.accessToken, developerToken);
    const { clientId, clientSecret } = getGoogleOAuthClient();

    if (customers.length === 0) {
      return appRedirect(shop, host, {
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
      return appRedirect(shop, host, { adsAuth: "success", customerId: customers[0].formatted });
    }

    await setGoogleAdsPending(shop, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      clientId,
      clientSecret,
      accounts: customers.map((c) => ({ id: c.customerId, formatted: c.formatted })),
    });
    return appRedirect(shop, host, { adsAuth: "select" });
  } catch (e) {
    return appRedirect(shop, host, {
      adsAuth: "error",
      reason: e instanceof Error ? e.message : "Google Ads 授权失败",
    });
  }
};
