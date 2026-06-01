import { loadSessionSnapshotForUninstall } from "../commonEventLog/loadSessionSnapshotForUninstall.server";
import { sendNotificationEmail } from "../email/scenarios/sendNotificationEmail.server";
import { buildAppInstalledVariables } from "../notifications/buildNotificationVariables.server";
import { fetchShopBasicInfo } from "../shopify/fetchShopBasicInfo.server";

const LOG = "[AppLifecycle:install]";

export type OnAppInstalledParams = {
  shop: string;
  sessionId: string;
  appName: string;
  source?: string;
  scope?: string | null;
  isOnline?: boolean | null;
  installedAt: Date;
};

async function loadAdminForInstall(shop: string) {
  const { unauthenticated } = await import("../../shopify.server");
  return unauthenticated.admin(shop);
}

async function loadShopInfoForInstall(shop: string) {
  try {
    const { admin } = await loadAdminForInstall(shop);
    return await fetchShopBasicInfo(admin);
  } catch (error) {
    console.warn(`${LOG} fetchShopBasicInfo failed shop=${shop}`, error);
    return null;
  }
}

export async function onAppInstalled(params: OnAppInstalledParams): Promise<void> {
  const startedAt = Date.now();
  console.info(
    `${LOG} enter shop=${params.shop} appName=${params.appName} source=${params.source ?? "unknown"} sessionId=${params.sessionId} installedAt=${params.installedAt.toISOString()}`,
  );

  try {
    let sessionSnapshot = null;
    try {
      sessionSnapshot = await loadSessionSnapshotForUninstall(
        params.shop,
        params.sessionId,
      );
      console.info(
        `${LOG} sessionSnapshot shop=${params.shop} hasSnapshot=${Boolean(sessionSnapshot)}`,
      );
    } catch (error) {
      console.warn(
        `${LOG} loadSessionSnapshot failed shop=${params.shop}`,
        error,
      );
    }

    console.info(`${LOG} before-fetchShopInfo shop=${params.shop}`);
    const shopInfo = await loadShopInfoForInstall(params.shop);
    console.info(
      `${LOG} after-fetchShopInfo shop=${params.shop} hasShopInfo=${Boolean(shopInfo)} shopName=${shopInfo?.name ?? "(none)"}`,
    );

    console.info(`${LOG} before-sendNotificationEmail shop=${params.shop}`);
    const variables = buildAppInstalledVariables({
      shop: params.shop,
      installedAt: params.installedAt,
      shopInfo,
      sessionSnapshot,
    });
    const result = await sendNotificationEmail({
      event: "appInstalled",
      shop: params.shop,
      appKey: params.appName,
      variables,
      sessionSnapshot,
    });
    console.info(
      `${LOG} after-sendNotificationEmail ${JSON.stringify({
        shop: params.shop,
        elapsedMs: Date.now() - startedAt,
        sendSuccess: result.ok,
        skipped: "skipped" in result ? result.skipped : false,
        reason: "skipped" in result && result.skipped ? result.reason : undefined,
        requestId: result.ok ? result.requestId : undefined,
        errorCode: !result.ok && !("skipped" in result) ? result.error?.code : undefined,
        errorMessage: !result.ok && !("skipped" in result) ? result.error?.message : undefined,
      })}`,
    );
  } catch (error) {
    console.error(
      `${LOG} failed shop=${params.shop} elapsedMs=${Date.now() - startedAt}`,
      error,
    );
  }
}
