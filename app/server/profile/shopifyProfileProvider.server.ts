import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/tool";

import { fetchInstallUserProfileFromShop } from "../shopify/fetchInstallUserProfileFromShop.server";

import type { UserProfileFields } from "./profileTypes.server";



const LOG = "[ShopifyProfile]";



/**

 * 从 Shopify GraphQL 拉取店铺店主资料（accountOwner / shopOwnerName / shop.email）。

 */

export async function fetchProfileFromShopify(

  admin: ShopifyAdminGraphqlClient,

): Promise<UserProfileFields | null> {

  console.info(`${LOG} start GraphQL fetch (shop owner only)`);



  try {

    const profile = await fetchInstallUserProfileFromShop(admin);

    if (!profile) {

      console.warn(`${LOG} shop owner profile unresolved`);

      return null;

    }



    console.info(

      `${LOG} GraphQL ok hasFirst=${Boolean(profile.firstName)} hasLast=${Boolean(profile.lastName)} hasEmail=${Boolean(profile.email)}`,

    );

    return profile;

  } catch (error) {

    console.warn(`${LOG} fetchInstallUserProfileFromShop failed`, error);

    return null;

  }

}

