import prisma from "../../db.server";
import { appendCommonEventLog } from "../commonEventLog/appendCommonEventLog.server";
import {
  buildUninstallNotifyReferenceId,
  handleAppUninstalled,
} from "../commonEventLog/handleAppUninstalled.server";
import { loadSessionSnapshotForUninstall } from "../commonEventLog/loadSessionSnapshotForUninstall.server";
import { COMMON_EVENT_TYPE } from "../commonEventLog/types.server";
import { sendUninstallFeishuNotify } from "../feishu/scenarios/sendUninstallFeishuNotify.server";
import { notifyAppUninstalledEmail } from "../notifications/notifyMerchant.server";
import { fetchUninstallFeedbackFromPartner } from "../partner/fetchUninstallFeedbackFromPartner.server";
const LOG = "[AppLifecycle:uninstall]";
const UNINSTALL_OPS_DEDUP_WINDOW_MS = 10 * 60 * 1000;

export type OnAppUninstalledParams = {
  shop: string;
  topic: string;
  payload: unknown;
  sessionId?: string;
  webhookId?: string;
  uninstalledAt: Date;
};

/**
 * 快速幂等检查（两层）：
 * 1. 店铺级通知幂等键 uninstall:notify:{shop}
 * 2. 10 分钟窗口内已有同店铺卸载事件
 */
async function shouldSkipUninstallOpsNotify(shop: string): Promise<boolean> {
  const notifyReferenceId = buildUninstallNotifyReferenceId(shop);
  const byNotifyRef = await prisma.commonEventLog.findFirst({
    where: {
      shop,
      eventType: COMMON_EVENT_TYPE.APP_UNINSTALLED,
      referenceId: notifyReferenceId,
    },
  });
  if (byNotifyRef) return true;

  const since = new Date(Date.now() - UNINSTALL_OPS_DEDUP_WINDOW_MS);
  const recent = await prisma.commonEventLog.findFirst({
    where: {
      shop,
      eventType: COMMON_EVENT_TYPE.APP_UNINSTALLED,
      createdAt: { gte: since },
    },
  });
  return Boolean(recent);
}

async function persistAppUninstalled(params: OnAppUninstalledParams): Promise<void> {
  const startedAt = Date.now();
  console.info(
    `${LOG} persistence-enter shop=${params.shop} topic=${params.topic} sessionId=${params.sessionId ?? "(none)"}`,
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
  console.info(`${LOG} feishu-enter shop=${params.shop}`);

  try {
    let feedback: Awaited<
      ReturnType<typeof fetchUninstallFeedbackFromPartner>
    > = null;
    try {
      console.info(`${LOG} partner-feedback-start shop=${params.shop}`);
      feedback = await fetchUninstallFeedbackFromPartner(params.shop);
      console.info(
        `${LOG} partner-feedback-end shop=${params.shop} hasFeedback=${Boolean(feedback)}`,
      );
    } catch (error) {
      console.warn(`${LOG} partner-feedback-failed shop=${params.shop}`, error);
    }

    const result = await sendUninstallFeishuNotify({
      shop: params.shop,
      appName: "spark",
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
 * 卸载：两层幂等门禁，再删 Session。
 *
 * 执行顺序：
 * 1. 加载收件人快照（Session 删除前）
 * 2. shouldSkipUninstallOpsNotify（webhookId / 10min 窗口）→ 快速跳过
 * 3. appendCommonEventLog（referenceId 精确去重）→ created=true 则首次，发飞书+邮件
 * 4. persistAppUninstalled（内部 appendCommonEventLog 因 dedup 幂等，deleteSessionsForShop 正常执行）
 */
export async function onAppUninstalled(params: OnAppUninstalledParams): Promise<void> {
  const startedAt = Date.now();
  console.info(
    `${LOG} enter shop=${params.shop} webhookId=${params.webhookId ?? "(none)"}`,
  );

  // 1. 在删除 Session 之前加载收件人快照
  let recipient: Awaited<ReturnType<typeof loadSessionSnapshotForUninstall>> = null;
  try {
    recipient = await loadSessionSnapshotForUninstall(params.shop, params.sessionId);
  } catch (error) {
    console.warn(`${LOG} load-recipient-failed shop=${params.shop}`, error);
  }

  // 2. 快速幂等检查（店铺级 notify 键 + 10min 窗口）
  const skipOpsNotify = await shouldSkipUninstallOpsNotify(params.shop);

  if (skipOpsNotify) {
    console.info(`${LOG} ops-notify-skipped shop=${params.shop} reason=duplicate`);
  } else {
    // 3. 店铺级幂等门禁：并发/重试 webhook 共用同一 referenceId，唯一约束兜底
    const referenceId = buildUninstallNotifyReferenceId(params.shop);
    const { created } = await appendCommonEventLog({
      shop: params.shop,
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
        appName: "spark",
        uninstalledAt: params.uninstalledAt,
        recipient,
      });
    } else {
      console.info(
        `${LOG} ops-notify-skipped shop=${params.shop} reason=duplicate referenceId=${referenceId}`,
      );
    }
  }

  // 4. 持久化（appendCommonEventLog 内部 dedup 幂等，deleteSessionsForShop 正常执行）
  await persistAppUninstalled(params);

  console.info(`${LOG} done shop=${params.shop} elapsedMs=${Date.now() - startedAt}`);
}
