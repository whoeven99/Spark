import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import {
  META_ADS_CALLBACK_PATH,
  buildMetaAdsOAuthReturnUrl,
  exchangeForLongLivedMetaToken,
  exchangeMetaCodeForToken,
  getMetaAdAccounts,
  getMetaRedirectUri,
  resolveMetaOAuthClient,
  verifyMetaOAuthState,
} from "../server/adsCatalog/metaOAuth.server";
import {
  clearMetaAdsPending,
  setMetaAdsCredential,
  setMetaAdsPending,
} from "../server/adsCatalog/credentialStore.server";

function appRedirect(
  request: Request,
  shop: string,
  host: string,
  appOrigin: string,
  params: Record<string, string>,
) {
  return redirect(
    buildMetaAdsOAuthReturnUrl({ shop, host, appOrigin, query: params, request }),
  );
}

function oauthStateErrorResponse(): Response {
  return new Response(
    "Meta Ads OAuth state 无效或已过期。请关闭此页，从 Shopify 后台重新打开应用后再试。",
    { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } },
  );
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const incoming = new URL(request.url);
  const state = incoming.searchParams.get("state") ?? "";
  const code = incoming.searchParams.get("code");
  const oauthError =
    incoming.searchParams.get("error_reason") || incoming.searchParams.get("error");

  const verified = verifyMetaOAuthState(state, 15 * 60 * 1000, "meta_ads");
  if (!verified) {
    return oauthStateErrorResponse();
  }
  const { shop, host, appOrigin } = verified;

  if (oauthError) {
    return appRedirect(request, shop, host, appOrigin, { metaAdsAuth: "cancelled" });
  }
  if (!code) {
    return appRedirect(request, shop, host, appOrigin, {
      metaAdsAuth: "error",
      reason: "Meta 未返回授权 code",
    });
  }

  try {
    const client = resolveMetaOAuthClient();
    if (!client) {
      return appRedirect(request, shop, host, appOrigin, {
        metaAdsAuth: "error",
        reason: "缺少 Meta App 凭证（META_APP_ID / META_APP_SECRET）",
      });
    }

    const shortToken = await exchangeMetaCodeForToken({
      code,
      redirectUri: getMetaRedirectUri(META_ADS_CALLBACK_PATH, incoming.origin),
      client,
    });
    const accessToken = await exchangeForLongLivedMetaToken({ shortToken, client });
    const accounts = await getMetaAdAccounts(accessToken);

    if (accounts.length === 0) {
      return appRedirect(request, shop, host, appOrigin, {
        metaAdsAuth: "error",
        reason: "该 Meta 账号未关联任何广告账户，请先在 Meta Business 中创建或获得访问权限",
      });
    }

    if (accounts.length === 1) {
      await clearMetaAdsPending(shop);
      await setMetaAdsCredential(shop, {
        accessToken,
        adAccountId: accounts[0].adAccountId,
        adAccountName: accounts[0].name,
        currencyCode: accounts[0].currencyCode,
      });
      return appRedirect(request, shop, host, appOrigin, {
        metaAdsAuth: "success",
        adAccountId: accounts[0].adAccountId,
      });
    }

    await setMetaAdsPending(shop, {
      accessToken,
      accounts: accounts.map((a) => ({
        id: a.adAccountId,
        name: a.name,
        formatted: a.currencyCode,
      })),
    });
    return appRedirect(request, shop, host, appOrigin, { metaAdsAuth: "select" });
  } catch (e) {
    return appRedirect(request, shop, host, appOrigin, {
      metaAdsAuth: "error",
      reason: e instanceof Error ? e.message : "Meta Ads 授权失败",
    });
  }
};
