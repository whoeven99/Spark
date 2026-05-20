import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/tool";

const SHOP_EMAIL_QUERY = `#graphql
  query ShopContactEmail {
    shop {
      email
      contactEmail
    }
  }
`;

type ShopEmailResponse = {
  data?: {
    shop?: {
      email?: string | null;
      contactEmail?: string | null;
    };
  };
};

/**
 * 从 Shopify Admin 获取店铺联系邮箱（对齐 Java UsersDO.getEmail 的替代来源）。
 */
export async function fetchShopContactEmail(
  admin: ShopifyAdminGraphqlClient,
): Promise<string | null> {
  const response = (await admin.graphql(SHOP_EMAIL_QUERY)) as ShopEmailResponse;
  const shop = response.data?.shop;
  const email = shop?.email?.trim() || shop?.contactEmail?.trim();
  return email && email.length > 0 ? email : null;
}
