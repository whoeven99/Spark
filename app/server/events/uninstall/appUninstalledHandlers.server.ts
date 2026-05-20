import prisma from "../../../db.server";
import { handleAppUninstalled } from "../../commonEventLog/handleAppUninstalled.server";
import { loadSessionSnapshotForUninstall } from "../../commonEventLog/loadSessionSnapshotForUninstall.server";
import { COMMON_EVENT_TYPE } from "../../commonEventLog/types.server";
import { sendUninstallOpsEmail } from "../../email/scenarios/sendUninstallOpsEmail.server";
import type { AppUninstalledEvent } from "./appUninstalledEvent.server";

const LOG = "[UninstallHandler]";

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

async function handleAppUninstalledPersistence(
  event: AppUninstalledEvent,
): Promise<void> {
  const startedAt = Date.now();
  console.info(
    `${LOG} persistence-enter shop=${event.shop} appName=${event.appName} topic=${event.topic} sessionId=${event.sessionId ?? "(none)"}`,
  );

  await handleAppUninstalled({
    shop: event.shop,
    topic: event.topic,
    payload: event.payload,
    sessionId: event.sessionId,
  });

  console.info(
    `${LOG} persistence-done shop=${event.shop} elapsedMs=${Date.now() - startedAt}`,
  );
}

async function handleAppUninstalledEmail(
  event: AppUninstalledEvent,
): Promise<void> {
  const startedAt = Date.now();
  console.info(
    `${LOG} email-handler-enter shop=${event.shop} appName=${event.appName} uninstalledAt=${event.uninstalledAt.toISOString()} topic=${event.topic}`,
  );

  try {
    const installDurationMs = await computeInstallDurationMs(
      event.shop,
      event.appName,
      event.uninstalledAt,
    );
    console.info(
      `${LOG} installDuration computed shop=${event.shop} installDurationMs=${installDurationMs ?? "null"}`,
    );

    console.info(`${LOG} before-loadSessionSnapshot shop=${event.shop}`);
    const sessionSnapshot = await loadSessionSnapshotForUninstall(
      event.shop,
      event.sessionId,
    );
    console.info(
      `${LOG} after-loadSessionSnapshot shop=${event.shop} hasSessionSnapshot=${Boolean(sessionSnapshot)}`,
    );

    console.info(`${LOG} before-sendUninstallOpsEmail shop=${event.shop}`);
    const result = await sendUninstallOpsEmail({
      shop: event.shop,
      appName: event.appName,
      uninstalledAt: event.uninstalledAt,
      installDurationMs,
      sessionSnapshot,
    });
    console.info(
      `${LOG} after-sendUninstallOpsEmail shop=${event.shop} elapsedMs=${Date.now() - startedAt} ok=${result.ok} skipped=${"skipped" in result ? result.skipped : false}`,
    );
  } catch (error) {
    console.error(
      `${LOG} email-handler-failed shop=${event.shop} elapsedMs=${Date.now() - startedAt}`,
      error,
    );
  }
}

/**
 * 卸载 orchestrator：先读 Session 并发邮件，再写日志并删 Session（避免并行删表竞态）。
 */
export async function handleAppUninstalledOrchestrated(
  event: AppUninstalledEvent,
): Promise<void> {
  const startedAt = Date.now();
  console.info(
    `${LOG} orchestrator-enter shop=${event.shop} appName=${event.appName}`,
  );

  await handleAppUninstalledEmail(event);
  await handleAppUninstalledPersistence(event);

  console.info(
    `${LOG} orchestrator-done shop=${event.shop} elapsedMs=${Date.now() - startedAt}`,
  );
}
