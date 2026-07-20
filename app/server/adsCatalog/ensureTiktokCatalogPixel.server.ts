import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";
import {
  bindTiktokCatalogPixelEventSource,
  createTiktokPixel,
} from "./clients/tiktokCatalogClient.server";
import {
  getTiktokCatalogCredential,
  setTiktokCatalogCredential,
} from "./credentialStore.server";
import { fetchShopBasicInfo } from "../shopify/fetchShopBasicInfo.server";

const LOG_PREFIX = "[AdsCatalog][EnsurePixel]";

export type EnsureTiktokCatalogPixelResult = {
  pixelCode: string;
  created: boolean;
  bound: boolean;
};

/**
 * 为已连接的 Catalog 确保存在 Pixel，并尝试绑定为 Catalog 事件源。
 * 适用于历史凭证缺少 pixelCode，或创建时 Pixel 绑定静默失败的情况。
 */
export async function ensureTiktokCatalogPixel(params: {
  shop: string;
  admin: ShopifyAdminGraphqlClient;
}): Promise<EnsureTiktokCatalogPixelResult> {
  const credential = await getTiktokCatalogCredential(params.shop);
  if (!credential) {
    throw new Error("TikTok Catalog 尚未连接，请先完成授权。");
  }
  if (!credential.bcId) {
    throw new Error("缺少 bcId，请重新授权 TikTok。");
  }

  let pixelCode = credential.pixelCode?.trim() ?? "";
  let created = false;

  if (!pixelCode) {
    const shopInfo = await fetchShopBasicInfo(params.admin);
    const shopLabel = (shopInfo?.name || params.shop.split(".")[0] || "Store").slice(0, 40);
    const pixel = await createTiktokPixel({
      accessToken: credential.accessToken,
      advertiserId: credential.advertiserId,
      pixelName: `Spark Pixel — ${shopLabel}`,
    });
    pixelCode = pixel.pixelCode;
    created = true;
    console.info(
      `${LOG_PREFIX} step=pixel_created shop=${params.shop} pixelCode=${pixelCode}`,
    );

    await setTiktokCatalogCredential(params.shop, {
      accessToken: credential.accessToken,
      refreshToken: credential.refreshToken,
      advertiserId: credential.advertiserId,
      bcId: credential.bcId,
      catalogId: credential.catalogId,
      catalogName: credential.catalogName,
      bindingMode: credential.bindingMode,
      pixelCode,
      appId: credential.appId,
    });
  }

  let bound = false;
  try {
    await bindTiktokCatalogPixelEventSource({
      accessToken: credential.accessToken,
      advertiserId: credential.advertiserId,
      bcId: credential.bcId,
      catalogId: credential.catalogId,
      pixelCode,
    });
    bound = true;
    console.info(
      `${LOG_PREFIX} step=pixel_bound shop=${params.shop} catalogId=${credential.catalogId} pixelCode=${pixelCode}`,
    );
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    console.warn(
      `${LOG_PREFIX} step=pixel_bind_failed shop=${params.shop} catalogId=${credential.catalogId} pixelCode=${pixelCode} err=${errMsg}`,
    );
    if (created) {
      throw new Error(
        `Pixel 已创建（${pixelCode}），但绑定到 Catalog 失败：${errMsg}`,
      );
    }
    throw new Error(errMsg);
  }

  return { pixelCode, created, bound };
}
