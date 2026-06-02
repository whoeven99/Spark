import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/tool";
import {
  formatGraphqlErrors,
  parseAdminGraphqlJson,
} from "./parseAdminGraphqlJson.server";

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
        displayName
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

export type ShopBasicInfo = {
  id?: string;
  name?: string;
  myshopifyDomain?: string;
  email?: string;
  contactEmail?: string;
  currencyCode?: string;
  ianaTimezone?: string;
  timezoneAbbreviation?: string;
  url?: string;
  planName?: string;
  shopifyPlus?: boolean;
  partnerDevelopment?: boolean;
  primaryDomainHost?: string;
  primaryDomainUrl?: string;
};

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
        displayName?: string;
        shopifyPlus?: boolean;
        partnerDevelopment?: boolean;
      };
      primaryDomain?: { host?: string; url?: string };
    };
  };
  errors?: Array<{ message?: string }>;
};

function mapShopResponse(shop: NonNullable<ShopBasicInfoResponse["data"]>["shop"]): ShopBasicInfo {
  const planName =
    shop?.plan?.publicDisplayName?.trim() ||
    shop?.plan?.displayName?.trim() ||
    "";

  return {
    id: shop?.id ?? undefined,
    name: shop?.name ?? undefined,
    myshopifyDomain: shop?.myshopifyDomain ?? undefined,
    email: shop?.email ?? undefined,
    contactEmail: shop?.contactEmail ?? undefined,
    currencyCode: shop?.currencyCode ?? undefined,
    ianaTimezone: shop?.ianaTimezone ?? undefined,
    timezoneAbbreviation: shop?.timezoneAbbreviation ?? undefined,
    url: shop?.url ?? undefined,
    planName: planName || undefined,
    shopifyPlus: shop?.plan?.shopifyPlus,
    partnerDevelopment: shop?.plan?.partnerDevelopment,
    primaryDomainHost: shop?.primaryDomain?.host ?? undefined,
    primaryDomainUrl: shop?.primaryDomain?.url ?? undefined,
  };
}

/**
 * 从 Shopify Admin GraphQL 拉取店铺基础信息（供邮件等无 Request 场景使用）。
 */
export async function fetchShopBasicInfo(
  admin: ShopifyAdminGraphqlClient,
): Promise<ShopBasicInfo | null> {
  const httpResponse = await admin.graphql(SHOP_BASIC_INFO_QUERY);

  if (!httpResponse.ok) {
    console.warn(
      `[Shopify] fetchShopBasicInfo HTTP ${httpResponse.status}`,
    );
    return null;
  }

  const payload = await parseAdminGraphqlJson<
    NonNullable<ShopBasicInfoResponse["data"]>
  >(httpResponse);

  if (payload.errors?.length) {
    console.warn(
      "[Shopify] fetchShopBasicInfo GraphQL errors:",
      formatGraphqlErrors(payload.errors),
    );
    return null;
  }

  const shop = payload.data?.shop;
  if (!shop) {
    console.warn("[Shopify] fetchShopBasicInfo missing shop in response");
    return null;
  }

  return mapShopResponse(shop);
}
