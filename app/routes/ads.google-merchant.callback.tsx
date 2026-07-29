import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import {
  buildGoogleOAuthReturnUrl,
  buildOAuthPopupCloseHtml,
  exchangeCodeForTokens,
  getGmcMerchantAccounts,
  getGoogleOAuthClient,
  getRedirectUri,
  verifyOAuthState,
  type MerchantAccount,
  type OAuthTokens,
} from "../server/adsCatalog/googleOAuth.server";
import {
  setGoogleMerchantCredential,
  setGoogleMerchantPending,
  clearGoogleMerchantPending,
  getGoogleMerchantCredential,
  deleteGoogleMerchantCredential,
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

function popupClose(params: Record<string, string>): Response {
  return new Response(buildOAuthPopupCloseHtml("gmc_oauth", params), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function buildGmcPendingPayload(
  tokens: OAuthTokens,
  accounts: MerchantAccount[],
  clientId: string,
  clientSecret: string,
) {
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    clientId,
    clientSecret,
    accounts: accounts.map((a) => ({ id: a.merchantId, name: a.name })),
  };
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
  const { shop, host, appOrigin, popup } = verified;

  const respond = (params: Record<string, string>): Response =>
    popup
      ? popupClose(params)
      : appRedirect(request, shop, host, appOrigin, params);

  if (oauthError) {
    return respond({ gmcAuth: "cancelled" });
  }
  if (!code) {
    return respond({
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
      return respond({
        gmcAuth: "error",
        reason: "该 Google 账号未关联任何 Merchant Center 账户",
      });
    }

    const existing = await getGoogleMerchantCredential(shop);
    const requiresSelection = accounts.length > 1 || (accounts.length === 1 && Boolean(existing));

    if (!requiresSelection && accounts.length === 1) {
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
      return respond({
        gmcAuth: "success",
        merchantId: accounts[0].merchantId,
      });
    }

    await deleteGoogleMerchantCredential(shop);
    await clearGoogleMerchantPending(shop);
    await setGoogleMerchantPending(shop, buildGmcPendingPayload(tokens, accounts, clientId, clientSecret));
    return respond({ gmcAuth: "select" });
  } catch (e) {
    return respond({
      gmcAuth: "error",
      reason: e instanceof Error ? e.message : "GMC 授权失败",
    });
  }
};
