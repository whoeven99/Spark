/**
 * 旧 Product Improve App URL 带了路径前缀（`/app/product-improve`）。
 * Shopify 会把相对 webhook URI 拼成 `/app/product-improve/webhooks/...`。
 * 这些 helper 把 splat 还原成仓库内真实 webhook 路径。
 */
export const LEGACY_PRODUCT_IMPROVE_PATH_PREFIX = "/app/product-improve";

export function canonicalPathFromLegacyProductImproveSplat(
  splat: string | undefined,
): string | null {
  if (!splat) return null;
  const normalized = splat.replace(/^\/+/g, "").replace(/\/+$/g, "");
  if (!normalized) return null;
  return `/${normalized}`;
}

export function isShopifyWebhookPath(pathname: string): boolean {
  return pathname === "/webhooks" || pathname.startsWith("/webhooks/");
}
