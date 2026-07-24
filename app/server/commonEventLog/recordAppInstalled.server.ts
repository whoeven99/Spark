import prisma from "../../db.server";
import { onAppInstalled } from "../appLifecycle/onAppInstalled.server";
import { appendCommonEventLog } from "./appendCommonEventLog.server";
import { COMMON_EVENT_TYPE } from "./types.server";

/** 根据流水判断当前是否已处于「已安装」状态（最近一条安装晚于最近一条卸载）。 */
async function isAppInstalledInLog(shop: string): Promise<boolean> {
  const [lastInstall, lastUninstall] = await Promise.all([
    prisma.commonEventLog.findFirst({
      where: { shop, eventType: COMMON_EVENT_TYPE.APP_INSTALLED },
      orderBy: { createdAt: "desc" },
    }),
    prisma.commonEventLog.findFirst({
      where: { shop, eventType: COMMON_EVENT_TYPE.APP_UNINSTALLED },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  if (!lastInstall) return false;
  if (!lastUninstall) return true;
  return lastInstall.createdAt > lastUninstall.createdAt;
}

/**
 * 在 OAuth 或进入嵌入式 /app 后记录安装。
 */
export async function recordAppInstalled(params: {
  shop: string;
  sessionId: string;
  scope?: string | null;
  isOnline?: boolean;
  source?: string;
}): Promise<boolean> {
  const shop = params.shop.trim();
  if (!shop) return false;

  if (await isAppInstalledInLog(shop)) {
    console.info(
      `[CommonEvent] APP_INSTALLED skipped shop=${shop} (log shows still installed)`,
    );
    return false;
  }

  await appendCommonEventLog({
    shop,
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
    `[CommonEvent] APP_INSTALLED recorded shop=${shop} source=${params.source ?? "unknown"}`,
  );

  try {
    console.info(
      `[CommonEvent] before-install-email shop=${shop} source=${params.source ?? "unknown"} sessionId=${params.sessionId}`,
    );
    await onAppInstalled({
      shop,
      sessionId: params.sessionId,
      appName: "spark",
      source: params.source,
      scope: params.scope,
      isOnline: params.isOnline,
      installedAt: new Date(),
    });
    console.info(`[CommonEvent] after-install-email shop=${shop}`);
  } catch (error) {
    console.error(`[CommonEvent] install email failed shop=${shop}:`, error);
  }

  return true;
}
