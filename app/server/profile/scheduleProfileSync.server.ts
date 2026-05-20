import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/tool";
import { syncProfile } from "./profileSyncService.server";
import type { SessionAuthSnapshot } from "./profileTypes.server";

const LOG = "[ProfileSync]";

export type ScheduleProfileSyncParams = {
  shop: string;
  sessionId: string;
  admin: ShopifyAdminGraphqlClient;
  sessionFromAuth: SessionAuthSnapshot;
};

/**
 * 非阻塞触发资料同步（用于 /app、OAuth 回调 loader，不拖慢首屏）。
 */
export function scheduleProfileSync(params: ScheduleProfileSyncParams): void {
  console.info(
    `${LOG} scheduled shop=${params.shop} sessionId=${params.sessionId}`,
  );
  void syncProfile({
    shop: params.shop,
    sessionId: params.sessionId,
    admin: params.admin,
    sessionFromAuth: params.sessionFromAuth,
  }).catch((error) => {
    console.error(
      `${LOG} background failed shop=${params.shop} sessionId=${params.sessionId}`,
      error,
    );
  });
}
