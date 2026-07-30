export type TiktokCatalogSyncStatus = "official" | "syncable" | "not_syncable" | "unknown";

/** catalog/get 必须明确返回 channel=CLIENT；缺失 channel 视为不可 API 同步（常见于后台手动建库）。 */
export function isTiktokCatalogApiSyncable(conf: {
  channel?: string;
  isShopifyOfficial?: boolean;
  bindingMode?: string;
}): boolean {
  if (conf.isShopifyOfficial || conf.bindingMode === "shopify_official") return false;
  return conf.channel === "CLIENT";
}

export function resolveTiktokCatalogSyncStatus(params: {
  bindingMode?: string;
  channel?: string;
  isShopifyOfficial?: boolean;
}): TiktokCatalogSyncStatus {
  if (params.isShopifyOfficial || params.bindingMode === "shopify_official") {
    return "official";
  }
  // 仅 channel=CLIENT 可同步；缺失 channel 视为不可同步（多为 TikTok 后台手动建库）。
  return params.channel === "CLIENT" ? "syncable" : "not_syncable";
}
