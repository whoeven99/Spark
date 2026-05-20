import { loadSessionSnapshotForUninstall } from "../../commonEventLog/loadSessionSnapshotForUninstall.server";
import { sendInstallOpsEmail } from "../../email/scenarios/sendInstallOpsEmail.server";
import { fetchShopBasicInfo } from "../../shopify/fetchShopBasicInfo.server";
import type { AppInstalledEvent } from "./appInstalledEvent.server";

const LOG = "[InstallHandler]";

async function loadAdminForInstall(shop: string) {
  const { unauthenticated } = await import("../../../shopify.server");
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

export async function handleAppInstalledEmail(
  event: AppInstalledEvent,
): Promise<void> {
  const startedAt = Date.now();
  console.info(
    `${LOG} handler-enter shop=${event.shop} appName=${event.appName} source=${event.source ?? "unknown"} sessionId=${event.sessionId} installedAt=${event.installedAt.toISOString()}`,
  );

  try {
    let sessionSnapshot = null;
    try {
      sessionSnapshot = await loadSessionSnapshotForUninstall(
        event.shop,
        event.sessionId,
      );
      console.info(
        `${LOG} sessionSnapshot shop=${event.shop} hasSnapshot=${Boolean(sessionSnapshot)}`,
      );
    } catch (error) {
      console.warn(
        `${LOG} loadSessionSnapshot failed shop=${event.shop}`,
        error,
      );
    }

    console.info(`${LOG} before-fetchShopInfo shop=${event.shop}`);
    const shopInfo = await loadShopInfoForInstall(event.shop);
    console.info(
      `${LOG} after-fetchShopInfo shop=${event.shop} hasShopInfo=${Boolean(shopInfo)} shopName=${shopInfo?.name ?? "(none)"}`,
    );

    console.info(`${LOG} before-sendInstallOpsEmail shop=${event.shop}`);
    const result = await sendInstallOpsEmail({
      shop: event.shop,
      appName: event.appName,
      source: event.source,
      installedAt: event.installedAt,
      shopInfo,
      sessionSnapshot,
    });
    console.info(
      `${LOG} after-sendInstallOpsEmail shop=${event.shop} elapsedMs=${Date.now() - startedAt} ok=${result.ok} skipped=${"skipped" in result ? result.skipped : false}`,
    );
  } catch (error) {
    console.error(
      `${LOG} handler-failed shop=${event.shop} elapsedMs=${Date.now() - startedAt}`,
      error,
    );
  }
}
