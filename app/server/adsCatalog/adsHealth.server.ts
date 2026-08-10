/**
 * 接入链路健康检查：从已存凭证派生「这条广告链路能不能真的跑起来」。
 *
 * 只读库内凭证 JSON，不调任何平台 API，因此可以直接挂在页面 loader 上。
 * 唯一的例外是 GMC ↔ Google Ads 关联，它的状态只存在于 Google Ads 侧，
 * 这里只判断前置条件是否齐备并标成 `unknown`，由前端按需异步探测。
 *
 * 安全边界：返回值只含账户标识、目录名、AW 标签这类可见信息，绝不带 token。
 */

import {
  getFacebookCatalogCredential,
  getGoogleAdsCredential,
  getGoogleMerchantCredential,
  getMetaAdsCredential,
  getTiktokCatalogCredential,
} from "./credentialStore.server";

export type AdsHealthState = "ok" | "warning" | "missing" | "unknown";

export type AdsHealthCheckKey =
  | "metaCatalog"
  | "metaAds"
  | "gmcAccount"
  | "gmcDataSource"
  | "googleAds"
  | "gmcAdsLink"
  | "googleRemarketing"
  | "tiktokCatalog"
  | "tiktokPixel";

export type AdsHealthPlatform = "meta" | "google" | "tiktok";

export type AdsHealthCheck = {
  key: AdsHealthCheckKey;
  platform: AdsHealthPlatform;
  state: AdsHealthState;
  /** 前端据此选 i18n 文案，避免把中文写进服务端 */
  detailCode: string;
  /** 展示用标识：账户 ID、目录名、AW 标签等，不含任何密钥 */
  reference: string | null;
};

function check(
  key: AdsHealthCheckKey,
  platform: AdsHealthPlatform,
  state: AdsHealthState,
  detailCode: string,
  reference: string | null = null,
): AdsHealthCheck {
  return { key, platform, state, detailCode, reference };
}

/** GMC↔Ads 关联探测的前置条件是否齐备（两侧都已授权）。 */
export function canProbeGmcAdsLink(checks: readonly AdsHealthCheck[]): boolean {
  return checks.some((item) => item.key === "gmcAdsLink" && item.state === "unknown");
}

export async function buildAdsHealthChecks(shop: string): Promise<AdsHealthCheck[]> {
  const [metaCatalog, metaAds, merchant, googleAds, tiktok] = await Promise.all([
    getFacebookCatalogCredential(shop),
    getMetaAdsCredential(shop),
    getGoogleMerchantCredential(shop),
    getGoogleAdsCredential(shop),
    getTiktokCatalogCredential(shop),
  ]);

  const checks: AdsHealthCheck[] = [];

  checks.push(
    metaCatalog
      ? check("metaCatalog", "meta", "ok", "bound", metaCatalog.catalogId)
      : check("metaCatalog", "meta", "missing", "notConnected"),
  );

  checks.push(
    metaAds
      ? check("metaAds", "meta", "ok", "bound", metaAds.adAccountName || metaAds.adAccountId)
      : check("metaAds", "meta", "missing", "notConnected"),
  );

  checks.push(
    merchant
      ? check("gmcAccount", "google", "ok", "bound", merchant.merchantId)
      : check("gmcAccount", "google", "missing", "notConnected"),
  );

  // 没有 primary data source 就写不进商品，同步会整批失败，属于必须暴露的隐性断链。
  if (!merchant) {
    checks.push(check("gmcDataSource", "google", "missing", "requiresMerchant"));
  } else if (!merchant.dataSourceName) {
    checks.push(check("gmcDataSource", "google", "warning", "missingDataSource"));
  } else {
    const scope = [merchant.dataSourceFeedLabel, merchant.dataSourceContentLanguage]
      .filter(Boolean)
      .join(" · ");
    checks.push(check("gmcDataSource", "google", "ok", "ready", scope || null));
  }

  checks.push(
    googleAds
      ? check("googleAds", "google", "ok", "bound", googleAds.customerId)
      : check("googleAds", "google", "missing", "notConnected"),
  );

  checks.push(
    merchant && googleAds
      ? check("gmcAdsLink", "google", "unknown", "needsProbe")
      : check("gmcAdsLink", "google", "missing", "requiresBoth"),
  );

  const remarketing = googleAds?.remarketing;
  if (!googleAds) {
    checks.push(check("googleRemarketing", "google", "missing", "requiresGoogleAds"));
  } else if (!remarketing) {
    checks.push(check("googleRemarketing", "google", "missing", "notConfigured"));
  } else if (remarketing.metafieldSync?.status === "failed") {
    checks.push(check("googleRemarketing", "google", "warning", "metafieldFailed", remarketing.tagId));
  } else if (!remarketing.customPixelConfirmedAt) {
    // purchase 事件靠商户手动装的实验性 Custom Pixel，未确认时再营销受众会缺购买信号。
    checks.push(
      check("googleRemarketing", "google", "warning", "purchaseUnconfirmed", remarketing.tagId),
    );
  } else {
    checks.push(check("googleRemarketing", "google", "ok", "active", remarketing.tagId));
  }

  if (!tiktok) {
    checks.push(check("tiktokCatalog", "tiktok", "missing", "notConnected"));
  } else {
    checks.push(
      check(
        "tiktokCatalog",
        "tiktok",
        "ok",
        tiktok.bindingMode === "shopify_official" ? "shopifyOfficial" : "apiManaged",
        tiktok.catalogName || tiktok.catalogId,
      ),
    );
  }

  if (!tiktok) {
    checks.push(check("tiktokPixel", "tiktok", "missing", "requiresCatalog"));
  } else if (!tiktok.pixelCode) {
    checks.push(check("tiktokPixel", "tiktok", "warning", "noPixel"));
  } else if (tiktok.testEventCode) {
    // 测试事件码没清会把测试流量混进正式数据，比未开 Events API 更值得先提醒。
    checks.push(check("tiktokPixel", "tiktok", "warning", "testModeOn", tiktok.pixelCode));
  } else if (tiktok.eventsApiEnabled && tiktok.eventsApiAccessToken) {
    checks.push(check("tiktokPixel", "tiktok", "ok", "eventsApiOn", tiktok.pixelCode));
  } else {
    checks.push(check("tiktokPixel", "tiktok", "warning", "eventsApiOff", tiktok.pixelCode));
  }

  return checks;
}
