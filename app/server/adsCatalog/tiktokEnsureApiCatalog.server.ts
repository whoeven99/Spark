import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";
import { createTiktokCatalog } from "./clients/tiktokCatalogClient.server";
import {
  clearTiktokCatalogPending,
  getTiktokCatalogCredential,
  getTiktokCatalogPending,
  setTiktokCatalogCredential,
} from "./credentialStore.server";
import { listAccessibleBcIds } from "./tiktokOAuth.server";
import { fetchShopBasicInfo } from "../shopify/fetchShopBasicInfo.server";

export type EnsureTiktokApiCatalogResult = {
  catalogId: string;
  catalogName: string;
  created: boolean;
  bindingMode: "api_managed";
};

/**
 * 确保店铺绑定的是 Spark API 可写 Catalog（Path B）。
 * - 已是 api_managed：直接返回当前目录
 * - 否则：用已有 token 新建 Spark Catalog 并切换 bindingMode
 */
export async function ensureTiktokApiManagedCatalog(params: {
  shop: string;
  admin: ShopifyAdminGraphqlClient;
}): Promise<EnsureTiktokApiCatalogResult> {
  const credential = await getTiktokCatalogCredential(params.shop);
  if (credential?.bindingMode === "api_managed" && credential.catalogId) {
    return {
      catalogId: credential.catalogId,
      catalogName: credential.catalogName || credential.catalogId,
      created: false,
      bindingMode: "api_managed",
    };
  }

  const pending = await getTiktokCatalogPending(params.shop);
  const accessToken = credential?.accessToken || pending?.accessToken || "";
  const refreshToken = credential?.refreshToken || pending?.refreshToken;
  const advertiserId =
    credential?.advertiserId?.trim() ||
    pending?.advertiserId?.trim() ||
    pending?.accounts.find((a) => a.advertiserId?.trim())?.advertiserId?.trim() ||
    "";

  if (!accessToken) {
    throw new Error("请先完成 TikTok 授权后再使用 API 上传同步。");
  }
  if (!advertiserId) {
    throw new Error("缺少 advertiserId，请重新授权 TikTok。");
  }

  let bcId =
    credential?.bcId?.trim() ||
    pending?.bcId?.trim() ||
    pending?.accounts.find((a) => a.businessId?.trim())?.businessId?.trim() ||
    "";
  if (!bcId) {
    const bcIds = await listAccessibleBcIds({ accessToken });
    bcId = bcIds[0] ?? "";
  }
  if (!bcId) {
    throw new Error("缺少 bc_id，请重新授权 TikTok。");
  }

  const shopInfo = await fetchShopBasicInfo(params.admin);
  const shopLabel = (shopInfo?.name || params.shop.split(".")[0] || "Store").slice(0, 40);
  const created = await createTiktokCatalog({
    accessToken,
    bcId,
    name: `Spark Catalog — ${shopLabel}`,
    currency: shopInfo?.currencyCode,
  });

  if (pending) {
    await clearTiktokCatalogPending(params.shop);
  }
  await setTiktokCatalogCredential(params.shop, {
    accessToken,
    refreshToken,
    advertiserId,
    bcId,
    catalogId: created.catalogId,
    catalogName: created.catalogName,
    bindingMode: "api_managed",
  });

  return {
    catalogId: created.catalogId,
    catalogName: created.catalogName,
    created: true,
    bindingMode: "api_managed",
  };
}
