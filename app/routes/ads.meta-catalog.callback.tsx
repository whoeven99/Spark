import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import {
  META_CATALOG_CALLBACK_PATH,
  buildMetaOAuthReturnUrl,
  exchangeForLongLivedMetaToken,
  exchangeMetaCodeForToken,
  getMetaCatalogs,
  getMetaRedirectUri,
  resolveMetaOAuthClient,
  verifyMetaOAuthState,
} from "../server/adsCatalog/metaOAuth.server";
import {
  clearMetaCatalogPending,
  setFacebookCatalogCredential,
  setMetaCatalogPending,
} from "../server/adsCatalog/credentialStore.server";

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

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const incoming = new URL(request.url);
  const state = incoming.searchParams.get("state") ?? "";
  const code = incoming.searchParams.get("code");
  const oauthError = incoming.searchParams.get("error_reason") || incoming.searchParams.get("error");

  const verified = verifyMetaOAuthState(state);
  if (!verified) {
    return oauthStateErrorResponse();
  }
  const { shop, host, appOrigin } = verified;

  if (oauthError) {
    return appRedirect(request, shop, host, appOrigin, { metaAuth: "cancelled" });
  }
  if (!code) {
    return appRedirect(request, shop, host, appOrigin, {
      metaAuth: "error",
      reason: "Meta 未返回授权 code",
    });
  }

  try {
    const client = await resolveMetaOAuthClient(shop);
    if (!client) {
      return appRedirect(request, shop, host, appOrigin, {
        metaAuth: "error",
        reason: "缺少 Meta App 凭证（META_APP_ID / META_APP_SECRET）",
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
      return appRedirect(request, shop, host, appOrigin, {
        metaAuth: "error",
        reason: "该 Meta 账号未关联任何商品 Catalog，请先在 Meta Commerce/Business 中创建",
      });
    }

    if (catalogs.length === 1) {
      await clearMetaCatalogPending(shop);
      await setFacebookCatalogCredential(shop, {
        accessToken,
        catalogId: catalogs[0].catalogId,
        businessId: catalogs[0].businessId,
      });
      return appRedirect(request, shop, host, appOrigin, {
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
    return appRedirect(request, shop, host, appOrigin, { metaAuth: "select" });
  } catch (e) {
    return appRedirect(request, shop, host, appOrigin, {
      metaAuth: "error",
      reason: e instanceof Error ? e.message : "Meta 授权失败",
    });
  }
};
