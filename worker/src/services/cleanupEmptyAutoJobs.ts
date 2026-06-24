import { findStaleEmptyAutoJobs, type TranslationV4Job } from "./cosmosV4.js";
import { purgeAutoJob, isEmptyAutoJob } from "./autoJobCleanup.js";

const DEFAULT_RETENTION_MS = Math.max(
  60_000,
  Number(process.env.AUTO_EMPTY_JOB_RETENTION_MS) || 10 * 60_000,
);
const DEFAULT_BATCH = Math.min(
  200,
  Math.max(1, Number(process.env.AUTO_EMPTY_JOB_CLEANUP_BATCH) || 50),
);

/**
 * 定时清理已完成的 0 条自动翻译任务（兜底：即时删除失败或历史遗留）。
 * 仅删 COMPLETED + TsFrontend-Auto + initTotal/translateTotal 均为 0。
 */
export async function cleanupStaleEmptyAutoJobs(): Promise<void> {
  const cutoff = new Date(Date.now() - DEFAULT_RETENTION_MS).toISOString();
  const resources = await findStaleEmptyAutoJobs(cutoff, DEFAULT_BATCH);

  if (!resources.length) {
    console.log("[autoJobCleanup] 无待清理的空自动任务");
    return;
  }

  let deleted = 0;
  for (const job of resources) {
    if (!isEmptyAutoJob(job as TranslationV4Job)) continue;
    try {
      await purgeAutoJob(job);
      deleted++;
    } catch (err) {
      console.error(`[autoJobCleanup] 删除失败 id=${job.id} shop=${job.shopName}`, err);
    }
  }

  console.log(
    `[autoJobCleanup] 清理完成：候选=${resources.length} 已删=${deleted} retentionMs=${DEFAULT_RETENTION_MS}`,
  );
}
