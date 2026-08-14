import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import {
  META_CAPI_CALLBACK_PATH,
  buildMetaCapiOAuthReturnUrl,
  exchangeMetaCodeForToken,
  getMetaRedirectUri,
  resolveMetaOAuthClient,
  verifyMetaOAuthState,
} from "../server/adsCatalog/metaOAuth.server";
import {
  clearMetaCapiPending,
  getFacebookCatalogCredential,
  setMetaCapiPending,
} from "../server/adsCatalog/credentialStore.server";
import {
  fetchMetaBisuClientBusinessId,
  persistMetaCapiBisuOnboarding,
} from "../server/adsCatalog/metaCapiOnboarding.server";
import { logFullMetaCapiAccessToken } from "../server/adsCatalog/metaCapiLog.server";
import { buildOAuthPopupCloseHtml } from "../server/adsCatalog/googleOAuth.server";

function appRedirect(
  request: Request,
  shop: string,
  host: string,
  appOrigin: string,
  params: Record<string, string>,
) {
  return redirect(
    buildMetaCapiOAuthReturnUrl({ shop, host, appOrigin, query: params, request }),
  );
}

function oauthStateErrorResponse(): Response {
  return new Response(
    "Meta CAPI OAuth state 无效或已过期。请关闭此页，从 Shopify 后台重新打开应用后再试。",
    { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } },
  );
}

function popupClose(params: Record<string, string>): Response {
  return new Response(buildOAuthPopupCloseHtml("meta_capi_oauth", params), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const incoming = new URL(request.url);
  const state = incoming.searchParams.get("state") ?? "";
  const code = incoming.searchParams.get("code");
  const oauthError =
    incoming.searchParams.get("error_reason") || incoming.searchParams.get("error");

  const verified = verifyMetaOAuthState(state, 15 * 60 * 1000, "meta_capi");
  if (!verified) {
    return oauthStateErrorResponse();
  }
  const { shop, host, appOrigin, popup } = verified;

  console.info(
    `[AdsCatalog][MetaCapiCallback] step=start shop=${shop} popup=${popup} hasCode=${Boolean(code)} hasOAuthError=${Boolean(oauthError)}`,
  );

  const respond = (params: Record<string, string>): Response =>
    popup
      ? popupClose(params)
      : appRedirect(request, shop, host, appOrigin, params);

  if (oauthError) {
    return respond({ metaCapiAuth: "cancelled" });
  }
  if (!code) {
    return respond({
      metaCapiAuth: "error",
      reason: "Meta 未返回授权 code",
    });
  }

  try {
    const client = resolveMetaOAuthClient();
    if (!client) {
      return respond({
        metaCapiAuth: "error",
        reason: "缺少 Meta App 凭证（META_APP_ID / META_APP_SECRET）",
      });
    }

    const catalog = await getFacebookCatalogCredential(shop);
    if (!catalog) {
      console.error(
        `[AdsCatalog][MetaCapiCallback] step=catalog_missing shop=${shop}`,
      );
      return respond({
        metaCapiAuth: "error",
        reason: "请先连接 Meta Catalog，再授权 Conversions API",
      });
    }

    const capiAccessToken = await exchangeMetaCodeForToken({
      code,
      redirectUri: getMetaRedirectUri(META_CAPI_CALLBACK_PATH, incoming.origin),
      client,
    });
    console.info(
      `[AdsCatalog][MetaCapiCallback] step=token_exchange_success shop=${shop} tokenLen=${capiAccessToken.trim().length}`,
    );
    logFullMetaCapiAccessToken({
      token: capiAccessToken,
      source: "bisu_oauth_code_exchange",
      shop,
    });

    let businessId = catalog.businessId?.trim() ?? "";
    if (businessId) {
      console.info(
        `[AdsCatalog][MetaCapiCallback] step=business_id_reused source=catalog_credential shop=${shop} businessId=${businessId}`,
      );
    } else {
      try {
        businessId = await fetchMetaBisuClientBusinessId({
          accessToken: capiAccessToken,
          apiVersion: catalog.apiVersion,
        });
        console.info(
          `[AdsCatalog][MetaCapiCallback] step=business_id_success source=business_login shop=${shop} businessId=${businessId}`,
        );
      } catch (e) {
        console.error(
          `[AdsCatalog][MetaCapiCallback] step=business_id_failed shop=${shop} err=${e instanceof Error ? e.message : String(e)}`,
        );
        return respond({
          metaCapiAuth: "error",
          reason:
            e instanceof Error
              ? e.message
              : "无法解析 Business Integration Token，请确认 Meta Configuration 类型正确",
        });
      }
    }

    let result: Awaited<ReturnType<typeof persistMetaCapiBisuOnboarding>>;
    try {
      result = await persistMetaCapiBisuOnboarding({
        shop,
        capiAccessToken,
        businessId,
        apiVersion: catalog.apiVersion,
      });
      console.info(
        `[AdsCatalog][MetaCapiCallback] step=persist_result shop=${shop} status=${result.status} pixelId=${result.status === "saved" ? result.pixelId : ""} pixelCount=${result.status === "select" ? result.pixels.length : 0}`,
      );
    } catch (e) {
      console.error(
        `[AdsCatalog][MetaCapiCallback] step=persist_failed shop=${shop} businessId=${businessId} err=${e instanceof Error ? e.message : String(e)}`,
      );
      throw e;
    }

    if (result.status === "saved") {
      await clearMetaCapiPending(shop);
      return respond({
        metaCapiAuth: "success",
        pixelId: result.pixelId,
        businessId: result.businessId,
      });
    }

    await setMetaCapiPending(shop, {
      accessToken: capiAccessToken,
      accounts: result.pixels.map((pixel) => ({
        id: pixel.pixelId,
        name: pixel.pixelName,
        businessId: result.businessId,
      })),
    });
    return respond({ metaCapiAuth: "select" });
  } catch (e) {
    console.error(
      `[AdsCatalog][MetaCapiCallback] step=failed shop=${shop} err=${e instanceof Error ? e.message : String(e)}`,
    );
    return respond({
      metaCapiAuth: "error",
      reason: e instanceof Error ? e.message : "Meta CAPI 授权失败",
    });
  }
};
