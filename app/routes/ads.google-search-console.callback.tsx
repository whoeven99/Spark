import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import {
  buildGscOAuthReturnUrl,
  exchangeCodeForTokens,
  getGoogleOAuthClient,
  getRedirectUri,
  verifyOAuthState,
} from "../server/adsCatalog/googleOAuth.server";
import { listGscSites } from "../server/googleSearchConsole/gscApi.server";
import {
  clearGscPending,
  deleteGscCredential,
  setGscCredential,
  setGscPending,
} from "../server/googleSearchConsole/gscCredentials.server";

const CALLBACK_PATH = "/ads/google-search-console/callback";

function appRedirect(
  request: Request,
  shop: string,
  host: string,
  appOrigin: string,
  params: Record<string, string>,
): Response {
  return redirect(buildGscOAuthReturnUrl({ shop, host, appOrigin, query: params, request }));
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
  if (!verified || verified.flow !== "gsc") {
    return oauthStateErrorResponse();
  }
  const { shop, host, appOrigin } = verified;

  if (oauthError) {
    return appRedirect(request, shop, host, appOrigin, { gscAuth: "cancelled" });
  }
  if (!code) {
    return appRedirect(request, shop, host, appOrigin, {
      gscAuth: "error",
      reason: "Google 未返回授权 code",
    });
  }

  try {
    const tokens = await exchangeCodeForTokens(
      code,
      getRedirectUri(CALLBACK_PATH, incoming.origin),
    );
    const sites = await listGscSites(tokens.accessToken);
    const { clientId, clientSecret } = getGoogleOAuthClient();

    if (sites.length === 0) {
      return appRedirect(request, shop, host, appOrigin, {
        gscAuth: "error",
        errorCode: "no_verified_sites",
      });
    }

    if (sites.length === 1) {
      await clearGscPending(shop);
      await setGscCredential(shop, {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        clientId,
        clientSecret,
        siteUrl: sites[0].siteUrl,
      });
      return appRedirect(request, shop, host, appOrigin, {
        gscAuth: "success",
        siteUrl: sites[0].siteUrl,
      });
    }

    // 多站点：存 pending，让用户在设置页选择
    await deleteGscCredential(shop);
    await clearGscPending(shop);
    await setGscPending(shop, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      clientId,
      clientSecret,
      sites,
    });
    return appRedirect(request, shop, host, appOrigin, { gscAuth: "select" });
  } catch (e) {
    return appRedirect(request, shop, host, appOrigin, {
      gscAuth: "error",
      reason: e instanceof Error ? e.message : "Google Search Console 授权失败",
    });
  }
};
