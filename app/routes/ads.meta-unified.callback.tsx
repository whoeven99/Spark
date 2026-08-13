import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import {
  buildMetaUnifiedOAuthReturnUrl,
  exchangeMetaCodeForToken,
  getMetaAdAccounts,
  getMetaRedirectUri,
  getMetaCatalogs,
  META_UNIFIED_CALLBACK_PATH,
  resolveMetaOAuthClient,
  verifyMetaOAuthState,
} from "../server/adsCatalog/metaOAuth.server";
import {
  clearMetaCapiPending,
  getFacebookCatalogCredential,
  getMetaAdsCredential,
  setMetaAdsCredential,
  setFacebookCatalogCredential,
  type PendingOAuthAccount,
} from "../server/adsCatalog/credentialStore.server";
import { persistMetaCapiBisuOnboarding } from "../server/adsCatalog/metaCapiOnboarding.server";
import { logFullMetaCapiAccessToken } from "../server/adsCatalog/metaCapiLog.server";
import { buildOAuthPopupCloseHtml } from "../server/adsCatalog/googleOAuth.server";

function popupClose(params: Record<string, string>): Response {
  return new Response(buildOAuthPopupCloseHtml("meta_unified_oauth", params), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const incoming = new URL(request.url);
  const state = incoming.searchParams.get("state") ?? "";
  const code = incoming.searchParams.get("code");
  const oauthError = incoming.searchParams.get("error_reason") || incoming.searchParams.get("error");
  const verified = verifyMetaOAuthState(state, 15 * 60 * 1000, "meta_unified");
  if (!verified) {
    return new Response("Meta unified OAuth state 无效或已过期", { status: 400 });
  }
  const { shop, host, appOrigin, popup } = verified;
  const respond = (params: Record<string, string>) =>
    popup
      ? popupClose(params)
      : redirect(buildMetaUnifiedOAuthReturnUrl({ shop, host, appOrigin, query: params, request }));

  if (oauthError) return respond({ metaUnifiedAuth: "cancelled" });
  if (!code) return respond({ metaUnifiedAuth: "error", reason: "Meta 未返回授权 code" });

  try {
    const client = resolveMetaOAuthClient();
    if (!client) throw new Error("缺少 Meta App 凭证");
    const token = await exchangeMetaCodeForToken({
      code,
      redirectUri: getMetaRedirectUri(META_UNIFIED_CALLBACK_PATH, incoming.origin),
      client,
    });
    logFullMetaCapiAccessToken({ token, source: "unified_business_login", shop });

    const existingCatalog = await getFacebookCatalogCredential(shop);
    const catalogs = await getMetaCatalogs(token);
    const selectedCatalog =
      catalogs.find((catalog) => catalog.catalogId === existingCatalog?.catalogId) ??
      (catalogs.length === 1 ? catalogs[0] : null);
    if (!selectedCatalog?.catalogId) {
      throw new Error(
        catalogs.length > 1
          ? "统一授权发现多个 Catalog，请先保留现有 Catalog 或补充资产选择流程"
          : "统一授权账号没有可访问的 Meta Catalog",
      );
    }

    await setFacebookCatalogCredential(shop, {
      accessToken: token,
      catalogId: selectedCatalog.catalogId,
      businessId: selectedCatalog.businessId ?? existingCatalog?.businessId,
      apiVersion: existingCatalog?.apiVersion,
      pixelId: existingCatalog?.pixelId,
      testEventCode: existingCatalog?.testEventCode,
      enabledEvents: existingCatalog?.enabledEvents,
      capiEnabled: existingCatalog?.capiEnabled ?? true,
    });

    const catalog = await getFacebookCatalogCredential(shop);
    if (!catalog) throw new Error("统一授权后无法读取 Meta Catalog 凭证");
    const capiResult = await persistMetaCapiBisuOnboarding({
      shop,
      capiAccessToken: token,
      businessId: selectedCatalog.businessId ?? catalog.businessId,
      apiVersion: catalog.apiVersion,
      pixelId: catalog.pixelId,
    });
    if (capiResult.status !== "saved") {
      throw new Error(`统一授权发现 ${capiResult.pixels.length} 个 Pixel，请先保留一个已绑定 Pixel`);
    }
    await clearMetaCapiPending(shop);

    const existingAds = await getMetaAdsCredential(shop);
    let adAccounts: Awaited<ReturnType<typeof getMetaAdAccounts>> = [];
    try {
      adAccounts = await getMetaAdAccounts(token);
    } catch (e) {
      console.warn(
        `[AdsCatalog][MetaUnified] step=ads_query_failed shop=${shop} err=${e instanceof Error ? e.message : String(e)}`,
      );
    }
    const selectedAds =
      adAccounts.find((account) => account.adAccountId === existingAds?.adAccountId) ??
      (adAccounts.length === 1 ? adAccounts[0] : null);
    if (selectedAds) {
      const availableAccounts: PendingOAuthAccount[] = adAccounts.map((account) => ({
        id: account.adAccountId,
        name: account.name,
        formatted: account.currencyCode,
      }));
      await setMetaAdsCredential(shop, {
        accessToken: token,
        adAccountId: selectedAds.adAccountId,
        adAccountName: selectedAds.name,
        currencyCode: selectedAds.currencyCode,
        availableAccounts,
      });
    } else {
      console.info(
        `[AdsCatalog][MetaUnified] step=ads_not_bound shop=${shop} accountCount=${adAccounts.length}`,
      );
    }

    console.info(
      `[AdsCatalog][MetaUnified] step=success shop=${shop} catalogId=${selectedCatalog.catalogId} pixelId=${capiResult.pixelId} adsBound=${Boolean(selectedAds)}`,
    );
    return respond({ metaUnifiedAuth: "success", pixelId: capiResult.pixelId });
  } catch (e) {
    console.error(
      `[AdsCatalog][MetaUnified] step=failed shop=${shop} err=${e instanceof Error ? e.message : String(e)}`,
    );
    return respond({
      metaUnifiedAuth: "error",
      reason: e instanceof Error ? e.message : "Meta 统一授权失败",
    });
  }
};
