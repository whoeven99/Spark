import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/tool";
import type { ShopBasicFacts } from "./types.server";

const SHOP_BASIC_INFO_QUERY = `#graphql
  query ShopBasicInfo {
    shop {
      id
      name
      myshopifyDomain
      email
      contactEmail
      currencyCode
      ianaTimezone
      timezoneAbbreviation
      url
      plan {
        publicDisplayName
        shopifyPlus
        partnerDevelopment
      }
      primaryDomain {
        host
        url
      }
    }
  }
`;

type ShopBasicInfoResponse = {
  data?: {
    shop?: {
      id?: string;
      name?: string;
      myshopifyDomain?: string;
      email?: string;
      contactEmail?: string;
      currencyCode?: string;
      ianaTimezone?: string;
      timezoneAbbreviation?: string;
      url?: string;
      plan?: {
        publicDisplayName?: string;
        shopifyPlus?: boolean;
        partnerDevelopment?: boolean;
      };
      primaryDomain?: { host?: string; url?: string };
    };
  };
  errors?: Array<{ message?: string }>;
};

/**
 * 安装 / 刷新画像时拉取 Shopify 店铺基础信息（不含订单与 PII 明细）。
 */
export async function fetchShopBasicFacts(
  admin: ShopifyAdminGraphqlClient,
): Promise<ShopBasicFacts | null> {
  const response = await admin.graphql(SHOP_BASIC_INFO_QUERY);
  const payload = (await response.json()) as ShopBasicInfoResponse;

  if (!response.ok) {
    const msg = payload.errors?.map((e) => e.message).filter(Boolean).join("；");
    throw new Error(msg || `Shopify HTTP ${response.status}`);
  }

  const gqlErrors = payload.errors?.map((e) => e.message).filter(Boolean);
  if (gqlErrors?.length) {
    throw new Error(gqlErrors.join("；"));
  }

  const shop = payload.data?.shop;
  if (!shop?.id || !shop.name || !shop.myshopifyDomain) {
    return null;
  }

  return {
    shopId: shop.id,
    name: shop.name,
    myshopifyDomain: shop.myshopifyDomain,
    email: shop.email ?? undefined,
    contactEmail: shop.contactEmail ?? undefined,
    currencyCode: shop.currencyCode ?? undefined,
    ianaTimezone: shop.ianaTimezone ?? undefined,
    timezoneAbbreviation: shop.timezoneAbbreviation ?? undefined,
    shopUrl: shop.url ?? undefined,
    planDisplayName: shop.plan?.publicDisplayName ?? undefined,
    shopifyPlus: shop.plan?.shopifyPlus ?? undefined,
    partnerDevelopment: shop.plan?.partnerDevelopment ?? undefined,
    primaryDomainHost: shop.primaryDomain?.host ?? undefined,
    primaryDomainUrl: shop.primaryDomain?.url ?? undefined,
  };
}
