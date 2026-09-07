import { createHash } from "node:crypto";

const MYSHOPIFY_DOMAIN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

/** 规范化店铺域名后再哈希，卸载后仍可防重复领取且不落明文。 */
export function normalizeShopDomain(shop: string): string {
  return shop.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
}

/** 仅接受规范化后的 `*.myshopify.com`；其它输入返回 null。 */
export function parseMyshopifyShopDomain(raw: string): string | null {
  const shop = normalizeShopDomain(raw);
  if (!MYSHOPIFY_DOMAIN.test(shop)) return null;
  return shop;
}

export function hashShopDomain(shop: string): string {
  return createHash("sha256").update(normalizeShopDomain(shop), "utf8").digest("hex");
}
