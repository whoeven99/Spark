export const SHOPIFY_ADMIN_API_VERSION = "2026-07";

export function buildShopifyAdminGraphqlUrl(shopDomain: string): string {
  return `https://${shopDomain}/admin/api/${SHOPIFY_ADMIN_API_VERSION}/graphql.json`;
}
