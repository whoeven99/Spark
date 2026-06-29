/**
 * emailWorker — 翻译完成通知邮件发送 worker。
 *
 * 每次运行：
 *  1. 找出 COMPLETED / PAUSED、未发邮件的任务。
 *     收件人邮箱在发信时通过 Shopify GraphQL 实时查询（不用 Session 快照）。
 *  2. 手动任务（taskSource ≠ TsFrontend-Auto）：每个任务独立发一封邮件。
 *  3. 自动任务（taskSource = TsFrontend-Auto）：等同店内所有进行中自动任务结束后，
 *     查询该店全部待发 auto 任务并汇总发一封（对齐 Spring TranslateTask.sendEmail）。
 *     usedTokens=0 的语言不出现在邮件正文，但仍 mark emailSent。
 *  4. 发送成功后将 emailSent=true 写回 Cosmos，防止重发。
 *
 * 任务类型对应模板（对齐 Spring TencentEmailService）：
 *   manual + COMPLETED → 137353 手动翻译成功
 *   auto   + COMPLETED → 140352 自动翻译成功（同店多语言合并）
 *   manual/auto + PAUSED → 159297 翻译部分完成（额度不足）
 */

import type { TranslationV4Job } from "../services/cosmosV4.js";
import {
  findAutoJobsNeedingEmailForShop,
  findJobsNeedingEmail,
  findShopsWithPendingAutoEmail,
  hasActiveAutoJobsForShop,
  isAutoTranslationJob,
  prefersStoredToken,
  updateJob,
} from "../services/cosmosV4.js";
import { fetchShopContact } from "../services/shopEmail.js";
import {
  sendManualTranslationSuccessEmail,
  sendAutoTranslationSuccessEmail,
  sendTranslationPartialEmail,
  maskEmail,
  type TranslationJobSummary,
} from "../services/workerEmail.js";

const LOG = "[emailWorker]";

function logDetail(phase: string, payload: Record<string, unknown>): void {
  console.info(`${LOG} ${phase} ${JSON.stringify(payload)}`);
}

function describeJob(job: TranslationV4Job): Record<string, unknown> {
  return {
    id: job.id,
    shop: job.shopName,
    taskSource: job.taskSource ?? null,
    isAuto: isAutoTranslationJob(job),
    status: job.status,
    target: job.target,
    emailSent: job.emailSent ?? false,
    usedTokens: job.metrics.usedTokens ?? 0,
    translateDone: job.metrics.translateDone,
    translateTotal: job.metrics.translateTotal,
    preferStoredToken: prefersStoredToken(job),
  };
}

/** 从任务的 stageTimings / createdAt / updatedAt 估算完成耗时（分钟）。 */
function calcElapsedMinutes(job: TranslationV4Job): number {
  const start = job.stageTimings?.INIT?.startedAt ?? job.createdAt;
  const end =
    job.stageTimings?.VERIFY?.endedAt ??
    job.stageTimings?.WRITEBACK?.endedAt ??
    job.updatedAt;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.max(1, Math.round(ms / 60_000));
}

/** 从任务 metrics 计算翻译完成百分比（PAUSED 时用）。 */
function calcCompletionPercent(job: TranslationV4Job): number {
  const { translateTotal, translateDone } = job.metrics;
  if (!translateTotal || translateTotal <= 0) return 0;
  return Math.min(100, (translateDone / translateTotal) * 100);
}

function toJobSummary(job: TranslationV4Job): TranslationJobSummary {
  return {
    target: job.target,
    usedTokens: job.metrics.usedTokens ?? 0,
    elapsedMinutes: calcElapsedMinutes(job),
    completionPercent: calcCompletionPercent(job),
  };
}

/** 去掉 .myshopify.com 后缀，得到可读店名（firstName 不可用时的兜底）。 */
function parseShopName(shopName: string): string {
  return shopName.replace(/\.myshopify\.com$/, "");
}

export type RecipientContact = {
  email: string;
  userName: string;
};

/** 发信前从 Shopify GraphQL 拉取收件人与称呼。 */
async function resolveRecipientContact(
  job: TranslationV4Job,
): Promise<RecipientContact | null> {
  logDetail("resolve-recipient-start", {
    jobId: job.id,
    shop: job.shopName,
    preferStoredToken: prefersStoredToken(job),
    hasLegacyToken: Boolean(job.shopifyAccessToken?.trim()),
  });
  const contact = await fetchShopContact(job.shopName, {
    legacyToken: job.shopifyAccessToken,
    preferLegacyToken: prefersStoredToken(job),
  });
  const email = contact.email;
  const userName = contact.firstName?.trim() || parseShopName(job.shopName);
  logDetail("resolve-recipient-done", {
    jobId: job.id,
    shop: job.shopName,
    email: email ? maskEmail(email) : null,
    userName,
    firstNameSource: contact.firstName ? "shopify_api" : "shop_prefix_fallback",
    found: Boolean(email),
  });
  if (!email) return null;
  return { email, userName };
}

/** 标记 emailSent=true，使用 etag 防止并发写冲突，失败静默（不影响主流程）。 */
async function markEmailSent(job: TranslationV4Job): Promise<void> {
  try {
    await updateJob(job.shopName, job.id, { emailSent: true });
    logDetail("mark-email-sent-ok", { jobId: job.id, shop: job.shopName });
  } catch (e) {
    console.warn(`${LOG} markEmailSent failed job=${job.id}`, e);
  }
}

/** 处理单个手动翻译任务的邮件通知。 */
async function handleManualJob(job: TranslationV4Job): Promise<void> {
  logDetail("handle-manual-start", describeJob(job));

  const recipient = await resolveRecipientContact(job);
  if (!recipient) {
    logDetail("handle-manual-skipped", {
      reason: "no_shop_email",
      jobId: job.id,
      shop: job.shopName,
    });
    return;
  }
  const { email: to, userName } = recipient;
  const summary = toJobSummary(job);
  logDetail("handle-manual-summary", {
    jobId: job.id,
    shop: job.shopName,
    to: maskEmail(to),
    ...summary,
  });

  let sent = false;
  let templateKind: "manual_success" | "manual_partial" | "unsupported_status" =
    "unsupported_status";
  if (job.status === "COMPLETED") {
    templateKind = "manual_success";
    sent = await sendManualTranslationSuccessEmail(job.shopName, to, userName, summary);
  } else if (job.status === "PAUSED") {
    templateKind = "manual_partial";
    sent = await sendTranslationPartialEmail(
      job.shopName,
      to,
      userName,
      "manual translation",
      [summary],
    );
  } else {
    logDetail("handle-manual-skipped", {
      reason: "unsupported_status",
      jobId: job.id,
      status: job.status,
    });
    return;
  }

  logDetail("handle-manual-send-result", {
    jobId: job.id,
    shop: job.shopName,
    templateKind,
    sent,
    to: maskEmail(to),
  });

  if (sent) {
    await markEmailSent(job);
    logDetail("handle-manual-done", {
      jobId: job.id,
      shop: job.shopName,
      status: job.status,
      to: maskEmail(to),
    });
  }
}

/** 处理同一店铺的自动翻译邮件：整店任务都终态后汇总发一封。 */
async function handleAutoJobGroup(shopName: string): Promise<void> {
  // 等所有进行中的自动任务结束后再发（对齐 Java 按店汇总逻辑）
  const hasActive = await hasActiveAutoJobsForShop(shopName);
  if (hasActive) {
    logDetail("handle-auto-skipped", {
      reason: "active_auto_jobs_still_running",
      shop: shopName,
    });
    return;
  }

  const jobs = await findAutoJobsNeedingEmailForShop(shopName);
  if (jobs.length === 0) {
    return;
  }

  logDetail("handle-auto-start", {
    shop: shopName,
    jobCount: jobs.length,
    jobs: jobs.map(describeJob),
  });

  const recipient = await resolveRecipientContact(jobs[0]);
  if (!recipient) {
    logDetail("handle-auto-skipped", {
      reason: "no_shop_email",
      shop: shopName,
      jobIds: jobs.map((j) => j.id),
    });
    return;
  }
  const { email: to, userName } = recipient;
  const completedJobs = jobs.filter((j) => j.status === "COMPLETED");
  const pausedJobs = jobs.filter((j) => j.status === "PAUSED");
  logDetail("handle-auto-split", {
    shop: shopName,
    to: maskEmail(to),
    completedCount: completedJobs.length,
    pausedCount: pausedJobs.length,
    completedTargets: completedJobs.map((j) => j.target),
    pausedTargets: pausedJobs.map((j) => j.target),
  });

  // 成功任务：发汇总成功邮件（140352）
  if (completedJobs.length > 0) {
    const sent = await sendAutoTranslationSuccessEmail(
      shopName,
      to,
      userName,
      completedJobs.map(toJobSummary),
    );
    logDetail("handle-auto-success-send-result", {
      shop: shopName,
      to: maskEmail(to),
      sent,
      jobIds: completedJobs.map((j) => j.id),
      targets: completedJobs.map((j) => j.target),
    });
    if (sent) {
      for (const job of completedJobs) {
        await markEmailSent(job);
      }
      logDetail("handle-auto-success-done", {
        shop: shopName,
        langs: completedJobs.map((j) => j.target),
        markedJobIds: completedJobs.map((j) => j.id),
      });
    }
  }

  // 暂停任务：发部分完成邮件（159297）
  if (pausedJobs.length > 0) {
    const sent = await sendTranslationPartialEmail(
      shopName,
      to,
      userName,
      "auto translation",
      pausedJobs.map(toJobSummary),
    );
    logDetail("handle-auto-partial-send-result", {
      shop: shopName,
      to: maskEmail(to),
      sent,
      jobIds: pausedJobs.map((j) => j.id),
      targets: pausedJobs.map((j) => j.target),
    });
    if (sent) {
      for (const job of pausedJobs) {
        await markEmailSent(job);
      }
      logDetail("handle-auto-partial-done", {
        shop: shopName,
        langs: pausedJobs.map((j) => j.target),
        markedJobIds: pausedJobs.map((j) => j.id),
      });
    }
  }
}

export async function runEmailWorker(): Promise<void> {
  const startedAt = Date.now();
  const [manualCandidates, autoShops] = await Promise.all([
    findJobsNeedingEmail(30),
    findShopsWithPendingAutoEmail(),
  ]);
  const manualJobs = manualCandidates.filter((job) => !isAutoTranslationJob(job));

  if (manualJobs.length === 0 && autoShops.length === 0) {
    return;
  }

  logDetail("run-start", {
    manualCount: manualJobs.length,
    autoShopCount: autoShops.length,
    autoShops,
    manualJobs: manualJobs.map(describeJob),
  });

  // 手动任务逐个处理
  for (const job of manualJobs) {
    await handleManualJob(job).catch((e) => {
      logDetail("handle-manual-error", {
        jobId: job.id,
        shop: job.shopName,
        errorMessage: e instanceof Error ? e.message : String(e),
      });
      console.error(`${LOG} handleManualJob error job=${job.id}`, e);
    });
  }

  // 自动任务：按店拉全量待发任务后汇总（见 handleAutoJobGroup）
  for (const shopName of autoShops) {
    await handleAutoJobGroup(shopName).catch((e) => {
      logDetail("handle-auto-error", {
        shop: shopName,
        errorMessage: e instanceof Error ? e.message : String(e),
      });
      console.error(`${LOG} handleAutoJobGroup error shop=${shopName}`, e);
    });
  }

  logDetail("run-done", {
    manualCount: manualJobs.length,
    autoShopCount: autoShops.length,
    elapsedMs: Date.now() - startedAt,
  });
}
