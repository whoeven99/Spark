import prisma from "../../db.server";
import { handleAppUninstalled } from "../commonEventLog/handleAppUninstalled.server";
import { loadSessionSnapshotForUninstall } from "../commonEventLog/loadSessionSnapshotForUninstall.server";
import { COMMON_EVENT_TYPE } from "../commonEventLog/types.server";
import { sendUninstallOpsEmail } from "../email/scenarios/sendUninstallOpsEmail.server";

const LOG = "[AppLifecycle:uninstall]";

export type OnAppUninstalledParams = {
  shop: string;
  topic: string;
  payload: unknown;
  sessionId?: string;
  appName: string;
  uninstalledAt: Date;
};

async function computeInstallDurationMs(
  shop: string,
  appName: string,
  uninstalledAt: Date,
): Promise<number | null> {
  const lastInstall = await prisma.commonEventLog.findFirst({
    where: {
      shop,
      appName,
      eventType: COMMON_EVENT_TYPE.APP_INSTALLED,
    },
    orderBy: { createdAt: "desc" },
  });

  if (!lastInstall) return null;
  return uninstalledAt.getTime() - lastInstall.createdAt.getTime();
}

async function persistAppUninstalled(params: OnAppUninstalledParams): Promise<void> {
  const startedAt = Date.now();
  console.info(
    `${LOG} persistence-enter shop=${params.shop} appName=${params.appName} topic=${params.topic} sessionId=${params.sessionId ?? "(none)"}`,
  );

  await handleAppUninstalled({
    shop: params.shop,
    topic: params.topic,
    payload: params.payload,
    sessionId: params.sessionId,
  });

  console.info(
    `${LOG} persistence-done shop=${params.shop} elapsedMs=${Date.now() - startedAt}`,
  );
}

async function sendAppUninstalledOpsEmail(
  params: OnAppUninstalledParams,
): Promise<void> {
  const startedAt = Date.now();
  console.info(
    `${LOG} email-enter shop=${params.shop} appName=${params.appName} uninstalledAt=${params.uninstalledAt.toISOString()} topic=${params.topic}`,
  );

  try {
    const installDurationMs = await computeInstallDurationMs(
      params.shop,
      params.appName,
      params.uninstalledAt,
    );
    console.info(
      `${LOG} installDuration computed shop=${params.shop} installDurationMs=${installDurationMs ?? "null"}`,
    );

    console.info(`${LOG} before-loadSessionSnapshot shop=${params.shop}`);
    const sessionSnapshot = await loadSessionSnapshotForUninstall(
      params.shop,
      params.sessionId,
    );
    console.info(
      `${LOG} after-loadSessionSnapshot shop=${params.shop} hasSessionSnapshot=${Boolean(sessionSnapshot)}`,
    );

    console.info(`${LOG} before-sendUninstallOpsEmail shop=${params.shop}`);
    const result = await sendUninstallOpsEmail({
      shop: params.shop,
      appName: params.appName,
      uninstalledAt: params.uninstalledAt,
      installDurationMs,
      sessionSnapshot,
    });
    console.info(
      `${LOG} after-sendUninstallOpsEmail shop=${params.shop} elapsedMs=${Date.now() - startedAt} ok=${result.ok} skipped=${"skipped" in result ? result.skipped : false}`,
    );
  } catch (error) {
    console.error(
      `${LOG} email-failed shop=${params.shop} elapsedMs=${Date.now() - startedAt}`,
      error,
    );
  }
}

/**
 * 卸载：先读 Session 并发邮件，再写日志并删 Session（避免并行删表竞态）。
 */
export async function onAppUninstalled(params: OnAppUninstalledParams): Promise<void> {
  const startedAt = Date.now();
  console.info(
    `${LOG} enter shop=${params.shop} appName=${params.appName}`,
  );

  await sendAppUninstalledOpsEmail(params);
  await persistAppUninstalled(params);

  console.info(
    `${LOG} done shop=${params.shop} elapsedMs=${Date.now() - startedAt}`,
  );
}
