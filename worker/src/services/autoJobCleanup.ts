import {
  deleteJob,
  TSF_AUTO_TASK_SOURCE,
  type TranslationV4Job,
} from "./cosmosV4.js";
import { blobDeletePrefix } from "./blobV4.js";
import { clearTaskRedis } from "./redisV4.js";

/** 删除自动任务及其 Blob / Redis 进度（用于 0 条空任务清理）。 */
export async function purgeAutoJob(job: Pick<
  TranslationV4Job,
  "id" | "shopName" | "blobPrefix"
>): Promise<void> {
  await blobDeletePrefix(job.blobPrefix);
  await deleteJob(job.shopName, job.id);
  await clearTaskRedis(job.id);
}

export function isEmptyAutoJob(job: TranslationV4Job): boolean {
  if (job.taskSource !== TSF_AUTO_TASK_SOURCE) return false;
  const initTotal = job.metrics?.initTotal ?? 0;
  const translateTotal = job.metrics?.translateTotal ?? 0;
  return initTotal <= 0 && translateTotal <= 0;
}
