import type { InstallUserProfile } from "./persistInstallUserProfile.server";
import { syncProfile } from "../profile/profileSyncService.server";
import type { SessionAuthSnapshot } from "../profile/profileTypes.server";

const LOG = "[SyncInstallUserProfile]";

/** @deprecated 资料合并不再使用 OAuth 字段；保留类型兼容。 */
export type OAuthSessionUser = {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
};

/**
 * 在 OAuth 回调或进入 /app 后同步用户资料到 Session（不依赖 APP_INSTALLED 事件）。
 * @deprecated 打开应用请用 scheduleProfileSync；oAuthUser 已忽略。
 */
export async function syncInstallUserProfile(params: {
  shop: string;
  sessionId: string;
  oAuthUser?: OAuthSessionUser;
  sessionFromAuth?: SessionAuthSnapshot;
}): Promise<InstallUserProfile | null> {
  void params.oAuthUser;
  const shop = params.shop.trim();
  if (!shop) return null;

  try {
    const { unauthenticated } = await import("../../shopify.server");
    const { admin } = await unauthenticated.admin(shop);
    return await syncProfile({
      shop,
      sessionId: params.sessionId,
      admin,
      sessionFromAuth: params.sessionFromAuth,
    });
  } catch (error) {
    console.warn(`${LOG} failed shop=${shop}`, error);
    return null;
  }
}
