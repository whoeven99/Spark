import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/tool";
import { INSTALL_USER_FROM_SHOP_QUERY } from "../graphql/installUserFromShop.query";
import {
  formatGraphqlErrors,
  parseAdminGraphqlJson,
} from "./parseAdminGraphqlJson.server";
import {
  splitPersonFullName,
  type ShopOwnerProfile,
} from "./installUserProfile.shared.server";

export type { ShopOwnerProfile };

type InstallUserFromShopResponse = {
  shop?: {
    email?: string | null;
    shopOwnerName?: string | null;
  } | null;
};

function mapOwnerFields(
  firstName: string,
  lastName: string,
  email: string,
): ShopOwnerProfile | null {
  if (!firstName && !lastName && !email) return null;
  return { firstName, lastName, email };
}

/**
 * 用 shop.shopOwnerName / shop.email 解析店主信息（无需 read_users）。
 */
export async function fetchInstallUserProfileFromShop(
  admin: ShopifyAdminGraphqlClient,
): Promise<ShopOwnerProfile | null> {
  try {
    const response = await admin.graphql(INSTALL_USER_FROM_SHOP_QUERY);
    const json = await parseAdminGraphqlJson<InstallUserFromShopResponse>(
      response,
    );

    if (json.errors?.length) {
      console.warn(
        "[Shopify][GraphQL] fetchInstallUserProfileFromShop errors:",
        formatGraphqlErrors(json.errors),
      );
      return null;
    }

    const shop = json.data?.shop;
    if (!shop) return null;

    const ownerName = shop.shopOwnerName?.trim() ?? "";
    const email = shop.email?.trim() ?? "";
    if (!ownerName && !email) return null;

    const split = splitPersonFullName(ownerName);
    return mapOwnerFields(split.firstName, split.lastName, email);
  } catch (error) {
    console.warn(
      "[Shopify] fetchInstallUserProfileFromShop failed:",
      error,
    );
    return null;
  }
}
