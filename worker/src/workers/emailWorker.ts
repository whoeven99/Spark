/**
 * emailWorker — 翻译完成通知邮件发送 worker。
 *
 * 每次运行：
 *  1. 找出 COMPLETED / PAUSED、未发邮件、带 taskType 的任务。
 *     收件人邮箱在发信时通过 Shopify GraphQL 实时查询（不用 Session 快照）。
 *  2. 手动任务（taskType="manual"）：每个任务独立发一封邮件。
 *  3. 自动任务（taskType="auto"）：按店铺分组，等同店内所有进行中自动任务结束
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
  prefersStoredToken,
  updateJob,
} from "../services/cosmosV4.js";
import { fetchShopEmail } from "../services/shopEmail.js";
import {
  sendManualTranslationSuccessEmail,
  sendAutoTranslationSuccessEmail,
  sendTranslationPartialEmail,
  type TranslationJobSummary,
} from "../services/workerEmail.js";

const LOG = "[emailWorker]";

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
  return fetchShopEmail(job.shopName, {
    legacyToken: job.shopifyAccessToken,
    preferLegacyToken: prefersStoredToken(job),
  });
}

/** 标记 emailSent=true，使用 etag 防止并发写冲突，失败静默（不影响主流程）。 */
async function markEmailSent(job: TranslationV4Job): Promise<void> {
  try {
    await updateJob(job.shopName, job.id, { emailSent: true });
  } catch (e) {
    console.warn(`${LOG} markEmailSent failed job=${job.id}`, e);
  }
}

/** 处理单个手动翻译任务的邮件通知。 */
async function handleManualJob(job: TranslationV4Job): Promise<void> {
  const to = await resolveRecipientEmail(job);
  if (!to) {
    console.warn(`${LOG} no shop email from GraphQL, skip manual job=${job.id} shop=${job.shopName}`);
    return;
  }
  const summary = toJobSummary(job);

  let sent = false;
  if (job.status === "COMPLETED") {
    sent = await sendManualTranslationSuccessEmail(job.shopName, to, summary);
  } else if (job.status === "PAUSED") {
    sent = await sendTranslationPartialEmail(job.shopName, to, "manual translation", [summary]);
  }

  if (sent) {
    await markEmailSent(job);
    console.info(`${LOG} manual email sent job=${job.id} shop=${job.shopName} status=${job.status}`);
  }
}

/** 处理同一店铺的一批自动翻译任务的邮件通知（汇总发送）。 */
async function handleAutoJobGroup(shopName: string, jobs: TranslationV4Job[]): Promise<void> {
  // 等所有进行中的自动任务结束后再发（对齐 Java 按店汇总逻辑）
  const hasActive = await hasActiveAutoJobsForShop(shopName);
  if (hasActive) {
    console.info(`${LOG} auto jobs still active, skip email for shop=${shopName}`);
    return;
  }

  const to = await resolveRecipientEmail(jobs[0]);
  if (!to) {
    console.warn(`${LOG} no shop email from GraphQL, skip auto shop=${shopName}`);
    return;
  }
  const completedJobs = jobs.filter((j) => j.status === "COMPLETED");
  const pausedJobs = jobs.filter((j) => j.status === "PAUSED");

  // 成功任务：发汇总成功邮件（140352）
  if (completedJobs.length > 0) {
    const sent = await sendAutoTranslationSuccessEmail(
      shopName,
      to,
      completedJobs.map(toJobSummary),
    );
    if (sent) {
      for (const job of completedJobs) {
        await markEmailSent(job);
      }
      console.info(
        `${LOG} auto success email sent shop=${shopName} langs=${completedJobs.map((j) => j.target).join(",")}`,
      );
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
    if (sent) {
      for (const job of pausedJobs) {
        await markEmailSent(job);
      }
      console.info(
        `${LOG} auto partial email sent shop=${shopName} langs=${pausedJobs.map((j) => j.target).join(",")}`,
      );
    }
  }
}

export async function runEmailWorker(): Promise<void> {
  const jobs = await findJobsNeedingEmail(30);
  if (jobs.length === 0) return;

  console.info(`${LOG} found ${jobs.length} job(s) needing email`);

  const manualJobs: TranslationV4Job[] = [];
  const autoByShop = new Map<string, TranslationV4Job[]>();

  for (const job of jobs) {
    if (job.taskType === "auto") {
      const group = autoByShop.get(job.shopName) ?? [];
      group.push(job);
      autoByShop.set(job.shopName, group);
    } else {
      manualJobs.push(job);
    }
  }

  // 手动任务逐个处理
  for (const job of manualJobs) {
    await handleManualJob(job).catch((e) =>
      console.error(`${LOG} handleManualJob error job=${job.id}`, e),
    );
  }

  // 自动任务按店汇总处理
  for (const [shopName, shopJobs] of autoByShop) {
    await handleAutoJobGroup(shopName, shopJobs).catch((e) =>
      console.error(`${LOG} handleAutoJobGroup error shop=${shopName}`, e),
    );
  }
}
