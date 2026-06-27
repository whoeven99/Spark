import {
  getJob,
  updateJob,
  prefersStoredToken,
  findPendingJobs,
  type TranslationV4Job,
  type StageTimings,
} from "./cosmosV4.js";
import { setItemsCount } from "./redisV4.js";
import { computeModuleCount } from "./itemsCount.js";

export type FinalizeAfterWritebackInput = {
  writebackDone: number;
  writebackFailed: number;
  metrics?: TranslationV4Job["metrics"];
  stageTimings?: StageTimings | null;
};

/** 写回结束后直接收尾：COMPLETED / PAUSED / FAILED（不再进入校验）。 */
export async function finalizeJobAfterWriteback(
  job: TranslationV4Job,
  input: FinalizeAfterWritebackInput,
): Promise<void> {
  const { shopName, id: jobId } = job;
  const latestJob = await getJob(shopName, jobId);
  const mergedMetrics = {
    ...(latestJob?.metrics ?? job.metrics),
    ...(input.metrics ?? {}),
    writebackDone: input.writebackDone,
    writebackFailed: input.writebackFailed,
  };

  const initTotal = mergedMetrics.initTotal ?? job.metrics?.initTotal ?? 0;
  const nothingToTranslate = initTotal === 0;
  const wroteAnything = nothingToTranslate || input.writebackDone > 0;

  const tTotal = mergedMetrics.translateTotal ?? 0;
  const tAttempted =
    (mergedMetrics.translateDone ?? 0) + (mergedMetrics.translateFailed ?? 0);
  const translateIncomplete = wroteAnything && tTotal > 0 && tAttempted < tTotal;
  const finalStatus = translateIncomplete
    ? "PAUSED"
    : wroteAnything
      ? "COMPLETED"
      : "FAILED";

  if (
    finalStatus === "COMPLETED" &&
    prefersStoredToken(job) &&
    job.shopifyAccessToken
  ) {
    for (const module of job.modules) {
      try {
        const count = await computeModuleCount(
          shopName,
          job.shopifyAccessToken,
          module,
          job.target,
        );
        const stored = await setItemsCount(shopName, job.target, module, count);
        if (stored) {
          console.log(
            `[finalize] items_count job=${jobId} ${module} ${count.translated}/${count.total} stored`,
          );
        } else {
          console.warn(
            `[finalize] items_count job=${jobId} ${module} ${count.translated}/${count.total} redis unavailable`,
          );
        }
      } catch (e) {
        console.error(`[finalize] items_count job=${jobId} ${module} failed:`, e);
      }
    }
  }

  const stageTimings =
    input.stageTimings ?? latestJob?.stageTimings ?? job.stageTimings;

  await updateJob(shopName, jobId, {
    status: finalStatus,
    errorStage: translateIncomplete
      ? "TRANSLATE"
      : wroteAnything
        ? undefined
        : "WRITEBACK",
    errorMessage: translateIncomplete
      ? "额度不足，仅翻译并写回了部分资源，补充额度后点击「继续」可翻译剩余内容"
      : wroteAnything
        ? nothingToTranslate
          ? null
          : undefined
        : "写回未成功：全部资源均未写入 Shopify（请查看 worker 日志或写回详情）",
    claimedBy: null,
    stageTimings,
    metrics: mergedMetrics,
  });

  console.log(
    `[finalize] job=${jobId} status=${finalStatus} written=${input.writebackDone} failed=${input.writebackFailed}`,
  );
}

/** 部署后把仍停在校验队列的旧任务直接收尾（verify 环节已移除）。 */
export async function completeLegacyVerifyJobs(limit = 30): Promise<number> {
  let completed = 0;
  for (const status of ["VERIFY_QUEUED", "VERIFYING"] as const) {
    const jobs = await findPendingJobs(status, limit);
    for (const job of jobs) {
      if (status === "VERIFYING" && job.claimedBy) continue;
      try {
        await finalizeJobAfterWriteback(job, {
          writebackDone: job.metrics.writebackDone ?? 0,
          writebackFailed: job.metrics.writebackFailed ?? 0,
        });
        completed++;
        console.log(`[deploy-wake] legacy ${status} → finalized job=${job.id}`);
      } catch (e) {
        console.warn(`[deploy-wake] legacy verify finalize failed job=${job.id}`, e);
      }
    }
  }
  return completed;
}
