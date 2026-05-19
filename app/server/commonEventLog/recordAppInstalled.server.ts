import { getAppEntry } from "../../config/appEntry.server";
import { appendCommonEventLog } from "./appendCommonEventLog.server";
import { COMMON_EVENT_TYPE } from "./types.server";

/** 在 OAuth 成功后记录安装（Shopify 无官方 app/installed webhook）。 */
export async function recordAppInstalled(params: {
  shop: string;
  sessionId: string;
  scope?: string | null;
  isOnline?: boolean;
}): Promise<void> {
  const shop = params.shop.trim();
  if (!shop) return;

  await appendCommonEventLog({
    shop,
    appName: getAppEntry(),
    eventType: COMMON_EVENT_TYPE.APP_INSTALLED,
    referenceId: `session:${params.sessionId}`,
    metadata: {
      scope: params.scope ?? null,
      isOnline: params.isOnline ?? null,
      source: "oauth_after_auth",
    },
  });
}
