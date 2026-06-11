/**
 * 整店翻译 → 预估自校准的桥接（app 端）。
 *
 * worker 是独立进程（Cosmos/Redis，无 Prisma），无法直接写 EWMA 表；
 * 由 app 在观测到 job COMPLETED 时，把真实「单条耗时 / 单条 token」回写到统一估算层。
 * 幂等由调用方的 claimEstimationRecording 保证，这里只负责计算 per-item 值并喂回。
 */
import type { TranslationV4Job } from "./types";
import { deriveBucket } from "../../aiTask/estimationBucket";
import { updateTaskEstimation } from "../../aiTask/aiTaskEstimation.server";

export async function recordTranslationOutcome(job: TranslationV4Job): Promise<void> {
  const items = job.metrics.translateDone;
  if (!Number.isFinite(items) || items <= 0) return;

  // per-item token：用持久化在 Cosmos 的 usedTokens（不依赖可能已过期的 Redis）。
  const usedTokens = job.metrics.usedTokens;
  const perItemCredits =
    Number.isFinite(usedTokens) && usedTokens > 0 ? usedTokens / items : null;

  // per-item 秒：整条流水线墙钟时长 / 条数（createdAt→updatedAt 均持久化，completion 时 updatedAt 即完成时刻）。
  const start = Date.parse(job.createdAt);
  const end = Date.parse(job.updatedAt);
  const perItemSeconds =
    Number.isFinite(start) && Number.isFinite(end) && end > start
      ? (end - start) / 1000 / items
      : null;

  if (perItemCredits == null && perItemSeconds == null) return;

  await updateTaskEstimation({
    taskKey: "translation",
    bucket: deriveBucket("translation", { target: job.target }),
    actualCredits: perItemCredits,
    actualSeconds: perItemSeconds,
  });
}
