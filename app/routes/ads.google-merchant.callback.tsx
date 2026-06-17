import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import {
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
  if (!verified || verified.flow !== "gmc") {
    return appRedirect("", { gmcAuth: "error", reason: "state 校验失败或已过期" });
  }
  const { shop, host } = verified;

  if (oauthError) {
    return appRedirect(host, { gmcAuth: "cancelled" });
  }
  if (!code) {
    return appRedirect(host, { gmcAuth: "error", reason: "Google 未返回授权 code" });
  }

  try {
    const tokens = await exchangeCodeForTokens(code, getRedirectUri(CALLBACK_PATH));
    const accounts = await getGmcMerchantAccounts(tokens.accessToken);
    const { clientId, clientSecret } = getGoogleOAuthClient();

    if (accounts.length === 0) {
      return appRedirect(host, {
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
      return appRedirect(host, { gmcAuth: "success", merchantId: accounts[0].merchantId });
    }

    // Multiple accounts → stash tokens and let the UI prompt for selection.
    await setGoogleMerchantPending(shop, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      clientId,
      clientSecret,
      accounts: accounts.map((a) => ({ id: a.merchantId, name: a.name })),
    });
    return appRedirect(host, { gmcAuth: "select" });
  } catch (e) {
    return appRedirect(host, {
      gmcAuth: "error",
      reason: e instanceof Error ? e.message : "GMC 授权失败",
    });
  }
};
