import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";
import {
  isMetaCapiTokenAuthError,
  trackMetaPixelEvent,
  type TrackMetaPixelEventParams,
} from "./clients/metaConversionsApiClient.server";
import { fetchMetaPixelCapiAccessToken } from "./clients/metaCapiTokenClient.server";
import {
  listMetaAdAccountPixels,
  listMetaBusinessPixels,
  type MetaPixelListItem,
} from "./clients/facebookGraphClient.server";
import { getMetaAdAccounts, resolveMetaOAuthClient } from "./metaOAuth.server";
import {
  getFacebookCatalogCredential,
  getMetaAdsCredential,
  setFacebookCatalogCredential,
  type FacebookCatalogCredential,
} from "./credentialStore.server";
import {
  buildMetaStorefrontTrackUrl,
  isMetaPixelEventName,
  normalizeMetaEnabledEvents,
  META_PIXEL_METAFIELD_KEY,
  META_PIXEL_METAFIELD_NAMESPACE,
  type MetaPixelEventName,
  type MetaPixelStorefrontConfig,
} from "../../lib/metaPixelEvents";

const LOG_PREFIX = "[AdsCatalog][MetaPixelConfig]";

function credentialWriteBase(credential: FacebookCatalogCredential) {
  return {
    accessToken: credential.accessToken,
    catalogId: credential.catalogId,
    businessId: credential.businessId,
    apiVersion: credential.apiVersion,
  };
}

import {
  formatMetaCapiTokenForLog,
  shouldLogFullMetaCapiToken,
} from "./metaCapiLog.server";

export { formatMetaCapiTokenForLog, shouldLogFullMetaCapiToken };

function logMetaCapiTokenResolve(params: {
  shop: string;
  source: MetaCapiTokenSource | MetaTestCapiTokenSource | "none";
  token?: string;
  detail?: string;
}): void {
  const parts = [
    `${LOG_PREFIX} step=capi_token_resolve`,
    `shop=${params.shop.trim().toLowerCase()}`,
    `source=${params.source}`,
  ];
  if (params.detail) parts.push(`detail=${params.detail}`);
  if (params.token) parts.push(`token=${formatMetaCapiTokenForLog(params.token)}`);
  console.info(parts.join(" "));
}

async function resolveMetaOAuthAccessTokenForCapiFetch(params: {
  shop: string;
  credential: FacebookCatalogCredential;
}): Promise<string | null> {
  const shop = params.shop.trim().toLowerCase();
  const metaAds = await getMetaAdsCredential(shop);
  const metaAdsToken = metaAds?.accessToken?.trim();
  if (metaAdsToken) return metaAdsToken;
  return params.credential.accessToken?.trim() || null;
}

export async function canAutoFetchMetaPixelCapiAccessToken(params: {
  shop: string;
  credential: FacebookCatalogCredential;
}): Promise<boolean> {
  const oauthAccessToken = await resolveMetaOAuthAccessTokenForCapiFetch(params);
  const businessId = params.credential.businessId?.trim() ?? "";
  const client = resolveMetaOAuthClient();
  return Boolean(oauthAccessToken && businessId && client?.appId && client?.appSecret);
}

/**
 * 解析 CAPI 用 access token：仅使用手动输入或已保存的 Pixel 专用 capiAccessToken。
 */
export async function resolveMetaCapiAccessToken(params: {
  shop: string;
  credential: FacebookCatalogCredential;
  explicitToken?: string;
}): Promise<{ token: string; source: MetaCapiTokenSource } | null> {
  const shop = params.shop.trim().toLowerCase();

  const explicit = params.explicitToken?.trim();
  if (explicit) {
    logMetaCapiTokenResolve({
      shop,
      source: "request_explicit",
      token: explicit,
      detail: "request_body_or_save_input",
    });
    return { token: explicit, source: "request_explicit" };
  }

  const stored = params.credential.capiAccessToken?.trim();
  if (stored) {
    logMetaCapiTokenResolve({
      shop,
      source: "stored_capi",
      token: stored,
      detail: "credential_capiAccessToken",
    });
    return { token: stored, source: "stored_capi" };
  }

  logMetaCapiTokenResolve({ shop, source: "none", detail: "no_stored_capi_token" });
  return null;
}

/**
 * 测试事件专用：按当前选中 pixelId 实时换取 CAPI token，不回退 credential.capiAccessToken。
 */
export async function resolveMetaTestCapiAccessToken(params: {
  shop: string;
  credential: FacebookCatalogCredential;
  pixelId: string;
  explicitToken?: string;
}): Promise<{ token: string; source: MetaTestCapiTokenSource }> {
  const shop = params.shop.trim().toLowerCase();
  const pixelId = params.pixelId.trim();
  if (!pixelId) {
    throw new Error("请先配置 Meta Pixel ID");
  }

  const explicit = params.explicitToken?.trim();
  if (explicit) {
    logMetaCapiTokenResolve({
      shop,
      source: "request_explicit",
      token: explicit,
      detail: "test_event_manual_token",
    });
    return { token: explicit, source: "request_explicit" };
  }

  const oauthAccessToken = await resolveMetaOAuthAccessTokenForCapiFetch({
    shop,
    credential: params.credential,
  });
  const businessId = params.credential.businessId?.trim() ?? "";
  const client = resolveMetaOAuthClient();
  if (!oauthAccessToken || !businessId || !client?.appId || !client?.appSecret) {
    throw new Error(
      "测试事件需要 Meta Ads 授权与 Business ID；或在 Events Manager 粘贴 Token 后重试",
    );
  }

  let token: string;
  try {
    token = await fetchMetaPixelCapiAccessToken({
      shop,
      pixelId,
      businessId,
      oauthAccessToken,
      appId: client.appId,
      appSecret: client.appSecret,
      apiVersion: params.credential.apiVersion,
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    throw new Error(
      `无法为 Pixel ${pixelId} 获取 CAPI Access Token：${detail}。请确认授权账号对该 Pixel 有 Manage 权限，或在 Events Manager 手动粘贴 Token。`,
    );
  }

  logMetaCapiTokenResolve({
    shop,
    source: "fetched_for_pixel",
    token,
    detail: `pixelId=${pixelId}`,
  });
  return { token, source: "fetched_for_pixel" };
}

export async function hasMetaCapiAccessAvailable(
  shop: string,
  credential?: FacebookCatalogCredential | null,
): Promise<boolean> {
  const fb = credential ?? await getFacebookCatalogCredential(shop.trim().toLowerCase());
  if (!fb) return false;
  if (fb.capiAccessToken?.trim()) return true;
  return canAutoFetchMetaPixelCapiAccessToken({ shop, credential: fb });
}

function pixelConfigFieldsFromCredential(credential: FacebookCatalogCredential) {
  const pixelId = credential.pixelId?.trim() ?? "";
  return {
    ...(pixelId ? { pixelId } : {}),
    ...(credential.capiAccessToken?.trim()
      ? { capiAccessToken: credential.capiAccessToken.trim() }
      : {}),
    capiEnabled:
      typeof credential.capiEnabled === "boolean" ? credential.capiEnabled : true,
    enabledEvents: normalizeMetaEnabledEvents(credential.enabledEvents),
    ...(credential.testEventCode?.trim()
      ? { testEventCode: credential.testEventCode.trim() }
      : {}),
  };
}

/** OAuth 可用时重新换取 CAPI token 并写回 credential。 */
export async function refreshAndPersistMetaCapiAccessToken(params: {
  shop: string;
  credential: FacebookCatalogCredential;
  pixelId: string;
}): Promise<string | null> {
  const shop = params.shop.trim().toLowerCase();
  const pixelId = params.pixelId.trim();
  if (!pixelId) return null;

  const canAutoFetch = await canAutoFetchMetaPixelCapiAccessToken({
    shop,
    credential: params.credential,
  });
  if (!canAutoFetch) return null;

  const oauthAccessToken = await resolveMetaOAuthAccessTokenForCapiFetch({
    shop,
    credential: params.credential,
  });
  const businessId = params.credential.businessId?.trim() ?? "";
  const client = resolveMetaOAuthClient();
  if (!oauthAccessToken || !businessId || !client?.appId || !client?.appSecret) {
    return null;
  }

  try {
    const newToken = await fetchMetaPixelCapiAccessToken({
      shop,
      pixelId,
      businessId,
      oauthAccessToken,
      appId: client.appId,
      appSecret: client.appSecret,
      apiVersion: params.credential.apiVersion,
    });

    await setFacebookCatalogCredential(shop, {
      ...credentialWriteBase(params.credential),
      ...pixelConfigFieldsFromCredential(params.credential),
      pixelId,
      capiAccessToken: newToken,
    });

    console.info(
      `${LOG_PREFIX} step=capi_token_refreshed shop=${shop} pixelId=${pixelId} businessId=${businessId}`,
    );
    logMetaCapiTokenResolve({
      shop,
      source: "stored_capi",
      token: newToken,
      detail: "refreshed_after_auth_error",
    });
    return newToken;
  } catch (e) {
    console.warn(
      `${LOG_PREFIX} step=capi_token_refresh_failed shop=${shop} pixelId=${pixelId} err=${e instanceof Error ? e.message : String(e)}`,
    );
    return null;
  }
}

async function trackMetaPixelEventWithTokenRefresh(params: {
  shop: string;
  credential: FacebookCatalogCredential;
  pixelId: string;
  capiAccessToken: string;
  tokenSource: MetaCapiTokenSource;
  trackParams: Omit<TrackMetaPixelEventParams, "pixelId" | "capiAccessToken">;
}): Promise<void> {
  const attemptTrack = (token: string) =>
    trackMetaPixelEvent({
      pixelId: params.pixelId,
      capiAccessToken: token,
      ...params.trackParams,
    });

  try {
    await attemptTrack(params.capiAccessToken);
    return;
  } catch (e) {
    if (!isMetaCapiTokenAuthError(e) || params.tokenSource === "request_explicit") {
      throw e;
    }
  }

  console.info(
    `${LOG_PREFIX} step=capi_token_refresh_attempt shop=${params.shop.trim().toLowerCase()} pixelId=${params.pixelId}`,
  );
  const refreshedToken = await refreshAndPersistMetaCapiAccessToken({
    shop: params.shop,
    credential: params.credential,
    pixelId: params.pixelId,
  });
  if (!refreshedToken || refreshedToken === params.capiAccessToken) {
    throw new Error("Meta CAPI token expired and automatic refresh failed");
  }

  await attemptTrack(refreshedToken);
}

export type SaveMetaPixelConfigInput = {
  shop: string;
  admin: ShopifyAdminGraphqlClient;
  pixelId?: string;
  capiAccessToken?: string;
  capiEnabled?: boolean;
  enabledEvents?: unknown;
};

export type SaveMetaPixelConfigResult = {
  pixelId: string;
  capiEnabled: boolean;
  enabledEvents: MetaPixelEventName[];
  hasCapiAccessToken: boolean;
  /** 绑定/保存后回传，供 Admin UI 展示（Shopify Admin 鉴权页内）。 */
  capiAccessToken?: string;
};

export type ListMetaCatalogPixelsResult = {
  pixels: MetaPixelListItem[];
  adAccounts: Array<{ id: string; name?: string; formatted?: string }>;
  adAccountId: string;
  boundAdAccountId: string;
  boundPixelId: string;
  pixelSource: "meta_ads" | "business" | "catalog_ad_accounts" | "none";
  needsMetaAdsConnect: boolean;
  listError?: string;
};

function mapMetaAdAccounts(
  accounts: Awaited<ReturnType<typeof getMetaAdAccounts>>,
): Array<{ id: string; name?: string; formatted?: string }> {
  return accounts.map((a) => ({
    id: a.adAccountId,
    name: a.name,
    formatted: a.currencyCode,
  }));
}

/** 为 Ads Catalog Meta 面板列举可选 Pixel（优先 meta_ads 凭证）。 */
export async function listMetaCatalogPixels(params: {
  shop: string;
  adAccountId?: string;
}): Promise<ListMetaCatalogPixelsResult> {
  const shop = params.shop.trim().toLowerCase();
  const catalog = await getFacebookCatalogCredential(shop);
  const metaAds = await getMetaAdsCredential(shop);
  const boundPixelId = catalog?.pixelId?.trim() ?? "";

  const empty: ListMetaCatalogPixelsResult = {
    pixels: [],
    adAccounts: [],
    adAccountId: "",
    boundAdAccountId: metaAds?.adAccountId ?? "",
    boundPixelId,
    pixelSource: "none",
    needsMetaAdsConnect: false,
  };

  if (!catalog && !metaAds) {
    return { ...empty, needsMetaAdsConnect: true, listError: "no_credential" };
  }

  if (metaAds) {
    let adAccounts = metaAds.availableAccounts?.map((a) => ({
      id: a.id,
      name: a.name,
      formatted: a.formatted,
    })) ?? [];
    if (adAccounts.length === 0) {
      try {
        adAccounts = mapMetaAdAccounts(await getMetaAdAccounts(metaAds.accessToken));
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        return {
          ...empty,
          boundAdAccountId: metaAds.adAccountId,
          needsMetaAdsConnect: true,
          listError: errMsg,
        };
      }
    }
    if (adAccounts.length === 0 && metaAds.adAccountId) {
      adAccounts = [
        {
          id: metaAds.adAccountId,
          name: metaAds.adAccountName ?? metaAds.adAccountId,
          formatted: metaAds.currencyCode,
        },
      ];
    }

    const requested = params.adAccountId?.trim() || "";
    const adAccountId =
      requested && adAccounts.some((a) => a.id === requested)
        ? requested
        : adAccounts.some((a) => a.id === metaAds.adAccountId)
          ? metaAds.adAccountId
          : adAccounts[0]?.id ?? metaAds.adAccountId;

    if (!adAccountId) {
      return {
        ...empty,
        adAccounts,
        boundAdAccountId: metaAds.adAccountId,
        needsMetaAdsConnect: true,
        listError: "no_ad_account",
      };
    }

    try {
      const pixels = await listMetaAdAccountPixels({
        accessToken: metaAds.accessToken,
        adAccountId,
      });
      return {
        pixels,
        adAccounts,
        adAccountId,
        boundAdAccountId: metaAds.adAccountId,
        boundPixelId,
        pixelSource: "meta_ads",
        needsMetaAdsConnect: false,
      };
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      return {
        ...empty,
        adAccounts,
        adAccountId,
        boundAdAccountId: metaAds.adAccountId,
        pixelSource: "meta_ads",
        needsMetaAdsConnect: true,
        listError: errMsg,
      };
    }
  }

  if (!catalog) {
    return { ...empty, needsMetaAdsConnect: true };
  }

  if (catalog.businessId?.trim()) {
    try {
      const pixels = await listMetaBusinessPixels({
        accessToken: catalog.accessToken,
        businessId: catalog.businessId,
        apiVersion: catalog.apiVersion,
      });
      if (pixels.length > 0) {
        return {
          pixels,
          adAccounts: [],
          adAccountId: "",
          boundAdAccountId: "",
          boundPixelId,
          pixelSource: "business",
          needsMetaAdsConnect: false,
        };
      }
    } catch (e) {
      console.warn(
        `${LOG_PREFIX} step=business_pixels_failed shop=${shop} err=${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  try {
    const adAccounts = mapMetaAdAccounts(await getMetaAdAccounts(catalog.accessToken));
    const requested = params.adAccountId?.trim() || "";
    const adAccountId =
      requested && adAccounts.some((a) => a.id === requested)
        ? requested
        : adAccounts[0]?.id ?? "";

    if (!adAccountId) {
      return {
        ...empty,
        adAccounts,
        needsMetaAdsConnect: true,
        listError: "no_ad_account",
      };
    }

    const pixels = await listMetaAdAccountPixels({
      accessToken: catalog.accessToken,
      adAccountId,
      apiVersion: catalog.apiVersion,
    });
    return {
      pixels,
      adAccounts,
      adAccountId,
      boundAdAccountId: "",
      boundPixelId,
      pixelSource: "catalog_ad_accounts",
      needsMetaAdsConnect: false,
    };
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    return {
      ...empty,
      needsMetaAdsConnect: true,
      listError: errMsg,
    };
  }
}

async function resolveShopGid(admin: ShopifyAdminGraphqlClient): Promise<string> {
  const response = await admin.graphql(`#graphql
    query SparkMetaPixelShopId {
      shop { id }
    }
  `);
  const json = (await response.json()) as {
    data?: { shop?: { id?: string } };
    errors?: Array<{ message?: string }>;
  };
  const id = json.data?.shop?.id?.trim();
  if (!id) {
    throw new Error(
      json.errors?.[0]?.message || "Failed to resolve shop GID for metafield write",
    );
  }
  return id;
}

export async function syncMetaPixelStorefrontMetafield(params: {
  admin: ShopifyAdminGraphqlClient;
  config: MetaPixelStorefrontConfig;
}): Promise<void> {
  const shopId = await resolveShopGid(params.admin);
  const testEventCode = params.config.testEventCode?.trim() || "";
  const storefrontTrackUrl =
    testEventCode
      ? params.config.storefrontTrackUrl?.trim() || buildMetaStorefrontTrackUrl() || ""
      : "";
  const value = JSON.stringify({
    pixelId: params.config.pixelId,
    enabledEvents: params.config.enabledEvents,
    capiEnabled: params.config.capiEnabled,
    ...(testEventCode
      ? {
          testEventCode,
          ...(storefrontTrackUrl ? { storefrontTrackUrl } : {}),
        }
      : {}),
  });

  const response = await params.admin.graphql(
    `#graphql
      mutation SparkMetaPixelMetafieldSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { id key namespace }
          userErrors { field message code }
        }
      }
    `,
    {
      variables: {
        metafields: [
          {
            ownerId: shopId,
            namespace: META_PIXEL_METAFIELD_NAMESPACE,
            key: META_PIXEL_METAFIELD_KEY,
            type: "json",
            value,
          },
        ],
      },
    },
  );
  const json = (await response.json()) as {
    data?: {
      metafieldsSet?: {
        userErrors?: Array<{ message?: string }>;
      };
    };
    errors?: Array<{ message?: string }>;
  };
  const userErrors = json.data?.metafieldsSet?.userErrors ?? [];
  if (json.errors?.length || userErrors.length) {
    const msg =
      userErrors[0]?.message ||
      json.errors?.[0]?.message ||
      "metafieldsSet failed";
    throw new Error(`Meta Pixel metafield sync failed: ${msg}`);
  }
}

function storefrontConfigFromCredential(
  credential: FacebookCatalogCredential,
): MetaPixelStorefrontConfig | null {
  const pixelId = credential.pixelId?.trim() ?? "";
  if (!pixelId) return null;
  const testEventCode = credential.testEventCode?.trim() || undefined;
  const storefrontTrackUrl = testEventCode
    ? buildMetaStorefrontTrackUrl() || undefined
    : undefined;
  return {
    pixelId,
    enabledEvents: normalizeMetaEnabledEvents(credential.enabledEvents),
    capiEnabled:
      typeof credential.capiEnabled === "boolean" ? credential.capiEnabled : true,
    ...(testEventCode ? { testEventCode } : {}),
    ...(storefrontTrackUrl ? { storefrontTrackUrl } : {}),
  };
}

export async function trackMetaStorefrontTestEvent(params: {
  shop: string;
  event: string;
  eventId?: string;
  properties?: Record<string, unknown>;
  pageUrl?: string;
  clientIpAddress?: string;
  clientUserAgent?: string;
}): Promise<{ sent: boolean; reason?: string }> {
  const shop = params.shop.trim().toLowerCase();
  if (!shop) return { sent: false, reason: "no_shop" };

  const credential = await getFacebookCatalogCredential(shop);
  if (!credential) return { sent: false, reason: "no_credential" };

  const testEventCode = credential.testEventCode?.trim() || "";
  if (!testEventCode) return { sent: false, reason: "test_mode_off" };

  const pixelId = credential.pixelId?.trim() || "";
  const resolved = await resolveMetaCapiAccessToken({ shop, credential });
  const token = resolved?.token ?? "";
  const enabled =
    typeof credential.capiEnabled === "boolean" ? credential.capiEnabled : true;
  if (!enabled) return { sent: false, reason: "capi_disabled" };
  if (!pixelId) return { sent: false, reason: "no_pixel" };
  if (!token) return { sent: false, reason: "no_capi_token" };

  const event = params.event.trim();
  if (!isMetaPixelEventName(event)) {
    return { sent: false, reason: "invalid_event" };
  }

  const enabledEvents = normalizeMetaEnabledEvents(credential.enabledEvents);
  if (!enabledEvents.includes(event as MetaPixelEventName)) {
    return { sent: false, reason: "event_not_enabled" };
  }

  const customData: Record<string, unknown> = {};
  if (params.properties) {
    for (const [key, val] of Object.entries(params.properties)) {
      if (val !== undefined && val !== null) customData[key] = val;
    }
  }

  try {
    await trackMetaPixelEventWithTokenRefresh({
      shop,
      credential,
      pixelId,
      capiAccessToken: token,
      tokenSource: resolved?.source ?? "stored_capi",
      trackParams: {
        eventName: event,
        eventId: params.eventId?.trim() || `spark-sf-${Date.now()}`,
        customData: Object.keys(customData).length > 0 ? customData : undefined,
        email: buildMetaCapiTestEmail(params.shop),
        clientIpAddress: params.clientIpAddress,
        clientUserAgent: params.clientUserAgent,
        testEventCode,
        eventSourceUrl: params.pageUrl?.trim() || undefined,
      },
    });
    return { sent: true };
  } catch (e) {
    console.warn(
      `${LOG_PREFIX} step=storefront_test_track_failed shop=${shop} event=${event} err=${e instanceof Error ? e.message : String(e)}`,
    );
    return { sent: false, reason: "track_failed" };
  }
}

export async function saveMetaPixelConfig(
  params: SaveMetaPixelConfigInput,
): Promise<SaveMetaPixelConfigResult> {
  const credential = await getFacebookCatalogCredential(params.shop);
  if (!credential) {
    throw new Error("Meta Catalog 尚未连接，请先完成授权。");
  }

  const pixelId = params.pixelId?.trim() ?? "";
  if (!pixelId) {
    throw new Error("请填写 Meta Pixel ID");
  }
  if (!/^\d+$/.test(pixelId)) {
    throw new Error("Meta Pixel ID 应为数字");
  }

  try {
    const listed = await listMetaCatalogPixels({ shop: params.shop });
    if (
      listed.pixels.length > 0 &&
      !listed.pixels.some((p) => p.pixelId === pixelId)
    ) {
      console.warn(
        `${LOG_PREFIX} step=select_pixel_not_in_list shop=${params.shop} pixelId=${pixelId}`,
      );
    }
  } catch {
    // 列表失败不阻断保存（手动 Pixel ID 仍可用）
  }

  const existingToken = credential.capiAccessToken?.trim() || "";
  const incomingToken = params.capiAccessToken?.trim() ?? "";
  const capiEnabled =
    typeof params.capiEnabled === "boolean" ? params.capiEnabled : true;
  const pixelChanged = pixelId !== (credential.pixelId?.trim() ?? "");
  const shouldAutoFetchCapiToken =
    capiEnabled && !incomingToken && (pixelChanged || !existingToken);

  let capiAccessTokenToStore = incomingToken || existingToken;

  if (shouldAutoFetchCapiToken) {
    const oauthAccessToken = await resolveMetaOAuthAccessTokenForCapiFetch({
      shop: params.shop,
      credential,
    });
    const businessId = credential.businessId?.trim() ?? "";
    const client = resolveMetaOAuthClient();
    if (!oauthAccessToken) {
      throw new Error("请连接 Meta Ads 授权后再选择 Pixel。");
    }
    if (!businessId) {
      throw new Error("缺少 Meta Business ID，请重新完成 Meta Catalog 授权。");
    }
    if (!client) {
      throw new Error("Meta App 未配置，无法自动获取 CAPI Access Token。");
    }
    try {
      capiAccessTokenToStore = await fetchMetaPixelCapiAccessToken({
        shop: params.shop,
        pixelId,
        businessId,
        oauthAccessToken,
        appId: client.appId,
        appSecret: client.appSecret,
        apiVersion: credential.apiVersion,
      });
      console.info(
        `${LOG_PREFIX} step=capi_token_fetched shop=${params.shop} pixelId=${pixelId} businessId=${businessId}`,
      );
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      throw new Error(
        `无法自动获取 Pixel CAPI Access Token：${detail}。请确认授权账号对该 Pixel 有 Manage 权限，或在 Events Manager 手动粘贴 Token。`,
      );
    }
  } else if (capiEnabled && !capiAccessTokenToStore) {
    const canAutoFetch = await canAutoFetchMetaPixelCapiAccessToken({
      shop: params.shop,
      credential,
    });
    if (!canAutoFetch) {
      throw new Error(
        "请连接 Meta Ads 授权，或在 Events Manager 粘贴 Conversions API Access Token",
      );
    }
  }

  const enabledEvents = normalizeMetaEnabledEvents(params.enabledEvents);
  const preservedTestEventCode = credential.testEventCode?.trim() || undefined;

  await setFacebookCatalogCredential(params.shop, {
    ...credentialWriteBase(credential),
    pixelId,
    ...(capiAccessTokenToStore ? { capiAccessToken: capiAccessTokenToStore } : {}),
    capiEnabled,
    enabledEvents,
  });

  try {
    await syncMetaPixelStorefrontMetafield({
      admin: params.admin,
      config: {
        pixelId,
        enabledEvents,
        capiEnabled,
        ...(preservedTestEventCode ? { testEventCode: preservedTestEventCode } : {}),
      },
    });
  } catch (e) {
    console.warn(
      `${LOG_PREFIX} step=metafield_sync_failed shop=${params.shop} err=${e instanceof Error ? e.message : String(e)}`,
    );
  }

  console.info(
    `${LOG_PREFIX} step=saved shop=${params.shop} pixelId=${pixelId} capi=${capiEnabled} events=${enabledEvents.join(",")}`,
  );

  const hasCapiAccessToken = Boolean(capiAccessTokenToStore);

  return {
    pixelId,
    capiEnabled,
    enabledEvents,
    hasCapiAccessToken,
    ...(capiAccessTokenToStore ? { capiAccessToken: capiAccessTokenToStore } : {}),
  };
}

/** orders/paid → Purchase（按勾选 + CAPI 开关）。 */
export async function maybeTrackMetaPurchase(params: {
  shop: string;
  orderId: string;
  orderName?: string;
  value?: number;
  currency?: string;
  email?: string;
}): Promise<{ sent: boolean; reason?: string }> {
  const credential = await getFacebookCatalogCredential(params.shop);
  if (!credential) return { sent: false, reason: "no_credential" };

  const pixelId = credential.pixelId?.trim() ?? "";
  const resolved = await resolveMetaCapiAccessToken({
    shop: params.shop,
    credential,
  });
  const token = resolved?.token ?? "";
  const enabled =
    typeof credential.capiEnabled === "boolean" ? credential.capiEnabled : true;
  const events = normalizeMetaEnabledEvents(credential.enabledEvents);

  if (!enabled) return { sent: false, reason: "capi_disabled" };
  if (!pixelId) return { sent: false, reason: "no_pixel" };
  if (!token) return { sent: false, reason: "no_capi_token" };
  if (!events.includes("Purchase")) {
    return { sent: false, reason: "event_not_enabled" };
  }

  const eventId = params.orderName?.trim() || params.orderId;
  const customData: Record<string, unknown> = {};
  if (typeof params.value === "number" && Number.isFinite(params.value)) {
    customData.value = params.value;
  }
  if (params.currency?.trim()) customData.currency = params.currency.trim();

  const testEventCode = credential.testEventCode?.trim() || undefined;

  try {
    await trackMetaPixelEventWithTokenRefresh({
      shop: params.shop,
      credential,
      pixelId,
      capiAccessToken: token,
      tokenSource: resolved?.source ?? "stored_capi",
      trackParams: {
        eventName: "Purchase",
        eventId,
        customData: Object.keys(customData).length > 0 ? customData : undefined,
        email: params.email?.trim() || undefined,
        testEventCode,
      },
    });
    console.info(
      `${LOG_PREFIX} step=purchase_sent shop=${params.shop} eventId=${eventId}${testEventCode ? " test=1" : ""}`,
    );
    return { sent: true };
  } catch (e) {
    console.warn(
      `${LOG_PREFIX} step=purchase_failed shop=${params.shop} err=${e instanceof Error ? e.message : String(e)}`,
    );
    return { sent: false, reason: "track_failed" };
  }
}

export async function startMetaPixelTestEventMode(params: {
  shop: string;
  admin: ShopifyAdminGraphqlClient;
  testEventCode: string;
}): Promise<void> {
  const credential = await getFacebookCatalogCredential(params.shop);
  if (!credential) {
    throw new Error("Meta Catalog 尚未连接，请先完成授权。");
  }
  const testEventCode = params.testEventCode.trim();
  if (!testEventCode) throw new Error("请填写 Test Event Code");
  if (!credential.pixelId?.trim()) {
    throw new Error("请先配置 Meta Pixel");
  }

  await setFacebookCatalogCredential(params.shop, {
    ...credentialWriteBase(credential),
    testEventCode,
  });

  const storefront = storefrontConfigFromCredential({
    ...credential,
    testEventCode,
  });
  if (storefront) {
    await syncMetaPixelStorefrontMetafield({
      admin: params.admin,
      config: storefront,
    });
  }

  console.info(
    `${LOG_PREFIX} step=test_mode_started shop=${params.shop} pixel=${credential.pixelId}`,
  );
}

export async function clearMetaPixelTestEventMode(params: {
  shop: string;
  admin: ShopifyAdminGraphqlClient;
}): Promise<void> {
  const credential = await getFacebookCatalogCredential(params.shop);
  if (!credential) return;

  if (credential.testEventCode?.trim()) {
    await setFacebookCatalogCredential(params.shop, {
      ...credentialWriteBase(credential),
      testEventCode: "",
    });
  }

  const storefront = storefrontConfigFromCredential({
    ...credential,
    testEventCode: undefined,
  });
  if (storefront) {
    await syncMetaPixelStorefrontMetafield({
      admin: params.admin,
      config: storefront,
    });
  }

  console.info(`${LOG_PREFIX} step=test_mode_cleared shop=${params.shop}`);
}

export async function testMetaServerEvents(params: {
  shop: string;
  testEventCode: string;
  capiAccessToken?: string;
  pixelId?: string;
  clientIpAddress?: string;
  clientUserAgent?: string;
}): Promise<void> {
  const credential = await getFacebookCatalogCredential(params.shop);
  if (!credential) {
    throw new Error("Meta Catalog 尚未连接，请先完成授权。");
  }
  const pixelId = params.pixelId?.trim() || credential.pixelId?.trim() || "";
  const testEventCode = params.testEventCode.trim();
  if (!testEventCode) throw new Error("请填写 Test Event Code");

  const resolved = await resolveMetaTestCapiAccessToken({
    shop: params.shop,
    credential,
    pixelId,
    explicitToken: params.capiAccessToken?.trim() || undefined,
  });
  const token = resolved.token;

  console.info(
    `${LOG_PREFIX} step=test_event_token shop=${params.shop.trim().toLowerCase()} pixelId=${pixelId} tokenSource=${resolved.source} token=${formatMetaCapiTokenForLog(token)} requestExplicitToken=${Boolean(params.capiAccessToken?.trim())}`,
  );

  const clientIpAddress =
    params.clientIpAddress?.trim() || "1.1.1.1";
  const clientUserAgent =
    params.clientUserAgent?.trim() ||
    "Mozilla/5.0 (compatible; SparkMetaCAPI/1.0)";

  await trackMetaPixelEvent({
    pixelId,
    capiAccessToken: token,
    eventName: "Purchase",
    eventId: `spark-test-${Date.now()}`,
    customData: { value: 1, currency: "USD" },
    email: buildMetaCapiTestEmail(params.shop),
    clientIpAddress,
    clientUserAgent,
    testEventCode,
    eventSourceUrl: `https://${params.shop.trim().toLowerCase()}`,
  });
}

function buildMetaCapiTestEmail(shop: string): string {
  const normalized = shop.trim().toLowerCase().replace(/[^a-z0-9.-]/g, "");
  return `spark-capi-test@${normalized || "example.com"}`;
}
