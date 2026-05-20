import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/tool";
import type { ShopOwnerProfile } from "../shopify/fetchInstallUserProfileFromShop.server";
import { syncProfile } from "../profile/profileSyncService.server";
import type { OAuthSessionUser } from "./syncInstallUserProfile.server";

export type InstallUserProfile = ShopOwnerProfile;

/**
 * 拉取 Shopify 店主信息并写入 Session（firstName / lastName / email）。
 * lastName 对应业务上的 second_name。
 * @deprecated oAuthUser 已不再参与资料合并，仅保留参数兼容。
 */
export async function persistInstallUserProfile(params: {
  shop: string;
  sessionId: string;
  admin: ShopifyAdminGraphqlClient;
  oAuthUser?: OAuthSessionUser;
}): Promise<InstallUserProfile | null> {
  void params.oAuthUser;
  return syncProfile({
    shop: params.shop,
    sessionId: params.sessionId,
    admin: params.admin,
  });
}
