import prisma from "../../db.server";
import { appendCommonEventLog } from "../commonEventLog/appendCommonEventLog.server";
import {
  buildUninstallNotifyReferenceId,
  handleAppUninstalled,
} from "../commonEventLog/handleAppUninstalled.server";
import {
  loadSessionSnapshotForUninstall,
  type UninstallSessionSnapshot,
} from "../commonEventLog/loadSessionSnapshotForUninstall.server";
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

export type AppUninstalledClaim = {
  shouldNotify: boolean;
  recipient: UninstallSessionSnapshot | null;
};

/**
 * 快速幂等检查：
 * 1. 同一 webhookId 的通知键已写过 → 跳过（Shopify 重试）
 * 2. 10 分钟内已有同店卸载事件 → 跳过（防双投）
 * 不再使用永久的 uninstall:notify:{shop}，避免清库前遗留键导致再卸永不通知。
 * 卸载 purge 会保留 APP_UNINSTALLED 行，因此重试在清库后仍能命中。
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

async function loadUninstallRecipient(
  shop: string,
  sessionId?: string,
): Promise<UninstallSessionSnapshot | null> {
  try {
    return await loadSessionSnapshotForUninstall(shop, sessionId);
  } catch (error) {
    console.warn(`${LOG} load-recipient-failed shop=${shop}`, error);
    return null;
  }
}

/**
 * 请求内短路径：读邮件收件人 + 写入 APP_UNINSTALLED 幂等键。
 * 必须在 200 之前完成，这样 Shopify 重试能命中去重。
 */
export async function claimAppUninstalled(
  params: OnAppUninstalledParams,
): Promise<AppUninstalledClaim> {
  console.info(
    `${LOG} enter shop=${params.shop} webhookId=${params.webhookId ?? "(none)"}`,
  );

  const recipient = await loadUninstallRecipient(params.shop, params.sessionId);

  try {
    const skipOpsNotify = await shouldSkipUninstallOpsNotify(
      params.shop,
      params.webhookId,
    );
    if (skipOpsNotify) {
      console.info(`${LOG} ops-notify-skipped shop=${params.shop} reason=duplicate`);
      return { shouldNotify: false, recipient };
    }

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
    if (!created) {
      console.info(
        `${LOG} ops-notify-skipped shop=${params.shop} reason=duplicate referenceId=${referenceId}`,
      );
    }
    return { shouldNotify: created, recipient };
  } catch (error) {
    console.error(`${LOG} ops-notify-dedup-failed shop=${params.shop}`, error);
    return { shouldNotify: true, recipient };
  }
}

/** 后台长路径：归档+清库，再按 claim 决定是否飞书/邮件。 */
export async function completeAppUninstalled(
  params: OnAppUninstalledParams,
  claim: AppUninstalledClaim,
): Promise<void> {
  const startedAt = Date.now();

  await persistAppUninstalled(params);

  if (claim.shouldNotify) {
    await sendAppUninstalledFeishuNotify(params);
    await notifyAppUninstalledEmail({
      shop: params.shop,
      appName: "spark",
      uninstalledAt: params.uninstalledAt,
      recipient: claim.recipient,
    });
  }

  console.info(`${LOG} done shop=${params.shop} elapsedMs=${Date.now() - startedAt}`);
}

/**
 * 卸载：通知幂等占位 → 归档+清库（APP_UNINSTALLED 日志保留至 shop/redact）→ 飞书/邮件。
 * Webhook 路由应先 claim 再后台 complete，以满足 Shopify 5s ack。
 */
export async function onAppUninstalled(params: OnAppUninstalledParams): Promise<void> {
  const claim = await claimAppUninstalled(params);
  await completeAppUninstalled(params, claim);
}
