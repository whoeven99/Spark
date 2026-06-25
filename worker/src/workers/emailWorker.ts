/**
 * emailWorker — 翻译完成通知邮件发送 worker。
 *
 * 每次运行：
 *  1. 找出 COMPLETED / PAUSED、未发邮件的任务。
 *     收件人邮箱在发信时通过 Shopify GraphQL 实时查询（不用 Session 快照）。
 *  2. 手动任务（taskSource ≠ TsFrontend-Auto）：每个任务独立发一封邮件。
 *  3. 自动任务（taskSource = TsFrontend-Auto）：按店铺分组，等同店内所有进行中自动任务结束
 *     后再汇总发一封邮件（对齐 Spring TranslateTask.sendEmail 逻辑）。
 *  4. 发送成功后将 emailSent=true 写回 Cosmos，防止重发。
 *
 * 任务类型对应模板（对齐 Spring TencentEmailService）：
 *   manual + COMPLETED → 137353 手动翻译成功
 *   auto   + COMPLETED → 140352 自动翻译成功（同店多语言合并）
 *   manual/auto + PAUSED → 159297 翻译部分完成（额度不足）
 */

import type { TranslationV4Job } from "../services/cosmosV4.js";
import {
  findJobsNeedingEmail,
  hasActiveAutoJobsForShop,
  isAutoTranslationJob,
  prefersStoredToken,
  updateJob,
} from "../services/cosmosV4.js";
import { fetchShopEmail } from "../services/shopEmail.js";
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

/** 发信前从 Shopify GraphQL 拉取最新店铺邮箱。 */
async function resolveRecipientEmail(job: TranslationV4Job): Promise<string | null> {
  logDetail("resolve-recipient-start", {
    jobId: job.id,
    shop: job.shopName,
    preferStoredToken: prefersStoredToken(job),
    hasLegacyToken: Boolean(job.shopifyAccessToken?.trim()),
  });
  const email = await fetchShopEmail(job.shopName, {
    legacyToken: job.shopifyAccessToken,
    preferLegacyToken: prefersStoredToken(job),
  });
  logDetail("resolve-recipient-done", {
    jobId: job.id,
    shop: job.shopName,
    email: email ? maskEmail(email) : null,
    found: Boolean(email),
  });
  return email;
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

  const to = await resolveRecipientEmail(job);
  if (!to) {
    logDetail("handle-manual-skipped", {
      reason: "no_shop_email",
      jobId: job.id,
      shop: job.shopName,
    });
    return;
  }
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
    sent = await sendManualTranslationSuccessEmail(job.shopName, to, summary);
  } else if (job.status === "PAUSED") {
    templateKind = "manual_partial";
    sent = await sendTranslationPartialEmail(job.shopName, to, "manual translation", [summary]);
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

/** 处理同一店铺的一批自动翻译任务的邮件通知（汇总发送）。 */
async function handleAutoJobGroup(shopName: string, jobs: TranslationV4Job[]): Promise<void> {
  logDetail("handle-auto-start", {
    shop: shopName,
    jobCount: jobs.length,
    jobs: jobs.map(describeJob),
  });

  // 等所有进行中的自动任务结束后再发（对齐 Java 按店汇总逻辑）
  const hasActive = await hasActiveAutoJobsForShop(shopName);
  if (hasActive) {
    logDetail("handle-auto-skipped", {
      reason: "active_auto_jobs_still_running",
      shop: shopName,
      pendingJobIds: jobs.map((j) => j.id),
    });
    return;
  }

  const to = await resolveRecipientEmail(jobs[0]);
  if (!to) {
    logDetail("handle-auto-skipped", {
      reason: "no_shop_email",
      shop: shopName,
      jobIds: jobs.map((j) => j.id),
    });
    return;
  }
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
  const jobs = await findJobsNeedingEmail(30);
  if (jobs.length === 0) {
    logDetail("run-idle", { elapsedMs: Date.now() - startedAt });
    return;
  }

  logDetail("run-start", {
    jobCount: jobs.length,
    jobs: jobs.map(describeJob),
  });

  const manualJobs: TranslationV4Job[] = [];
  const autoByShop = new Map<string, TranslationV4Job[]>();

  for (const job of jobs) {
    if (isAutoTranslationJob(job)) {
      const group = autoByShop.get(job.shopName) ?? [];
      group.push(job);
      autoByShop.set(job.shopName, group);
    } else {
      manualJobs.push(job);
    }
  }

  logDetail("run-grouped", {
    manualCount: manualJobs.length,
    autoShopCount: autoByShop.size,
    autoShops: [...autoByShop.keys()],
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

  // 自动任务按店汇总处理
  for (const [shopName, shopJobs] of autoByShop) {
    await handleAutoJobGroup(shopName, shopJobs).catch((e) => {
      logDetail("handle-auto-error", {
        shop: shopName,
        jobIds: shopJobs.map((j) => j.id),
        errorMessage: e instanceof Error ? e.message : String(e),
      });
      console.error(`${LOG} handleAutoJobGroup error shop=${shopName}`, e);
    });
  }

  logDetail("run-done", {
    manualCount: manualJobs.length,
    autoShopCount: autoByShop.size,
    elapsedMs: Date.now() - startedAt,
  });
}
