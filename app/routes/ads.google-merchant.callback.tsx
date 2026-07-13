import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import {
  buildGoogleOAuthReturnUrl,
  exchangeCodeForTokens,
  getGmcMerchantAccounts,
  getGoogleOAuthClient,
  getRedirectUri,
  verifyOAuthState,
} from "../server/adsCatalog/googleOAuth.server";
import {
  setGoogleMerchantCredential,
  setGoogleMerchantPending,
  clearGoogleMerchantPending,
} from "../server/adsCatalog/credentialStore.server";
import { registerGmcNotificationSubscription } from "../server/adsCatalog/gmcNotifications.server";

const CALLBACK_PATH = "/ads/google-merchant/callback";

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
  if (!verified || verified.flow !== "gmc") {
    return oauthStateErrorResponse();
  }
  const { shop, host, appOrigin } = verified;

  if (oauthError) {
    return appRedirect(request, shop, host, appOrigin, { gmcAuth: "cancelled" });
  }
  if (!code) {
    return appRedirect(request, shop, host, appOrigin, {
      gmcAuth: "error",
      reason: "Google 未返回授权 code",
    });
  }

  try {
    const tokens = await exchangeCodeForTokens(
      code,
      getRedirectUri(CALLBACK_PATH, incoming.origin),
    );
    const accounts = await getGmcMerchantAccounts(tokens.accessToken);
    const { clientId, clientSecret } = getGoogleOAuthClient();

    if (accounts.length === 0) {
      return appRedirect(request, shop, host, appOrigin, {
        gmcAuth: "error",
        reason: "该 Google 账号未关联任何 Merchant Center 账户",
      });
    }

    if (accounts.length === 1) {
      await clearGoogleMerchantPending(shop);
      await setGoogleMerchantCredential(shop, {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        clientId,
        clientSecret,
        merchantId: accounts[0].merchantId,
      });
      // Best-effort: register Merchant Notifications subscription (non-blocking)
      void registerGmcNotificationSubscription({
        shop,
        merchantId: accounts[0].merchantId,
        accessToken: tokens.accessToken,
      }).catch(() => undefined);
      return appRedirect(request, shop, host, appOrigin, {
        gmcAuth: "success",
        merchantId: accounts[0].merchantId,
      });
    }

    await setGoogleMerchantPending(shop, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      clientId,
      clientSecret,
      accounts: accounts.map((a) => ({ id: a.merchantId, name: a.name })),
    });
    return appRedirect(request, shop, host, appOrigin, { gmcAuth: "select" });
  } catch (e) {
    return appRedirect(request, shop, host, appOrigin, {
      gmcAuth: "error",
      reason: e instanceof Error ? e.message : "GMC 授权失败",
    });
  }
};
