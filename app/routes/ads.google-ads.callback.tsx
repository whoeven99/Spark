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

function appRedirect(
  request: Request,
  shop: string,
  host: string,
  appOrigin: string,
  params: Record<string, string>,
) {
  return redirect(
    buildGoogleOAuthReturnUrl({ shop, host, appOrigin, query: params, request }),
  );
}

function oauthStateErrorResponse(): Response {
  return new Response(
    "Google OAuth state 无效或已过期。请关闭此页，从 Shopify 后台重新打开应用后再试。",
    { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } },
  );
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const incoming = new URL(request.url);
  const state = incoming.searchParams.get("state") ?? "";
  const code = incoming.searchParams.get("code");
  const oauthError = incoming.searchParams.get("error");

  const verified = verifyOAuthState(state);
  if (!verified || verified.flow !== "ads") {
    return oauthStateErrorResponse();
  }
  const { shop, host, appOrigin } = verified;

  if (oauthError) return appRedirect(request, shop, host, appOrigin, { adsAuth: "cancelled" });
  if (!code) {
    return appRedirect(request, shop, host, appOrigin, {
      adsAuth: "error",
      reason: "Google 未返回授权 code",
    });
  }

  const developerToken = getGoogleAdsDeveloperToken();
  if (!developerToken) {
    return appRedirect(request, shop, host, appOrigin, {
      adsAuth: "error",
      reason: "缺少 GOOGLE_ADS_DEVELOPER_TOKEN 环境变量",
    });
  }

  try {
    const tokens = await exchangeCodeForTokens(
      code,
      getRedirectUri(CALLBACK_PATH, incoming.origin),
    );
    const customers = await getAdsCustomers(tokens.accessToken, developerToken);
    const { clientId, clientSecret } = getGoogleOAuthClient();

    if (customers.length === 0) {
      return appRedirect(request, shop, host, appOrigin, {
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
      return appRedirect(request, shop, host, appOrigin, {
        adsAuth: "success",
        customerId: customers[0].formatted,
      });
    }

    await setGoogleAdsPending(shop, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      clientId,
      clientSecret,
      accounts: customers.map((c) => ({ id: c.customerId, formatted: c.formatted })),
    });
    return appRedirect(request, shop, host, appOrigin, { adsAuth: "select" });
  } catch (e) {
    return appRedirect(request, shop, host, appOrigin, {
      adsAuth: "error",
      reason: e instanceof Error ? e.message : "Google Ads 授权失败",
    });
  }
};
