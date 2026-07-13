/**
 * 修复 Blob 后触发 Shopify 写回（对齐 worker writebackWorker + resume-job.mjs）。
 */
import { blobReadJson, blobWriteJson } from "./translationStorage.mjs";

const HINT_KEY = "translate:v4:hint:writeback";

const IN_FLIGHT_STATUSES = new Set([
  "INITIALIZING",
  "TRANSLATING",
  "WRITING_BACK",
  "VERIFYING",
]);

function writebackResourceTotal(metrics) {
  if (metrics?.writebackTotal > 0) return metrics.writebackTotal;
  const total = metrics?.translateTotal ?? metrics?.initTotal ?? 0;
  const attempted = (metrics?.translateDone ?? 0) + (metrics?.translateFailed ?? 0);
  if (total > 0 && attempted >= total && (metrics?.translateDone ?? 0) > 0) {
    return metrics.translateDone;
  }
  return metrics?.translateTotal || metrics?.initTotal || 0;
}

export function canTriggerWriteback(job, { force = false } = {}) {
  if (!job?.blobPrefix) {
    return { ok: false, reason: "无 blobPrefix" };
  }
  if (!job.shopifyAccessToken && !job.prefersStoredToken) {
    return { ok: false, reason: "任务无 shopifyAccessToken，worker 无法写回 Shopify" };
  }
  const translateDone = job.metrics?.translateDone ?? 0;
  if (translateDone <= 0) {
    return { ok: false, reason: "尚无译文（translateDone=0）" };
  }
  if (!force && IN_FLIGHT_STATUSES.has(job.status)) {
    return { ok: false, reason: `任务进行中（${job.status}），加 --force 可强制排队写回` };
  }
  return { ok: true };
}

export async function triggerShopifyWriteback({
  cosmos,
  blob,
  redis,
  job,
  repairedResourceIds,
  dryRun,
  force = false,
}) {
  const repaired = [...(repairedResourceIds ?? [])];
  if (repaired.length === 0) {
    return { queued: false, reason: "无修复资源，跳过写回" };
  }

  const check = canTriggerWriteback(job, { force });
  if (!check.ok) {
    return { queued: false, reason: check.reason };
  }

  const blobPrefix = job.blobPrefix || `tasks/v4/${job.shopName}/${job.id}`;
  const progressPath = `${blobPrefix}/writeback/progress.json`;
  const failedPath = `${blobPrefix}/writeback/failed.json`;

  const existingProgress = (await blobReadJson(blob, progressPath)) ?? { written: [] };
  const writtenBefore = new Set(existingProgress.written ?? []);
  const repairedSet = new Set(repaired);
  const writtenAfter = [...writtenBefore].filter((id) => !repairedSet.has(id));

  const existingFailed = (await blobReadJson(blob, failedPath)) ?? [];
  const failedAfter = Array.isArray(existingFailed)
    ? existingFailed.filter((row) => !repairedSet.has(row?.resourceId))
    : [];

  const removedFromProgress = writtenBefore.size - writtenAfter.length;
  const removedFromFailed =
    (Array.isArray(existingFailed) ? existingFailed.length : 0) - failedAfter.length;

  const nextMetrics = {
    ...(job.metrics ?? {}),
    writebackTotal: writebackResourceTotal(job.metrics),
    writebackDone: writtenAfter.length,
    writebackFailed: Math.max(0, (job.metrics?.writebackFailed ?? 0) - removedFromFailed),
  };

  const plan = {
    jobId: job.id,
    shopName: job.shopName,
    fromStatus: job.status,
    toStatus: "WRITEBACK_QUEUED",
    repairedResources: repaired.length,
    removedFromProgress,
    removedFromFailed,
    writebackDone: nextMetrics.writebackDone,
    writebackTotal: nextMetrics.writebackTotal,
  };

  if (dryRun) {
    return { queued: false, dryRun: true, plan };
  }

  await blobWriteJson(blob, progressPath, { written: writtenAfter });
  await blobWriteJson(blob, failedPath, failedAfter);

  const now = new Date().toISOString();
  await cosmos.item(job.id, job.shopName).replace({
    ...job,
    status: "WRITEBACK_QUEUED",
    claimedBy: null,
    claimedAt: null,
    pauseAfterWriteback: null,
    errorStage: null,
    errorMessage: null,
    metrics: nextMetrics,
    updatedAt: now,
  });

  let hintPushed = false;
  if (redis) {
    try {
      await redis.rpush(
        HINT_KEY,
        JSON.stringify({ taskId: job.id, shopName: job.shopName }),
      );
      hintPushed = true;
    } catch {
      // worker 仍会在轮询周期拾取 WRITEBACK_QUEUED
    }
  }

  return { queued: true, hintPushed, plan };
}
