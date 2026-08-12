import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import {
  META_CATALOG_CALLBACK_PATH,
  buildMetaOAuthReturnUrl,
  exchangeForLongLivedMetaToken,
  exchangeMetaCodeForToken,
  getMetaCatalogs,
  getMetaRedirectUri,
  logMetaOAuthCancelled,
  logMetaOAuthError,
  resolveMetaOAuthClient,
  verifyMetaOAuthState,
} from "../server/adsCatalog/metaOAuth.server";
import {
  clearMetaCatalogPending,
  setFacebookCatalogCredential,
  setMetaCatalogPending,
} from "../server/adsCatalog/credentialStore.server";
import { buildOAuthPopupCloseHtml } from "../server/adsCatalog/googleOAuth.server";

function appRedirect(
  request: Request,
  shop: string,
  host: string,
  appOrigin: string,
  params: Record<string, string>,
) {
  return redirect(
    buildMetaOAuthReturnUrl({ shop, host, appOrigin, query: params, request }),
  );
}

function oauthStateErrorResponse(): Response {
  return new Response(
    "Meta OAuth state 无效或已过期。请关闭此页，从 Shopify 后台重新打开应用后再试。",
    { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } },
  );
}

function popupClose(params: Record<string, string>): Response {
  return new Response(buildOAuthPopupCloseHtml("meta_catalog_oauth", params), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const incoming = new URL(request.url);
  const state = incoming.searchParams.get("state") ?? "";
  const code = incoming.searchParams.get("code");
  const oauthError = incoming.searchParams.get("error_reason") || incoming.searchParams.get("error");

  const verified = verifyMetaOAuthState(state, 15 * 60 * 1000, "meta_catalog");
  if (!verified) {
    logMetaOAuthError({
      flow: "meta_catalog",
      step: "invalid_state",
      error: "Meta OAuth state 无效或已过期",
    });
    return oauthStateErrorResponse();
  }
  const { shop, host, appOrigin, popup } = verified;

  const respond = (params: Record<string, string>): Response =>
    popup
      ? popupClose(params)
      : appRedirect(request, shop, host, appOrigin, params);

  if (oauthError) {
    logMetaOAuthCancelled({ flow: "meta_catalog", shop, oauthError });
    return respond({ metaAuth: "cancelled" });
  }
  if (!code) {
    const reason = "Meta 未返回授权 code";
    logMetaOAuthError({ flow: "meta_catalog", shop, step: "missing_code", error: reason });
    return respond({
      metaAuth: "error",
      reason,
    });
  }

  try {
    const client = resolveMetaOAuthClient();
    if (!client) {
      const reason = "缺少 Meta App 凭证（META_APP_ID / META_APP_SECRET）";
      logMetaOAuthError({ flow: "meta_catalog", shop, step: "missing_client", error: reason });
      return respond({
        metaAuth: "error",
        reason,
      });
    }

    const shortToken = await exchangeMetaCodeForToken({
      code,
      redirectUri: getMetaRedirectUri(META_CATALOG_CALLBACK_PATH, incoming.origin),
      client,
    });
    const accessToken = await exchangeForLongLivedMetaToken({ shortToken, client });

    const catalogs = await getMetaCatalogs(accessToken);

    if (catalogs.length === 0) {
      const reason = "该 Meta 账号未关联任何商品 Catalog，请先在 Meta Commerce/Business 中创建";
      logMetaOAuthError({ flow: "meta_catalog", shop, step: "no_catalogs", error: reason });
      return respond({
        metaAuth: "error",
        reason,
      });
    }

    if (catalogs.length === 1) {
      await clearMetaCatalogPending(shop);
      await setFacebookCatalogCredential(shop, {
        accessToken,
        catalogId: catalogs[0].catalogId,
        businessId: catalogs[0].businessId,
      });
      return respond({
        metaAuth: "success",
        catalogId: catalogs[0].catalogId,
      });
    }

    await setMetaCatalogPending(shop, {
      accessToken,
      accounts: catalogs.map((c) => ({
        id: c.catalogId,
        name: c.name,
        businessId: c.businessId,
      })),
    });
    return respond({ metaAuth: "select" });
  } catch (e) {
    logMetaOAuthError({ flow: "meta_catalog", shop, step: "callback", error: e });
    return respond({
      metaAuth: "error",
      reason: e instanceof Error ? e.message : "Meta 授权失败",
    });
  }
};
