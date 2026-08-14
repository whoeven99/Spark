import {
  listMetaAdAccountPixels,
  listMetaBusinessPixels,
  type MetaPixelListItem,
} from "./clients/facebookGraphClient.server";
import {
  getFacebookCatalogCredential,
  setFacebookCatalogCredential,
  type FacebookCatalogCredential,
} from "./credentialStore.server";
import {
  META_GRAPH_BASE,
  resolveMetaCapiLoginConfigId,
  isMetaCapiBisuOnboardingConfigured,
} from "./metaOAuth.server";

export { isMetaCapiBisuOnboardingConfigured, resolveMetaCapiLoginConfigId };

const LOG_PREFIX = "[AdsCatalog][MetaCapiOnboarding]";

export function hasMetaCapiBisuToken(credential: FacebookCatalogCredential): boolean {
  return (
    credential.capiTokenType === "bisu" && Boolean(credential.capiAccessToken?.trim())
  );
}

export async function fetchMetaBisuClientBusinessId(params: {
  accessToken: string;
  apiVersion?: string;
}): Promise<string> {
  const url = new URL(`${META_GRAPH_BASE}/me`);
  url.searchParams.set("fields", "client_business_id,id");
  url.searchParams.set("access_token", params.accessToken.trim());

  console.info(
    `${LOG_PREFIX} step=business_id_request method=GET fields=client_business_id,id apiVersion=${params.apiVersion ?? ""} tokenLen=${params.accessToken.trim().length}`,
  );

  const response = await fetch(url.toString());
  const json = (await response.json().catch(() => ({}))) as {
    id?: string;
    client_business_id?: string;
    error?: { message?: string };
  };
  console.info(
    `${LOG_PREFIX} step=business_id_response http=${response.status} ok=${response.ok} metaUserId=${json.id ?? ""} clientBusinessId=${json.client_business_id ?? ""} error=${json.error?.message ?? ""}`,
  );
  if (!response.ok) {
    throw new Error(json.error?.message || `HTTP ${response.status}`);
  }
  const businessId = json.client_business_id?.trim();
  if (!businessId) {
    throw new Error("Meta 未返回 client_business_id，请确认使用了 Business Integration System User Token");
  }
  return businessId;
}

export async function listMetaPixelsForBisuToken(params: {
  accessToken: string;
  businessId: string;
  apiVersion?: string;
}): Promise<MetaPixelListItem[]> {
  const businessId = params.businessId.trim();
  const accessToken = params.accessToken.trim();
  if (!businessId || !accessToken) {
    throw new Error("businessId and accessToken are required");
  }

  console.info(
    `${LOG_PREFIX} step=pixel_list_start businessId=${businessId} apiVersion=${params.apiVersion ?? ""} tokenLen=${accessToken.length}`,
  );

  const owned = await listMetaBusinessPixels({
    accessToken,
    businessId,
    apiVersion: params.apiVersion,
  });
  if (owned.length > 0) {
    console.info(
      `${LOG_PREFIX} step=pixel_list_success source=owned_pixels pixelCount=${owned.length} pixelIds=${owned.map((pixel) => pixel.pixelId).join(",")}`,
    );
    return owned;
  }

  console.info(
    `${LOG_PREFIX} step=pixel_list_owned_empty fallback=ad_accounts`,
  );

  const adAccountsUrl = new URL(`${META_GRAPH_BASE}/me/adaccounts`);
  adAccountsUrl.searchParams.set("fields", "id");
  adAccountsUrl.searchParams.set("limit", "25");
  adAccountsUrl.searchParams.set("access_token", accessToken);
  const adAccountsResponse = await fetch(adAccountsUrl.toString());
  const adAccountsJson = (await adAccountsResponse.json().catch(() => ({}))) as {
    data?: Array<{ id?: string }>;
    error?: { message?: string };
  };
  if (!adAccountsResponse.ok) {
    console.error(
      `${LOG_PREFIX} step=ad_accounts_failed http=${adAccountsResponse.status} error=${adAccountsJson.error?.message ?? ""}`,
    );
    throw new Error(adAccountsJson.error?.message || `HTTP ${adAccountsResponse.status}`);
  }

  const pixels: MetaPixelListItem[] = [];
  const seen = new Set<string>();
  for (const row of adAccountsJson.data ?? []) {
    const adAccountId = row.id?.trim();
    if (!adAccountId) continue;
    try {
      const accountPixels = await listMetaAdAccountPixels({
        accessToken,
        adAccountId,
        apiVersion: params.apiVersion,
      });
      for (const pixel of accountPixels) {
        if (seen.has(pixel.pixelId)) continue;
        seen.add(pixel.pixelId);
        pixels.push(pixel);
      }
    } catch (e) {
      console.warn(
        `${LOG_PREFIX} step=ad_account_pixels_failed adAccountId=${adAccountId} err=${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
  console.info(
    `${LOG_PREFIX} step=pixel_list_success source=ad_accounts pixelCount=${pixels.length} pixelIds=${pixels.map((pixel) => pixel.pixelId).join(",")}`,
  );
  return pixels;
}

export type PersistMetaCapiBisuResult =
  | { status: "saved"; pixelId: string; businessId: string }
  | { status: "select"; pixels: MetaPixelListItem[]; businessId: string };

/** 将 BISU token 写入 Catalog 凭证；单 Pixel 直接落库，多 Pixel 留给 pending 选择。 */
export async function persistMetaCapiBisuOnboarding(params: {
  shop: string;
  capiAccessToken: string;
  businessId?: string;
  apiVersion?: string;
  pixelId?: string;
}): Promise<PersistMetaCapiBisuResult> {
  const shop = params.shop.trim().toLowerCase();
  const capiAccessToken = params.capiAccessToken.trim();
  if (!capiAccessToken) {
    throw new Error("CAPI access token is required");
  }

  console.info(
    `${LOG_PREFIX} step=persist_start shop=${shop} businessId=${params.businessId?.trim() ?? ""} requestedPixelId=${params.pixelId?.trim() ?? ""} tokenLen=${capiAccessToken.length}`,
  );

  const catalog = await getFacebookCatalogCredential(shop);
  if (!catalog) {
    console.error(`${LOG_PREFIX} step=persist_failed shop=${shop} reason=catalog_credential_missing`);
    throw new Error("Meta Catalog 尚未连接，请先完成 Catalog 授权后再连接 CAPI");
  }

  const businessId =
    params.businessId?.trim() ||
    (await fetchMetaBisuClientBusinessId({
      accessToken: capiAccessToken,
      apiVersion: params.apiVersion ?? catalog.apiVersion,
    }));

  console.info(
    `${LOG_PREFIX} step=business_id_ready shop=${shop} businessId=${businessId} catalogPixelId=${catalog.pixelId ?? ""}`,
  );

  const configId = resolveMetaCapiLoginConfigId() ?? undefined;
  const obtainedAt = new Date().toISOString();
  const explicitPixelId = params.pixelId?.trim();

  if (explicitPixelId) {
    await setFacebookCatalogCredential(shop, {
      accessToken: catalog.accessToken,
      catalogId: catalog.catalogId,
      businessId,
      apiVersion: catalog.apiVersion,
      pixelId: explicitPixelId,
      capiAccessToken,
      capiTokenType: "bisu",
      capiConfigId: configId,
      capiTokenObtainedAt: obtainedAt,
      capiEnabled: true,
      testEventCode: catalog.testEventCode,
      enabledEvents: catalog.enabledEvents,
    });
    console.info(
      `${LOG_PREFIX} step=bisu_saved shop=${shop} businessId=${businessId} pixelId=${explicitPixelId}`,
    );
    return { status: "saved", pixelId: explicitPixelId, businessId };
  }

  const pixels = await listMetaPixelsForBisuToken({
    accessToken: capiAccessToken,
    businessId,
    apiVersion: catalog.apiVersion,
  });

  if (pixels.length === 0) {
    await setFacebookCatalogCredential(shop, {
      accessToken: catalog.accessToken,
      catalogId: catalog.catalogId,
      businessId,
      apiVersion: catalog.apiVersion,
      pixelId: catalog.pixelId,
      capiAccessToken,
      capiTokenType: "bisu",
      capiConfigId: configId,
      capiTokenObtainedAt: obtainedAt,
      capiEnabled: true,
      testEventCode: catalog.testEventCode,
      enabledEvents: catalog.enabledEvents,
    });
    console.info(
      `${LOG_PREFIX} step=bisu_saved_no_pixel shop=${shop} businessId=${businessId}`,
    );
    return { status: "saved", pixelId: catalog.pixelId?.trim() ?? "", businessId };
  }

  if (pixels.length === 1) {
    const pixelId = pixels[0].pixelId;
    await setFacebookCatalogCredential(shop, {
      accessToken: catalog.accessToken,
      catalogId: catalog.catalogId,
      businessId,
      apiVersion: catalog.apiVersion,
      pixelId,
      capiAccessToken,
      capiTokenType: "bisu",
      capiConfigId: configId,
      capiTokenObtainedAt: obtainedAt,
      capiEnabled: true,
      testEventCode: catalog.testEventCode,
      enabledEvents: catalog.enabledEvents,
    });
    console.info(
      `${LOG_PREFIX} step=bisu_saved shop=${shop} businessId=${businessId} pixelId=${pixelId}`,
    );
    return { status: "saved", pixelId, businessId };
  }

  console.info(
    `${LOG_PREFIX} step=bisu_select shop=${shop} businessId=${businessId} pixelCount=${pixels.length}`,
  );
  return { status: "select", pixels, businessId };
}
