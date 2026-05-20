import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/tool";
import { diffProfileFields, diffTokenFields } from "./profileDiff.server";
import {
  patchBySessionId,
  patchProfileByShop,
  readSessionFields,
} from "./profileService.server";
import { fetchProfileFromShopify } from "./shopifyProfileProvider.server";
import type {
  SessionAuthSnapshot,
  UserProfileFields,
} from "./profileTypes.server";

const LOG = "[ProfileSync]";

export type ProfileSyncParams = {
  shop: string;
  sessionId: string;
  admin?: ShopifyAdminGraphqlClient;
  sessionFromAuth?: SessionAuthSnapshot;
};

export async function syncProfile(
  params: ProfileSyncParams,
): Promise<UserProfileFields | null> {
  const shop = params.shop.trim();
  const sessionId = params.sessionId.trim();
  if (!shop || !sessionId) return null;

  console.info(`${LOG} start shop=${shop} sessionId=${sessionId}`);

  let admin = params.admin;
  if (!admin) {
    const { unauthenticated } = await import("../../shopify.server");
    const loaded = await unauthenticated.admin(shop);
    admin = loaded.admin;
  }

  const dbRow = await readSessionFields(shop, sessionId);

  const fromGraphQL = await fetchProfileFromShopify(admin);
  if (fromGraphQL) {
    const profilePatch = diffProfileFields(dbRow, fromGraphQL);
    if (profilePatch) {
      console.info(
        `${LOG} profile diff keys=${Object.keys(profilePatch).join(",")}`,
      );
      await patchProfileByShop(shop, profilePatch);
      console.info(`${LOG} profile update success shop=${shop}`);
    } else {
      console.info(`${LOG} profile unchanged shop=${shop}`);
    }
  } else {
    console.warn(
      `${LOG} GraphQL profile empty shop=${shop}, skip profile write`,
    );
  }

  if (params.sessionFromAuth) {
    const tokenPatch = diffTokenFields(dbRow, params.sessionFromAuth);
    if (tokenPatch) {
      console.info(
        `${LOG} token diff keys=${Object.keys(tokenPatch).join(",")}`,
      );
      try {
        await patchBySessionId(sessionId, tokenPatch);
        console.info(`${LOG} token update success sessionId=${sessionId}`);
      } catch (error) {
        console.error(
          `${LOG} token update failed sessionId=${sessionId}`,
          error,
        );
      }
    }
  }

  return fromGraphQL;
}
