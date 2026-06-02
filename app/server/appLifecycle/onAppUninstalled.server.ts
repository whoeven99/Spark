import { appendCommonEventLog } from "../commonEventLog/appendCommonEventLog.server";
import {
  buildUninstallEventReferenceId,
  handleAppUninstalled,
} from "../commonEventLog/handleAppUninstalled.server";
import { loadSessionSnapshotForUninstall } from "../commonEventLog/loadSessionSnapshotForUninstall.server";
import { COMMON_EVENT_TYPE } from "../commonEventLog/types.server";
import { sendUninstallFeishuNotify } from "../feishu/scenarios/sendUninstallFeishuNotify.server";
import { notifyAppUninstalledEmail } from "../notifications/notifyMerchant.server";
import { fetchUninstallFeedbackFromPartner } from "../partner/fetchUninstallFeedbackFromPartner.server";

const LOG = "[AppLifecycle:uninstall]";

export type OnAppUninstalledParams = {
  shop: string;
  topic: string;
  payload: unknown;
  sessionId?: string;
  webhookId?: string;
  appName: string;
  uninstalledAt: Date;
};

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
 * 卸载：提前写 CommonEventLog 作幂等门禁（首次写入者发通知），再删 Session。
 *
 * 执行顺序：
 * 1. 加载收件人快照（Session 删除前）
 * 2. 提前写 CommonEventLog（referenceId 去重）→ created=true 则首次，发飞书+邮件
 * 3. persistAppUninstalled（内部的 appendCommonEventLog 因 dedup 幂等，deleteSessionsForShop 正常执行）
 */
export async function onAppUninstalled(params: OnAppUninstalledParams): Promise<void> {
  const startedAt = Date.now();
  console.info(
    `${LOG} enter shop=${params.shop} appName=${params.appName} webhookId=${params.webhookId ?? "(none)"}`,
  );

  // 1. 在删除 Session 之前加载收件人快照
  let recipient: Awaited<ReturnType<typeof loadSessionSnapshotForUninstall>> = null;
  try {
    recipient = await loadSessionSnapshotForUninstall(params.shop, params.sessionId);
  } catch (error) {
    console.warn(`${LOG} load-recipient-failed shop=${params.shop}`, error);
  }

  // 2. 提前写日志作幂等门禁：第一条 Webhook 写入成功（created=true），后续重复投递找到已有记录（created=false）
  const referenceId = buildUninstallEventReferenceId({
    shop: params.shop,
    appName: params.appName,
    webhookId: params.webhookId,
    sessionId: params.sessionId,
  });
  const { created } = await appendCommonEventLog({
    shop: params.shop,
    appName: params.appName,
    eventType: COMMON_EVENT_TYPE.APP_UNINSTALLED,
    topic: params.topic,
    referenceId,
    payload:
      params.payload && typeof params.payload === "object"
        ? (params.payload as Record<string, unknown>)
        : { raw: params.payload },
  });

  if (created) {
    await sendAppUninstalledFeishuNotify(params);
    // 传入预加载的收件人快照，Session 删除前已缓存
    await notifyAppUninstalledEmail({
      shop: params.shop,
      appName: params.appName,
      uninstalledAt: params.uninstalledAt,
      recipient,
    });
  } else {
    console.info(
      `${LOG} ops-notify-skipped shop=${params.shop} appName=${params.appName} reason=duplicate referenceId=${referenceId}`,
    );
  }

  // 3. 持久化（appendCommonEventLog 内部 dedup 幂等，deleteSessionsForShop 正常执行）
  await persistAppUninstalled(params);

  console.info(
    `${LOG} done shop=${params.shop} elapsedMs=${Date.now() - startedAt}`,
  );
}
