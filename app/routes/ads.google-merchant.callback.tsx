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

const CALLBACK_PATH = "/ads/google-merchant/callback";

function appRedirect(shop: string, host: string, params: Record<string, string>) {
  return redirect(buildGoogleOAuthReturnUrl({ shop, host, query: params }));
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const incoming = new URL(request.url);
  const state = incoming.searchParams.get("state") ?? "";
  const code = incoming.searchParams.get("code");
  const oauthError = incoming.searchParams.get("error");

  const verified = verifyOAuthState(state);
  if (!verified || verified.flow !== "gmc") {
    return redirect("/auth/login");
  }
  const { shop, host } = verified;

  if (oauthError) {
    return appRedirect(shop, host, { gmcAuth: "cancelled" });
  }
  if (!code) {
    return appRedirect(shop, host, { gmcAuth: "error", reason: "Google 未返回授权 code" });
  }

  try {
    const tokens = await exchangeCodeForTokens(code, getRedirectUri(CALLBACK_PATH));
    const accounts = await getGmcMerchantAccounts(tokens.accessToken);
    const { clientId, clientSecret } = getGoogleOAuthClient();

    if (accounts.length === 0) {
      return appRedirect(shop, host, {
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
      return appRedirect(shop, host, { gmcAuth: "success", merchantId: accounts[0].merchantId });
    }

    // Multiple accounts → stash tokens and let the UI prompt for selection.
    await setGoogleMerchantPending(shop, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      clientId,
      clientSecret,
      accounts: accounts.map((a) => ({ id: a.merchantId, name: a.name })),
    });
    return appRedirect(shop, host, { gmcAuth: "select" });
  } catch (e) {
    return appRedirect(shop, host, {
      gmcAuth: "error",
      reason: e instanceof Error ? e.message : "GMC 授权失败",
    });
  }
};
