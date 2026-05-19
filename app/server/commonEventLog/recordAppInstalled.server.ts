import { getAppEntry } from "../../config/appEntry.server";
import prisma from "../../db.server";
import { appendCommonEventLog } from "./appendCommonEventLog.server";
import { COMMON_EVENT_TYPE } from "./types.server";

/** 根据流水判断当前是否已处于「已安装」状态（最近一条安装晚于最近一条卸载）。 */
async function isAppInstalledInLog(
  shop: string,
  appName: string,
): Promise<boolean> {
  const [lastInstall, lastUninstall] = await Promise.all([
    prisma.commonEventLog.findFirst({
      where: { shop, appName, eventType: COMMON_EVENT_TYPE.APP_INSTALLED },
      orderBy: { createdAt: "desc" },
    }),
    prisma.commonEventLog.findFirst({
      where: { shop, appName, eventType: COMMON_EVENT_TYPE.APP_UNINSTALLED },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  if (!lastInstall) return false;
  if (!lastUninstall) return true;
  return lastInstall.createdAt > lastUninstall.createdAt;
}

/**
 * 在 OAuth 或进入嵌入式 /app 后记录安装。
 * 不用 `session:${sessionId}` 做幂等：offline session id（`offline_${shop}`）重装后不变，会误跳过。
 */
export async function recordAppInstalled(params: {
  shop: string;
  sessionId: string;
  scope?: string | null;
  isOnline?: boolean;
  source?: string;
}): Promise<void> {
  const shop = params.shop.trim();
  if (!shop) return;

  const appName = getAppEntry();

  if (await isAppInstalledInLog(shop, appName)) {
    console.info(
      `[CommonEvent] APP_INSTALLED skipped shop=${shop} appName=${appName} (log shows still installed)`,
    );
    return;
  }

  await appendCommonEventLog({
    shop,
    appName,
    eventType: COMMON_EVENT_TYPE.APP_INSTALLED,
    referenceId: `install:${params.sessionId}:${Date.now()}`,
    metadata: {
      scope: params.scope ?? null,
      isOnline: params.isOnline ?? null,
      sessionId: params.sessionId,
      source: params.source ?? "unknown",
    },
  });

  console.info(
    `[CommonEvent] APP_INSTALLED recorded shop=${shop} appName=${appName} source=${params.source ?? "unknown"}`,
  );
}
