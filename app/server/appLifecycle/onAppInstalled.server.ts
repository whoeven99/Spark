import { notifyAppInstalledEmail } from "../notifications/notifyMerchant.server";

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

export async function onAppInstalled(params: OnAppInstalledParams): Promise<void> {
  console.info(
    `${LOG} enter shop=${params.shop} appName=${params.appName} source=${params.source ?? "unknown"} sessionId=${params.sessionId} installedAt=${params.installedAt.toISOString()}`,
  );

  await notifyAppInstalledEmail({
    shop: params.shop,
    appName: params.appName,
    installedAt: params.installedAt,
    sessionId: params.sessionId,
  });
}
