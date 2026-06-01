import prisma from "../../db.server";
import { handleAppUninstalled } from "../commonEventLog/handleAppUninstalled.server";
import { COMMON_EVENT_TYPE } from "../commonEventLog/types.server";
import { sendUninstallFeishuNotify } from "../feishu/scenarios/sendUninstallFeishuNotify.server";
import { notifyAppUninstalledEmail } from "../notifications/notifyMerchant.server";
import { fetchUninstallFeedbackFromPartner } from "../partner/fetchUninstallFeedbackFromPartner.server";

const LOG = "[AppLifecycle:uninstall]";
/** 重复 app/uninstalled 投递时跳过邮件/飞书（持久化仍执行） */
const UNINSTALL_OPS_DEDUP_WINDOW_MS = 10 * 60 * 1000;

export type OnAppUninstalledParams = {
  shop: string;
  topic: string;
  payload: unknown;
  sessionId?: string;
  webhookId?: string;
  appName: string;
  uninstalledAt: Date;
};

async function shouldSkipUninstallOpsNotify(params: {
  shop: string;
  appName: string;
  webhookId?: string;
}): Promise<boolean> {
  if (params.webhookId) {
    const byWebhook = await prisma.commonEventLog.findFirst({
      where: {
        shop: params.shop,
        appName: params.appName,
        eventType: COMMON_EVENT_TYPE.APP_UNINSTALLED,
        referenceId: `uninstall:webhook:${params.webhookId}`,
      },
    });
    if (byWebhook) return true;
  }

  const since = new Date(Date.now() - UNINSTALL_OPS_DEDUP_WINDOW_MS);
  const recent = await prisma.commonEventLog.findFirst({
    where: {
      shop: params.shop,
      appName: params.appName,
      eventType: COMMON_EVENT_TYPE.APP_UNINSTALLED,
      createdAt: { gte: since },
    },
  });
  return Boolean(recent);
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
    webhookId: params.webhookId,
  });

  console.info(
    `${LOG} persistence-done shop=${params.shop} elapsedMs=${Date.now() - startedAt}`,
  );
}

async function sendAppUninstalledFeishuNotify(
  params: OnAppUninstalledParams,
): Promise<void> {
  const startedAt = Date.now();
  console.info(
    `${LOG} feishu-enter shop=${params.shop} appName=${params.appName}`,
  );

  try {
    let feedback: Awaited<
      ReturnType<typeof fetchUninstallFeedbackFromPartner>
    > = null;
    try {
      console.info(
        `${LOG} partner-feedback-start shop=${params.shop} appName=${params.appName}`,
      );
      feedback = await fetchUninstallFeedbackFromPartner(params.shop);
      console.info(
        `${LOG} partner-feedback-end shop=${params.shop} hasFeedback=${Boolean(feedback)} hasReason=${Boolean(feedback?.reason)} hasDescription=${Boolean(feedback?.description)}`,
      );
    } catch (error) {
      console.warn(
        `${LOG} partner-feedback-failed shop=${params.shop}`,
        error,
      );
    }

    const result = await sendUninstallFeishuNotify({
      shop: params.shop,
      appName: params.appName,
      uninstalledAt: params.uninstalledAt,
      uninstallReason: feedback?.reason ?? null,
      uninstallFeedback: feedback?.description ?? null,
    });

    console.info(
      `${LOG} feishu-done shop=${params.shop} elapsedMs=${Date.now() - startedAt} ok=${result.ok} skipped=${"skipped" in result ? result.skipped : false}`,
    );
  } catch (error) {
    console.error(
      `${LOG} feishu-failed shop=${params.shop} elapsedMs=${Date.now() - startedAt}`,
      error,
    );
  }
}

/**
 * 卸载：发飞书通知，再写日志并删 Session。
 */
export async function onAppUninstalled(params: OnAppUninstalledParams): Promise<void> {
  const startedAt = Date.now();
  console.info(
    `${LOG} enter shop=${params.shop} appName=${params.appName} webhookId=${params.webhookId ?? "(none)"}`,
  );

  const skipOpsNotify = await shouldSkipUninstallOpsNotify({
    shop: params.shop,
    appName: params.appName,
    webhookId: params.webhookId,
  });
  if (skipOpsNotify) {
    console.info(
      `${LOG} ops-notify-skipped shop=${params.shop} appName=${params.appName} reason=duplicate`,
    );
  } else {
    await sendAppUninstalledFeishuNotify(params);
    // 必须在 persistAppUninstalled（删除 Session）之前发，否则取不到收件人快照
    await notifyAppUninstalledEmail({
      shop: params.shop,
      appName: params.appName,
      uninstalledAt: params.uninstalledAt,
      sessionId: params.sessionId,
    });
  }

  await persistAppUninstalled(params);

  console.info(
    `${LOG} done shop=${params.shop} elapsedMs=${Date.now() - startedAt}`,
  );
}
