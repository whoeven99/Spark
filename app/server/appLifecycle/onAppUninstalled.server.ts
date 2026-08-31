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
import { archiveAndPurgeShopData } from "../shopDataLifecycle/archiveAndPurgeShop.server";

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
 * 快速幂等检查：
 * 1. 同一 webhookId 的通知键已写过 → 跳过（Shopify 重试）
 * 2. 10 分钟内已有同店卸载事件 → 跳过（防双投）
 * 不再使用永久的 uninstall:notify:{shop}，避免清库前遗留键导致再卸永不通知。
 */
async function shouldSkipUninstallOpsNotify(
  shop: string,
  webhookId?: string,
): Promise<boolean> {
  if (webhookId?.trim()) {
    const notifyReferenceId = buildUninstallNotifyReferenceId(shop, webhookId);
    const byNotifyRef = await prisma.commonEventLog.findFirst({
      where: {
        shop,
        eventType: COMMON_EVENT_TYPE.APP_UNINSTALLED,
        referenceId: notifyReferenceId,
      },
    });
    if (byNotifyRef) return true;
  }

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

/** 清库失败时的最小兜底：积分账户 + 流水 + Session。 */
async function purgeBillingAndSessionFallback(shop: string): Promise<void> {
  await prisma.billingLog.deleteMany({ where: { shop } });
  await prisma.appSubscription.deleteMany({ where: { shop } });
  await prisma.account.deleteMany({ where: { shop } });
  await prisma.session.deleteMany({ where: { shop } });
}

async function persistAppUninstalled(params: OnAppUninstalledParams): Promise<void> {
  const startedAt = Date.now();
  console.info(
    `${LOG} persistence-enter shop=${params.shop} topic=${params.topic} sessionId=${params.sessionId ?? "(none)"}`,
  );

  try {
    await handleAppUninstalled({
      shop: params.shop,
      topic: params.topic,
      payload: params.payload,
      sessionId: params.sessionId,
      webhookId: params.webhookId,
    });
  } catch (error) {
    console.error(`${LOG} handleAppUninstalled failed shop=${params.shop}:`, error);
  }

  try {
    const result = await archiveAndPurgeShopData({
      shop: params.shop,
      mode: "uninstall",
      reason: "app/uninstalled",
    });
    console.info(
      `${LOG} purge-summary shop=${params.shop} accountDeleted=${result.purge.deleted.Account ?? 0} errors=${result.purge.errors.length}`,
    );
    if (result.purge.errors.length > 0) {
      console.error(
        `${LOG} purge had step errors shop=${params.shop}: ${result.purge.errors.join("; ")}`,
      );
      if ((result.purge.deleted.Account ?? 0) === 0) {
        await purgeBillingAndSessionFallback(params.shop);
      }
    }
  } catch (error) {
    console.error(`${LOG} archiveAndPurge failed shop=${params.shop}:`, error);
    try {
      await purgeBillingAndSessionFallback(params.shop);
    } catch (fallbackError) {
      console.error(
        `${LOG} billing/session fallback delete failed shop=${params.shop}`,
        fallbackError,
      );
    }
  }

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
 * 卸载：通知幂等占位 → 归档+清库（含 CommonEventLog，快照在 Blob）→ 飞书/邮件。
 */
export async function onAppUninstalled(params: OnAppUninstalledParams): Promise<void> {
  const startedAt = Date.now();
  console.info(
    `${LOG} enter shop=${params.shop} webhookId=${params.webhookId ?? "(none)"}`,
  );

  let recipient: Awaited<ReturnType<typeof loadSessionSnapshotForUninstall>> = null;
  try {
    recipient = await loadSessionSnapshotForUninstall(params.shop, params.sessionId);
  } catch (error) {
    console.warn(`${LOG} load-recipient-failed shop=${params.shop}`, error);
  }

  // 1. 清库前占 notify 幂等键（并发双投去重；清库后日志进 Blob 并删除）
  let shouldNotify = false;
  try {
    const skipOpsNotify = await shouldSkipUninstallOpsNotify(
      params.shop,
      params.webhookId,
    );
    if (skipOpsNotify) {
      console.info(`${LOG} ops-notify-skipped shop=${params.shop} reason=duplicate`);
    } else {
      const referenceId = buildUninstallNotifyReferenceId(
        params.shop,
        params.webhookId,
      );
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
      shouldNotify = created;
      if (!created) {
        console.info(
          `${LOG} ops-notify-skipped shop=${params.shop} reason=duplicate referenceId=${referenceId}`,
        );
      }
    }
  } catch (error) {
    console.error(`${LOG} ops-notify-dedup-failed shop=${params.shop}`, error);
    shouldNotify = true;
  }

  // 2. 归档到 Blob 后清库（含 Account / CommonEventLog / Session 等）
  await persistAppUninstalled(params);

  // 3. 通知（清库已完成；失败不影响合规删除）
  if (shouldNotify) {
    await sendAppUninstalledFeishuNotify(params);
    await notifyAppUninstalledEmail({
      shop: params.shop,
      appName: "spark",
      uninstalledAt: params.uninstalledAt,
      recipient,
    });
  }

  console.info(`${LOG} done shop=${params.shop} elapsedMs=${Date.now() - startedAt}`);
}
