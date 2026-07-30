import prisma from "../../db.server";
import type { TiktokCatalogBindingMode } from "./tiktokOAuth.server";

export type { TiktokCatalogBindingMode };

// Catalog credentials live in the same `AdPlatformCredential` table as ads
// auth credentials, but use dedicated platform keys so they don't collide
// with Meta/Google Ads OAuth records that are stored elsewhere.
const META_CATALOG_PLATFORM = "meta_catalog";
const META_ADS_PLATFORM = "meta_ads";
const GOOGLE_MERCHANT_PLATFORM = "google_merchant";
const GOOGLE_ADS_PLATFORM = "google";
const TIKTOK_CATALOG_PLATFORM = "tiktok_catalog";
// Transient records holding freshly-exchanged OAuth tokens while the merchant
// picks which account to connect (multi-account selection flow).
const GMC_PENDING_PLATFORM = "google_merchant_pending";
const ADS_PENDING_PLATFORM = "google_ads_pending";
// Google Ads 测试账号（广告洞察沙盒，与 Catalog / 生产 Insights OAuth 隔离）
const GOOGLE_ADS_SANDBOX_PLATFORM = "google_ads_sandbox";
const GOOGLE_ADS_SANDBOX_PENDING_PLATFORM = "google_ads_sandbox_pending";
// Transient record holding a freshly-exchanged Meta long-lived token while the
// merchant picks which catalog to connect (multi-catalog selection flow).
const META_CATALOG_PENDING_PLATFORM = "meta_catalog_pending";
// Transient record for Meta Ads ad-account selection.
const META_ADS_PENDING_PLATFORM = "meta_ads_pending";
// Transient record for TikTok catalog selection.
const TIKTOK_CATALOG_PENDING_PLATFORM = "tiktok_catalog_pending";

export type FacebookCatalogCredential = {
  accessToken: string;
  catalogId: string;
  businessId?: string;
  apiVersion?: string;
  updatedAt: string;
};

export type GoogleMerchantCredential = {
  /** OAuth2 access token (short-lived). */
  accessToken: string;
  /** OAuth2 refresh token used to mint new access tokens. */
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  merchantId: string;
  /** Merchant Notifications API subscription name, e.g. "accounts/123/notificationsubscriptions/456". */
  subscriptionName?: string;
  updatedAt: string;
};

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function readPlatformCredential(
  shop: string,
  platform: string,
): Promise<{ data: Record<string, unknown>; updatedAt: Date } | null> {
  const row = await prisma.adPlatformCredential.findUnique({
    where: { shop_platform: { shop, platform } },
  });
  if (!row || !isJsonObject(row.credentials)) return null;
  return { data: row.credentials, updatedAt: row.updatedAt };
}

async function writePlatformCredential(
  shop: string,
  platform: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await prisma.adPlatformCredential.upsert({
    where: { shop_platform: { shop, platform } },
    update: { credentials: payload },
    create: { shop, platform, credentials: payload },
  });
}

// ─── Facebook catalog ───────────────────────────────────────────────────────

export async function getFacebookCatalogCredential(
  shop: string,
): Promise<FacebookCatalogCredential | null> {
  const record = await readPlatformCredential(shop, META_CATALOG_PLATFORM);
  if (!record) return null;
  const accessToken = String(record.data.accessToken ?? "");
  const catalogId = String(record.data.catalogId ?? "");
  if (!accessToken || !catalogId) return null;
  return {
    accessToken,
    catalogId,
    businessId:
      typeof record.data.businessId === "string" ? record.data.businessId : undefined,
    apiVersion:
      typeof record.data.apiVersion === "string" ? record.data.apiVersion : undefined,
    updatedAt: record.updatedAt.toISOString(),
  };
}

export async function setFacebookCatalogCredential(
  shop: string,
  payload: Pick<FacebookCatalogCredential, "accessToken" | "catalogId" | "businessId" | "apiVersion">,
): Promise<void> {
  const accessToken = payload.accessToken.trim();
  const catalogId = payload.catalogId.trim();
  if (!accessToken || !catalogId) {
    throw new Error("Facebook catalog accessToken and catalogId are required");
  }
  await writePlatformCredential(shop, META_CATALOG_PLATFORM, {
    accessToken,
    catalogId,
    businessId: payload.businessId?.trim() || null,
    apiVersion: payload.apiVersion?.trim() || null,
  });
}

// ─── Google Merchant Center ─────────────────────────────────────────────────

export async function getGoogleMerchantCredential(
  shop: string,
): Promise<GoogleMerchantCredential | null> {
  const record = await readPlatformCredential(shop, GOOGLE_MERCHANT_PLATFORM);
  if (!record) return null;
  const accessToken = String(record.data.accessToken ?? "");
  const merchantId = String(record.data.merchantId ?? "");
  if (!accessToken || !merchantId) return null;
  return {
    accessToken,
    refreshToken:
      typeof record.data.refreshToken === "string"
        ? record.data.refreshToken
        : undefined,
    clientId:
      typeof record.data.clientId === "string" ? record.data.clientId : undefined,
    clientSecret:
      typeof record.data.clientSecret === "string"
        ? record.data.clientSecret
        : undefined,
    merchantId,
    subscriptionName:
      typeof record.data.subscriptionName === "string"
        ? record.data.subscriptionName
        : undefined,
    updatedAt: record.updatedAt.toISOString(),
  };
}

export async function setGoogleMerchantCredential(
  shop: string,
  payload: Pick<
    GoogleMerchantCredential,
    "accessToken" | "refreshToken" | "clientId" | "clientSecret" | "merchantId"
  >,
): Promise<void> {
  const accessToken = payload.accessToken.trim();
  const merchantId = payload.merchantId.trim();
  if (!accessToken || !merchantId) {
    throw new Error("Google Merchant accessToken and merchantId are required");
  }
  await writePlatformCredential(shop, GOOGLE_MERCHANT_PLATFORM, {
    accessToken,
    refreshToken: payload.refreshToken?.trim() || null,
    clientId: payload.clientId?.trim() || null,
    clientSecret: payload.clientSecret?.trim() || null,
    merchantId,
  });
}

/**
 * Persist the Merchant Notifications API subscription name without touching
 * other credential fields (e.g. access/refresh tokens).
 * No-ops silently when no GMC credential exists yet.
 */
export async function setGmcSubscriptionName(
  shop: string,
  subscriptionName: string,
): Promise<void> {
  const existing = await readPlatformCredential(shop, GOOGLE_MERCHANT_PLATFORM);
  if (!existing) return;
  await writePlatformCredential(shop, GOOGLE_MERCHANT_PLATFORM, {
    ...existing.data,
    subscriptionName,
  });
}

// ─── Google Ads (OAuth) ─────────────────────────────────────────────────────
// Stored on the shared `google` platform record. The OAuth flow writes tokens +
// the selected customerId; clientId/clientSecret/developerToken are app-level
// (read from env at request time), so they are not persisted per shop here.

export type GoogleAdsCredential = {
  accessToken: string;
  refreshToken?: string;
  customerId: string;
  /** MCC 场景下访问子账户所需的经理账户 ID；直连账户与 customerId 相同。 */
  loginCustomerId?: string;
  updatedAt: string;
};

export async function getGoogleAdsCredential(
  shop: string,
): Promise<GoogleAdsCredential | null> {
  const record = await readPlatformCredential(shop, GOOGLE_ADS_PLATFORM);
  if (!record) return null;
  const accessToken = String(record.data.accessToken ?? "");
  const customerId = String(record.data.customerId ?? "");
  if (!accessToken || !customerId) return null;
  return {
    accessToken,
    refreshToken:
      typeof record.data.refreshToken === "string" ? record.data.refreshToken : undefined,
    customerId,
    loginCustomerId:
      typeof record.data.loginCustomerId === "string"
        ? record.data.loginCustomerId
        : undefined,
    updatedAt: record.updatedAt.toISOString(),
  };
}

export async function setGoogleAdsCredential(
  shop: string,
  payload: Pick<
    GoogleAdsCredential,
    "accessToken" | "refreshToken" | "customerId" | "loginCustomerId"
  >,
): Promise<void> {
  const accessToken = payload.accessToken.trim();
  const customerId = payload.customerId.trim();
  if (!accessToken || !customerId) {
    throw new Error("Google Ads accessToken and customerId are required");
  }
  // Merge with any existing manual config fields so we don't drop them.
  const existing = await readPlatformCredential(shop, GOOGLE_ADS_PLATFORM);
  await writePlatformCredential(shop, GOOGLE_ADS_PLATFORM, {
    ...(existing?.data ?? {}),
    accessToken,
    refreshToken: payload.refreshToken?.trim() || existing?.data.refreshToken || null,
    customerId,
    loginCustomerId:
      payload.loginCustomerId?.trim() ||
      (typeof existing?.data.loginCustomerId === "string"
        ? existing.data.loginCustomerId
        : null),
  });
}

// ─── Pending OAuth selection (multi-account) ─────────────────────────────────

export type PendingOAuthAccount = {
  id: string;
  name?: string;
  formatted?: string;
  /** Meta catalog 所属的 Business ID；TikTok 场景存 bc_id。 */
  businessId?: string;
  /** TikTok 授权广告主 ID（商品写入等接口使用）。 */
  advertiserId?: string;
  /** Google Ads：访问该客户账户时应使用的 login-customer-id（MCC 子账户场景）。 */
  loginCustomerId?: string;
  /** TikTok：是否为 Shopify 官方同步 Catalog。 */
  isShopifyOfficial?: boolean;
};

export type PendingOAuthTokens = {
  accessToken: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  /** TikTok：OAuth 已完成但尚未绑定 Catalog 时保留广告主 ID。 */
  advertiserId?: string;
  /** TikTok：OAuth 已完成但尚未绑定 Catalog 时保留 Business Center ID。 */
  bcId?: string;
  /** TikTok：手动选择的 Catalog 目标市场（ISO2）。 */
  catalogRegionCode?: string;
  accounts: PendingOAuthAccount[];
};

async function setPending(
  shop: string,
  platform: string,
  payload: PendingOAuthTokens,
): Promise<void> {
  await writePlatformCredential(shop, platform, {
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken ?? null,
    clientId: payload.clientId ?? null,
    clientSecret: payload.clientSecret ?? null,
    advertiserId: payload.advertiserId?.trim() || null,
    bcId: payload.bcId?.trim() || null,
    catalogRegionCode: payload.catalogRegionCode?.trim().toUpperCase() || null,
    accounts: payload.accounts,
  });
}

async function getPending(
  shop: string,
  platform: string,
): Promise<PendingOAuthTokens | null> {
  const record = await readPlatformCredential(shop, platform);
  if (!record) return null;
  const accessToken = String(record.data.accessToken ?? "");
  if (!accessToken) return null;
  return {
    accessToken,
    refreshToken:
      typeof record.data.refreshToken === "string" ? record.data.refreshToken : undefined,
    clientId: typeof record.data.clientId === "string" ? record.data.clientId : undefined,
    clientSecret:
      typeof record.data.clientSecret === "string" ? record.data.clientSecret : undefined,
    advertiserId:
      typeof record.data.advertiserId === "string" && record.data.advertiserId.trim()
        ? record.data.advertiserId.trim()
        : undefined,
    bcId:
      typeof record.data.bcId === "string" && record.data.bcId.trim()
        ? record.data.bcId.trim()
        : undefined,
    catalogRegionCode:
      typeof record.data.catalogRegionCode === "string" && record.data.catalogRegionCode.trim()
        ? record.data.catalogRegionCode.trim().toUpperCase()
        : undefined,
    accounts: Array.isArray(record.data.accounts)
      ? (record.data.accounts as PendingOAuthTokens["accounts"])
      : [],
  };
}

async function clearPending(shop: string, platform: string): Promise<void> {
  await prisma.adPlatformCredential
    .delete({ where: { shop_platform: { shop, platform } } })
    .catch(() => undefined);
}

export const setGoogleMerchantPending = (shop: string, payload: PendingOAuthTokens) =>
  setPending(shop, GMC_PENDING_PLATFORM, payload);
export const getGoogleMerchantPending = (shop: string) =>
  getPending(shop, GMC_PENDING_PLATFORM);
export const clearGoogleMerchantPending = (shop: string) =>
  clearPending(shop, GMC_PENDING_PLATFORM);

export const setGoogleAdsPending = (shop: string, payload: PendingOAuthTokens) =>
  setPending(shop, ADS_PENDING_PLATFORM, payload);
export const getGoogleAdsPending = (shop: string) => getPending(shop, ADS_PENDING_PLATFORM);
export const clearGoogleAdsPending = (shop: string) => clearPending(shop, ADS_PENDING_PLATFORM);

// ─── Google Ads 测试账号（Insights 沙盒 OAuth）────────────────────────────────

export type GoogleAdsSandboxCredential = {
  accessToken: string;
  refreshToken?: string;
  customerId: string;
  loginCustomerId?: string;
  descriptiveName?: string;
  updatedAt: string;
};

export async function getGoogleAdsSandboxCredential(
  shop: string,
): Promise<GoogleAdsSandboxCredential | null> {
  const record = await readPlatformCredential(shop, GOOGLE_ADS_SANDBOX_PLATFORM);
  if (!record) return null;
  const accessToken = String(record.data.accessToken ?? "");
  const customerId = String(record.data.customerId ?? "");
  if (!accessToken || !customerId) return null;
  return {
    accessToken,
    refreshToken:
      typeof record.data.refreshToken === "string" ? record.data.refreshToken : undefined,
    customerId,
    loginCustomerId:
      typeof record.data.loginCustomerId === "string"
        ? record.data.loginCustomerId
        : undefined,
    descriptiveName:
      typeof record.data.descriptiveName === "string"
        ? record.data.descriptiveName
        : undefined,
    updatedAt: record.updatedAt.toISOString(),
  };
}

export async function setGoogleAdsSandboxCredential(
  shop: string,
  payload: Pick<
    GoogleAdsSandboxCredential,
    "accessToken" | "refreshToken" | "customerId" | "loginCustomerId" | "descriptiveName"
  >,
): Promise<void> {
  const accessToken = payload.accessToken.trim();
  const customerId = payload.customerId.trim();
  if (!accessToken || !customerId) {
    throw new Error("Google Ads sandbox accessToken and customerId are required");
  }
  await writePlatformCredential(shop, GOOGLE_ADS_SANDBOX_PLATFORM, {
    accessToken,
    refreshToken: payload.refreshToken?.trim() || null,
    customerId,
    loginCustomerId: payload.loginCustomerId?.trim() || null,
    descriptiveName: payload.descriptiveName?.trim() || null,
  });
}

export const deleteGoogleAdsSandboxCredential = (shop: string) =>
  clearPending(shop, GOOGLE_ADS_SANDBOX_PLATFORM);

export const setGoogleAdsSandboxPending = (shop: string, payload: PendingOAuthTokens) =>
  setPending(shop, GOOGLE_ADS_SANDBOX_PENDING_PLATFORM, payload);
export const getGoogleAdsSandboxPending = (shop: string) =>
  getPending(shop, GOOGLE_ADS_SANDBOX_PENDING_PLATFORM);
export const clearGoogleAdsSandboxPending = (shop: string) =>
  clearPending(shop, GOOGLE_ADS_SANDBOX_PENDING_PLATFORM);

export const setMetaCatalogPending = (shop: string, payload: PendingOAuthTokens) =>
  setPending(shop, META_CATALOG_PENDING_PLATFORM, payload);
export const getMetaCatalogPending = (shop: string) =>
  getPending(shop, META_CATALOG_PENDING_PLATFORM);
export const clearMetaCatalogPending = (shop: string) =>
  clearPending(shop, META_CATALOG_PENDING_PLATFORM);

export const deleteGoogleMerchantCredential = (shop: string) =>
  clearPending(shop, GOOGLE_MERCHANT_PLATFORM);
export const deleteGoogleAdsCredential = (shop: string) =>
  clearPending(shop, GOOGLE_ADS_PLATFORM);
export const deleteFacebookCatalogCredential = (shop: string) =>
  clearPending(shop, META_CATALOG_PLATFORM);

// ─── Meta Ads (Marketing API) ───────────────────────────────────────────────

export type MetaAdsCredential = {
  accessToken: string;
  /** Graph act_ ID，如 act_123456 */
  adAccountId: string;
  adAccountName?: string;
  currencyCode?: string;
  updatedAt: string;
};

export async function getMetaAdsCredential(
  shop: string,
): Promise<MetaAdsCredential | null> {
  const record = await readPlatformCredential(shop, META_ADS_PLATFORM);
  if (!record) return null;
  const accessToken = String(record.data.accessToken ?? "");
  const adAccountId = String(record.data.adAccountId ?? "");
  if (!accessToken || !adAccountId) return null;
  return {
    accessToken,
    adAccountId,
    adAccountName:
      typeof record.data.adAccountName === "string"
        ? record.data.adAccountName
        : undefined,
    currencyCode:
      typeof record.data.currencyCode === "string"
        ? record.data.currencyCode
        : undefined,
    updatedAt: record.updatedAt.toISOString(),
  };
}

export async function setMetaAdsCredential(
  shop: string,
  payload: Pick<
    MetaAdsCredential,
    "accessToken" | "adAccountId" | "adAccountName" | "currencyCode"
  >,
): Promise<void> {
  const accessToken = payload.accessToken.trim();
  const adAccountId = payload.adAccountId.trim();
  if (!accessToken || !adAccountId) {
    throw new Error("Meta Ads accessToken and adAccountId are required");
  }
  await writePlatformCredential(shop, META_ADS_PLATFORM, {
    accessToken,
    adAccountId,
    adAccountName: payload.adAccountName?.trim() || null,
    currencyCode: payload.currencyCode?.trim() || null,
  });
}

export const deleteMetaAdsCredential = (shop: string) =>
  clearPending(shop, META_ADS_PLATFORM);

export const setMetaAdsPending = (shop: string, payload: PendingOAuthTokens) =>
  setPending(shop, META_ADS_PENDING_PLATFORM, payload);
export const getMetaAdsPending = (shop: string) =>
  getPending(shop, META_ADS_PENDING_PLATFORM);
export const clearMetaAdsPending = (shop: string) =>
  clearPending(shop, META_ADS_PENDING_PLATFORM);

// ─── TikTok Catalog ──────────────────────────────────────────────────────────

export type TiktokCatalogCredential = {
  accessToken: string;
  refreshToken?: string;
  advertiserId: string;
  /** Business Center ID；Catalog API 必填。旧凭证可能缺失。 */
  bcId?: string;
  catalogId: string;
  catalogName?: string;
  /**
   * shopify_official：TikTok for Shopify 官方同步目录（只读校验，不 API 上传）。
   * api_managed：Spark 可写目录。旧凭证缺省按 api_managed。
   */
  bindingMode: TiktokCatalogBindingMode;
  /** 已选中或新建的 TikTok Pixel Code（Catalog 事件源 + 店面追踪）。 */
  pixelCode?: string;
  /** 商家应用 ID（应用事件源，用于 App 内事件再营销）。 */
  appId?: string;
  /** Events Manager 生成的 Events API Access Token（与 OAuth token 分开）。 */
  eventsApiAccessToken?: string;
  /** Conversion API / Events API 开关。 */
  eventsApiEnabled?: boolean;
  /**
   * Events Manager Test Event Code。
   * 有值时服务端 Events API（如 CompletePayment）带 test_event_code；浏览器侧靠店面 URL/sessionStorage。
   */
  testEventCode?: string;
  /** 勾选上报的 TikTok 标准事件名。 */
  enabledEvents?: string[];
  /** 手动选择的 Catalog 目标市场（ISO2），用于覆盖店铺推断区域。 */
  catalogRegionCode?: string;
  updatedAt: string;
};

function parseTiktokBindingMode(value: unknown): TiktokCatalogBindingMode {
  return value === "shopify_official" ? "shopify_official" : "api_managed";
}

export async function getTiktokCatalogCredential(
  shop: string,
): Promise<TiktokCatalogCredential | null> {
  const record = await readPlatformCredential(shop, TIKTOK_CATALOG_PLATFORM);
  if (!record) return null;
  const accessToken = String(record.data.accessToken ?? "");
  const advertiserId = String(record.data.advertiserId ?? "");
  const catalogId = String(record.data.catalogId ?? "");
  if (!accessToken || !advertiserId || !catalogId) return null;
  return {
    accessToken,
    refreshToken:
      typeof record.data.refreshToken === "string" && record.data.refreshToken
        ? record.data.refreshToken
        : undefined,
    advertiserId,
    bcId:
      typeof record.data.bcId === "string" && record.data.bcId.trim()
        ? record.data.bcId.trim()
        : undefined,
    catalogId,
    catalogName:
      typeof record.data.catalogName === "string" ? record.data.catalogName : undefined,
    bindingMode: parseTiktokBindingMode(record.data.bindingMode),
    pixelCode:
      typeof record.data.pixelCode === "string" && record.data.pixelCode.trim()
        ? record.data.pixelCode.trim()
        : undefined,
    appId:
      typeof record.data.appId === "string" && record.data.appId.trim()
        ? record.data.appId.trim()
        : undefined,
    eventsApiAccessToken:
      typeof record.data.eventsApiAccessToken === "string" &&
      record.data.eventsApiAccessToken.trim()
        ? record.data.eventsApiAccessToken.trim()
        : undefined,
    eventsApiEnabled:
      typeof record.data.eventsApiEnabled === "boolean"
        ? record.data.eventsApiEnabled
        : undefined,
    testEventCode:
      typeof record.data.testEventCode === "string" && record.data.testEventCode.trim()
        ? record.data.testEventCode.trim()
        : undefined,
    enabledEvents: Array.isArray(record.data.enabledEvents)
      ? record.data.enabledEvents
          .map((item) => String(item ?? "").trim())
          .filter(Boolean)
      : undefined,
    catalogRegionCode:
      typeof record.data.catalogRegionCode === "string" && record.data.catalogRegionCode.trim()
        ? record.data.catalogRegionCode.trim().toUpperCase()
        : undefined,
    updatedAt: record.updatedAt.toISOString(),
  };
}

export async function setTiktokCatalogCredential(
  shop: string,
  payload: Pick<
    TiktokCatalogCredential,
    "accessToken" | "refreshToken" | "advertiserId" | "bcId" | "catalogId" | "catalogName"
  > & {
    /** 省略时保留已有值，缺省 api_managed。 */
    bindingMode?: TiktokCatalogBindingMode;
    /** 省略时保留已有值。 */
    pixelCode?: string;
    /** 省略时保留已有值。 */
    appId?: string;
    /** 省略时保留已有值；传空字符串可清空。 */
    eventsApiAccessToken?: string;
    /** 省略时保留已有值。 */
    eventsApiEnabled?: boolean;
    /** 省略时保留已有值；传空字符串可清空。 */
    testEventCode?: string;
    /** 省略时保留已有值。 */
    enabledEvents?: string[];
    /** 省略时保留已有值。 */
    catalogRegionCode?: string;
  },
): Promise<void> {
  const accessToken = payload.accessToken.trim();
  const advertiserId = payload.advertiserId.trim();
  const catalogId = payload.catalogId.trim();
  if (!accessToken || !advertiserId || !catalogId) {
    throw new Error("TikTok catalog accessToken, advertiserId, and catalogId are required");
  }
  const existing = await readPlatformCredential(shop, TIKTOK_CATALOG_PLATFORM);
  const bcId =
    payload.bcId?.trim() ||
    (typeof existing?.data.bcId === "string" ? existing.data.bcId.trim() : "") ||
    null;
  const bindingMode =
    payload.bindingMode ??
    parseTiktokBindingMode(existing?.data.bindingMode);
  const pixelCode =
    payload.pixelCode?.trim() ||
    (typeof existing?.data.pixelCode === "string" ? existing.data.pixelCode.trim() : "") ||
    null;
  const appId =
    payload.appId?.trim() ||
    (typeof existing?.data.appId === "string" ? existing.data.appId.trim() : "") ||
    null;
  const eventsApiAccessToken =
    payload.eventsApiAccessToken !== undefined
      ? payload.eventsApiAccessToken.trim() || null
      : typeof existing?.data.eventsApiAccessToken === "string" &&
          existing.data.eventsApiAccessToken.trim()
        ? existing.data.eventsApiAccessToken.trim()
        : null;
  const eventsApiEnabled =
    payload.eventsApiEnabled !== undefined
      ? payload.eventsApiEnabled
      : typeof existing?.data.eventsApiEnabled === "boolean"
        ? existing.data.eventsApiEnabled
        : true;
  const testEventCode =
    payload.testEventCode !== undefined
      ? payload.testEventCode.trim() || null
      : typeof existing?.data.testEventCode === "string" && existing.data.testEventCode.trim()
        ? existing.data.testEventCode.trim()
        : null;
  const enabledEvents =
    payload.enabledEvents !== undefined
      ? payload.enabledEvents
      : Array.isArray(existing?.data.enabledEvents)
        ? existing.data.enabledEvents
        : null;
  const catalogRegionCode =
    payload.catalogRegionCode !== undefined
      ? payload.catalogRegionCode.trim().toUpperCase() || null
      : typeof existing?.data.catalogRegionCode === "string" &&
          existing.data.catalogRegionCode.trim()
        ? existing.data.catalogRegionCode.trim().toUpperCase()
        : null;
  await writePlatformCredential(shop, TIKTOK_CATALOG_PLATFORM, {
    accessToken,
    refreshToken: payload.refreshToken?.trim() || null,
    advertiserId,
    bcId,
    catalogId,
    catalogName: payload.catalogName?.trim() || null,
    bindingMode,
    pixelCode,
    appId,
    eventsApiAccessToken,
    eventsApiEnabled,
    testEventCode,
    enabledEvents,
    catalogRegionCode,
  });
}

export const deleteTiktokCatalogCredential = (shop: string) =>
  clearPending(shop, TIKTOK_CATALOG_PLATFORM);

export const setTiktokCatalogPending = (shop: string, payload: PendingOAuthTokens) =>
  setPending(shop, TIKTOK_CATALOG_PENDING_PLATFORM, payload);
export const getTiktokCatalogPending = (shop: string) =>
  getPending(shop, TIKTOK_CATALOG_PENDING_PLATFORM);
export const clearTiktokCatalogPending = (shop: string) =>
  clearPending(shop, TIKTOK_CATALOG_PENDING_PLATFORM);

export async function getTiktokCatalogRegionPreference(shop: string): Promise<string | null> {
  const credential = await getTiktokCatalogCredential(shop);
  if (credential?.catalogRegionCode) return credential.catalogRegionCode;
  const pending = await getTiktokCatalogPending(shop);
  return pending?.catalogRegionCode?.trim().toUpperCase() || null;
}

export async function setTiktokCatalogRegionPreference(
  shop: string,
  regionCode: string,
): Promise<void> {
  const region = regionCode.trim().toUpperCase();
  if (!region) {
    throw new Error("catalogRegionCode is required");
  }
  const credential = await getTiktokCatalogCredential(shop);
  if (credential) {
    await setTiktokCatalogCredential(shop, {
      accessToken: credential.accessToken,
      refreshToken: credential.refreshToken,
      advertiserId: credential.advertiserId,
      bcId: credential.bcId,
      catalogId: credential.catalogId,
      catalogName: credential.catalogName,
      bindingMode: credential.bindingMode,
      pixelCode: credential.pixelCode,
      appId: credential.appId,
      eventsApiAccessToken: credential.eventsApiAccessToken,
      eventsApiEnabled: credential.eventsApiEnabled,
      testEventCode: credential.testEventCode,
      enabledEvents: credential.enabledEvents,
      catalogRegionCode: region,
    });
    return;
  }
  const pending = await getTiktokCatalogPending(shop);
  if (!pending) {
    throw new Error("请先完成 TikTok 授权后再选择目标市场。");
  }
  await setTiktokCatalogPending(shop, {
    ...pending,
    catalogRegionCode: region,
  });
}

/** TikTok Ads 洞察用凭证：已绑定 Catalog 或仅 OAuth 授权（pending）均可。 */
export type TiktokAdsInsightsCredential = {
  accessToken: string;
  refreshToken?: string;
  advertiserId: string;
  bcId?: string;
  catalogId?: string;
  catalogName?: string;
  storage: "credential" | "pending";
};

export async function getTiktokAdsInsightsCredential(
  shop: string,
): Promise<TiktokAdsInsightsCredential | null> {
  const credential = await getTiktokCatalogCredential(shop);
  if (credential) {
    return {
      accessToken: credential.accessToken,
      refreshToken: credential.refreshToken,
      advertiserId: credential.advertiserId,
      bcId: credential.bcId,
      catalogId: credential.catalogId,
      catalogName: credential.catalogName,
      storage: "credential",
    };
  }

  const pending = await getTiktokCatalogPending(shop);
  if (!pending?.accessToken) return null;

  const advertiserId =
    pending.advertiserId?.trim() ||
    pending.accounts.find((account) => account.advertiserId?.trim())?.advertiserId?.trim() ||
    "";
  if (!advertiserId) return null;

  return {
    accessToken: pending.accessToken,
    refreshToken: pending.refreshToken,
    advertiserId,
    bcId: pending.bcId,
    storage: "pending",
  };
}

export async function persistTiktokAdsInsightsTokens(
  shop: string,
  credential: TiktokAdsInsightsCredential,
  tokens: { accessToken: string; refreshToken?: string },
): Promise<void> {
  if (credential.storage === "credential" && credential.catalogId) {
    await setTiktokCatalogCredential(shop, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken ?? credential.refreshToken,
      advertiserId: credential.advertiserId,
      bcId: credential.bcId,
      catalogId: credential.catalogId,
      catalogName: credential.catalogName,
    });
    return;
  }

  const pending = await getTiktokCatalogPending(shop);
  if (!pending) return;
  await setTiktokCatalogPending(shop, {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken ?? pending.refreshToken,
    advertiserId: credential.advertiserId,
    bcId: pending.bcId ?? credential.bcId,
    accounts: pending.accounts,
  });
}

export function maskTokenTail(value: string | null | undefined): string {
  if (!value) return "";
  if (value.length <= 6) return `${value.slice(0, 1)}***`;
  return `${value.slice(0, 3)}***${value.slice(-3)}`;
}
