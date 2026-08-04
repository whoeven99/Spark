import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";
import { fetchShopBasicInfo } from "../shopify/fetchShopBasicInfo.server";
import {
  fetchTiktokCatalogConf,
  formatTiktokCatalogDiagnostics,
  isApiWritableTiktokCatalog,
  resolveTiktokCatalogRegion,
  validateTiktokCatalogForApiUpload,
} from "./clients/tiktokCatalogClient.server";
import { getTiktokCatalogCredential } from "./credentialStore.server";

export type TiktokSyncPreflightResult = {
  ok: boolean;
  canSync: boolean;
  error?: string;
  warnings: string[];
  catalogId?: string;
  catalogName?: string;
  currency?: string;
  regionCode?: string;
  channel?: string;
  bindingMode?: string;
  shopCurrency?: string;
  inferredShopRegion?: string;
};

/**
 * 同步前校验已绑定的 TikTok Catalog，绝不创建或切换 Catalog。
 */
export async function preflightTiktokCatalogSync(params: {
  shop: string;
  admin: ShopifyAdminGraphqlClient;
  uploadMethod?: "product_upload" | "product_file";
}): Promise<TiktokSyncPreflightResult> {
  const uploadMethod = params.uploadMethod ?? "product_upload";
  const credential = await getTiktokCatalogCredential(params.shop);
  if (!credential?.catalogId) {
    return {
      ok: false,
      canSync: false,
      error: "请先在「凭证」页绑定 TikTok 商品库，或手动创建 Spark Catalog 后再同步。",
      warnings: [],
    };
  }

  const shopInfo = await fetchShopBasicInfo(params.admin);
  const shopCurrency = shopInfo?.currencyCode?.trim().toUpperCase();
  const inferredShopRegion = resolveTiktokCatalogRegion(
    shopInfo?.currencyCode,
    shopInfo?.countryCode,
  ).regionCode;

  const base = {
    catalogId: credential.catalogId,
    catalogName: credential.catalogName,
    bindingMode: credential.bindingMode,
    shopCurrency,
    inferredShopRegion,
    warnings: [] as string[],
  };

  if (credential.bindingMode === "shopify_official") {
    return {
      ...base,
      ok: false,
      canSync: false,
      error:
        "当前绑定的是 TikTok Shopify 官方同步目录，无法通过 Spark API 上传商品。请切换到 API 可写目录，或在 TikTok 后台管理官方同步。",
    };
  }

  const bcId = credential.bcId?.trim() ?? "";
  if (!bcId) {
    return {
      ...base,
      ok: false,
      canSync: false,
      error: "缺少 bc_id，请重新授权 TikTok 后再同步。",
    };
  }

  const conf = await fetchTiktokCatalogConf({
    accessToken: credential.accessToken,
    bcId,
    catalogId: credential.catalogId,
  });

  const warnings: string[] = [];
  const enriched = {
    ...base,
    currency: conf?.currency,
    regionCode: conf?.regionCode,
    channel: conf?.channel,
    warnings,
  };

  if (!conf) {
    warnings.push(
      `无法读取商品库 ${credential.catalogId} 的配置，将尝试使用当前绑定继续同步；若失败请在凭证页切换目录。`,
    );
    return { ...enriched, ok: true, canSync: true };
  }

  if (conf.isShopifyOfficial) {
    return {
      ...enriched,
      ok: false,
      canSync: false,
      error: "当前商品库为 TikTok Shopify 官方同步目录，API 无法写入。请在凭证页切换到 API 可写目录。",
    };
  }

  const sampleCurrency = shopCurrency;
  const validationError = validateTiktokCatalogForApiUpload(conf, sampleCurrency);
  if (validationError) {
    if (uploadMethod === "product_file" && !conf.channel) {
      warnings.push(
        `${validationError} Feed 同步仍将使用您当前绑定的商品库；若入库失败，请在凭证页选择其他目录或新建 Spark Catalog。`,
      );
    } else {
      return {
        ...enriched,
        ok: false,
        canSync: false,
        error: `${validationError} 请切换到币种/区域匹配的商品库，或在凭证页新建 Spark Catalog（不会自动替换当前绑定）。`,
      };
    }
  }

  if (uploadMethod === "product_upload" && !isApiWritableTiktokCatalog(conf)) {
    return {
      ...enriched,
      ok: false,
      canSync: false,
      error: `当前商品库无法通过 JSON API 入库（${formatTiktokCatalogDiagnostics(conf)}）。请使用 Feed 同步，或在凭证页绑定 channel=CLIENT 的 API 商品库。`,
    };
  }

  if (
    conf.regionCode &&
    inferredShopRegion &&
    conf.regionCode !== inferredShopRegion
  ) {
    warnings.push(
      `商品库区域为 ${conf.regionCode}，店铺推断区域为 ${inferredShopRegion}。将使用已绑定商品库（${conf.regionCode}）同步，不会新建目录。`,
    );
  }

  if (conf.currency && shopCurrency && conf.currency !== shopCurrency) {
    warnings.push(
      `商品库币种为 ${conf.currency}，店铺币种为 ${shopCurrency}。请确认商品价格币种与商品库一致。`,
    );
  }

  return { ...enriched, ok: true, canSync: true };
}
