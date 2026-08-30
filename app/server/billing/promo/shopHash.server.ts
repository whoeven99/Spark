import { createHash } from "node:crypto";

/** 规范化店铺域名后再哈希，卸载后仍可防重复领取且不落明文。 */
export function normalizeShopDomain(shop: string): string {
  return shop.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export function hashShopDomain(shop: string): string {
  return createHash("sha256").update(normalizeShopDomain(shop), "utf8").digest("hex");
}
