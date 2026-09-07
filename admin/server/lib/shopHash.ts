import { createHash } from "node:crypto";

/** 与主应用 `app/server/billing/promo/shopHash.server.ts` 保持同一算法。 */
export function normalizeShopDomain(shop: string): string {
  return shop.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export function hashShopDomain(shop: string): string {
  return createHash("sha256").update(normalizeShopDomain(shop), "utf8").digest("hex");
}
