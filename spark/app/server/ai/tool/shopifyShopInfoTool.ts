import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

/** 与 `authenticate.admin` 返回的 `admin` 兼容的最小类型，用于 GraphQL 查询。 */
export type ShopifyAdminGraphqlClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

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
        displayName?: string;
        shopifyPlus?: boolean;
        partnerDevelopment?: boolean;
      };
      primaryDomain?: { host?: string; url?: string };
    };
  };
  errors?: Array<{ message?: string }>;
};

function formatShopBasicInfo(payload: ShopBasicInfoResponse): string {
  const gqlErrors = payload.errors?.map((e) => e.message).filter(Boolean);
  if (gqlErrors?.length) {
    return `查询商店信息失败：${gqlErrors.join("；")}`;
  }

  const shop = payload.data?.shop;
  if (!shop) {
    return "未返回商店数据，请确认应用已正确安装并具有访问权限。";
  }

  const lines: string[] = ["当前商店基础信息："];
  if (shop.name) lines.push(`名称：${shop.name}`);
  if (shop.myshopifyDomain) lines.push(`myshopify 域名：${shop.myshopifyDomain}`);
  const pd = shop.primaryDomain;
  if (pd?.host || pd?.url) {
    const hostPart = pd.host ?? "";
    const urlPart = pd.url ? (pd.host ? `（${pd.url}）` : pd.url) : "";
    lines.push(`主域名：${hostPart}${urlPart}`);
  }
  if (shop.url) lines.push(`网店 URL：${shop.url}`);
  if (shop.email) lines.push(`店主邮箱：${shop.email}`);
  if (shop.contactEmail) lines.push(`联系邮箱：${shop.contactEmail}`);
  if (shop.currencyCode) lines.push(`币种：${shop.currencyCode}`);
  if (shop.ianaTimezone) lines.push(`时区：${shop.ianaTimezone}`);
  if (shop.timezoneAbbreviation) lines.push(`时区缩写：${shop.timezoneAbbreviation}`);
  const planName = shop.plan?.publicDisplayName ?? shop.plan?.displayName ?? "";
  if (planName || shop.plan?.shopifyPlus || shop.plan?.partnerDevelopment) {
    const bits: string[] = [];
    if (planName) bits.push(planName);
    if (shop.plan?.shopifyPlus) bits.push("Shopify Plus");
    if (shop.plan?.partnerDevelopment) bits.push("合作伙伴开发店");
    lines.push(`套餐：${bits.join("，")}`);
  }
  if (shop.id) lines.push(`Shop ID：${shop.id}`);

  return lines.join("\n");
}

export function createShopifyShopInfoTool(admin: ShopifyAdminGraphqlClient) {
  return new DynamicStructuredTool({
    name: "get_shopify_shop_info",
    description:
      "查询当前已授权会话对应的 Shopify 商店基础信息（店名、域名、邮箱、币种、时区、套餐等）。用户询问店铺/商店是谁、域名、币种、时区、套餐时使用。",
    schema: z.object({}),
    func: async () => {
      try {
        const response = await admin.graphql(SHOP_BASIC_INFO_QUERY);
        const payload = (await response.json()) as ShopBasicInfoResponse;

        if (!response.ok) {
          return `查询商店信息失败：HTTP ${response.status}`;
        }

        return formatShopBasicInfo(payload);
      } catch {
        return "查询商店信息失败：网络或接口异常，请稍后重试。";
      }
    },
  });
}
