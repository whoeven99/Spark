import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import {
  TIKTOK_CATALOG_CALLBACK_PATH,
  buildTiktokOAuthReturnUrl,
  exchangeTiktokAuthCode,
  getTiktokCatalogsForAdvertisers,
  getTiktokRedirectUri,
  listAccessibleBcIds,
  verifyTiktokOAuthState,
} from "../server/adsCatalog/tiktokOAuth.server";
import {
  clearTiktokCatalogPending,
  setTiktokCatalogCredential,
  setTiktokCatalogPending,
} from "../server/adsCatalog/credentialStore.server";

function appRedirect(
  request: Request,
  shop: string,
  host: string,
  appOrigin: string,
  params: Record<string, string>,
) {
  return redirect(
    buildTiktokOAuthReturnUrl({ shop, host, appOrigin, query: params, request }),
  );
}

function oauthStateErrorResponse(): Response {
  return new Response(
    "TikTok OAuth state 无效或已过期。请关闭此页，从 Shopify 后台重新打开应用后再试。",
    { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } },
  );
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const incoming = new URL(request.url);
  const state = incoming.searchParams.get("state") ?? "";
  const authCode = incoming.searchParams.get("auth_code");
  const oauthError = incoming.searchParams.get("error");

  const verified = verifyTiktokOAuthState(state);
  if (!verified) {
    return oauthStateErrorResponse();
  }
  const { shop, host, appOrigin } = verified;

  if (oauthError) {
    return appRedirect(request, shop, host, appOrigin, { tiktokAuth: "cancelled" });
  }
  if (!authCode) {
    return appRedirect(request, shop, host, appOrigin, {
      tiktokAuth: "error",
      reason: "TikTok 未返回授权 code",
    });
  }

  try {
    const { accessToken, refreshToken, advertiserIds } = await exchangeTiktokAuthCode({
      authCode,
      redirectUri: getTiktokRedirectUri(TIKTOK_CATALOG_CALLBACK_PATH, incoming.origin),
    });

    if (advertiserIds.length === 0) {
      return appRedirect(request, shop, host, appOrigin, {
        tiktokAuth: "error",
        reason: "该 TikTok 账号未关联任何广告主账户，请先在 TikTok for Business 中创建",
      });
    }

    const catalogs = await getTiktokCatalogsForAdvertisers({
      accessToken,
      advertiserIds,
    });

    if (catalogs.length === 0) {
      const bcIds = await listAccessibleBcIds({ accessToken });
      await setTiktokCatalogPending(shop, {
        accessToken,
        refreshToken,
        advertiserId: advertiserIds[0],
        bcId: bcIds[0],
        accounts: [],
      });
      return appRedirect(request, shop, host, appOrigin, { tiktokAuth: "authorized" });
    }

    if (catalogs.length === 1) {
      await clearTiktokCatalogPending(shop);
      await setTiktokCatalogCredential(shop, {
        accessToken,
        refreshToken,
        advertiserId: catalogs[0].advertiserId,
        bcId: catalogs[0].bcId,
        catalogId: catalogs[0].catalogId,
        catalogName: catalogs[0].catalogName,
      });
      return appRedirect(request, shop, host, appOrigin, {
        tiktokAuth: "success",
        catalogId: catalogs[0].catalogId,
      });
    }

    await setTiktokCatalogPending(shop, {
      accessToken,
      refreshToken,
      accounts: catalogs.map((c) => ({
        id: c.catalogId,
        name: c.catalogName,
        businessId: c.bcId,
        advertiserId: c.advertiserId,
      })),
    });
    return appRedirect(request, shop, host, appOrigin, { tiktokAuth: "select" });
  } catch (e) {
    return appRedirect(request, shop, host, appOrigin, {
      tiktokAuth: "error",
      reason: e instanceof Error ? e.message : "TikTok 授权失败",
    });
  }
};
