import prisma from "../../db.server";
import type { EstimationTaskKey } from "./estimationBucket";
import {
  DEFAULT_IMAGE_GENERATION_IMAGE_TOKEN_COST,
  DEFAULT_PICTURE_TRANSLATE_TOKEN_COST,
} from "../tokenUsage/tokenBillingDefaults.server";

const EWMA_ALPHA = 0.2;
const BOOTSTRAP_THRESHOLD = 5;
const DEFAULT_BUCKET = "default";

function defaultCredits(taskKey: EstimationTaskKey): number {
  if (taskKey === "picture_translate") return DEFAULT_PICTURE_TRANSLATE_TOKEN_COST;
  if (taskKey === "image_generation") return DEFAULT_IMAGE_GENERATION_IMAGE_TOKEN_COST;
  // product_improve / translation 无硬编码默认（按 token 计），冷启动返回 0。
  return 0;
}

function calcEwma(
  prev: number | null,
  prevCount: number,
  actual: number,
): number {
  if (prev == null || prevCount < BOOTSTRAP_THRESHOLD) {
    const n = prevCount + 1;
    return ((prev ?? 0) * prevCount + actual) / n;
  }
  return EWMA_ALPHA * actual + (1 - EWMA_ALPHA) * prev;
}

/**
 * 读取某 (taskKey, bucket) 的样本。样本不足时回退到该 taskKey 的 default 桶，
 * 让新桶在冷启动阶段先借用全局经验，攒够样本后再用自己的值。
 */
async function readEstimation(
  taskKey: EstimationTaskKey,
  bucket: string,
): Promise<{ ewmaCredits: number | null; ewmaSeconds: number | null } | null> {
  const rows = await prisma.aITaskEstimation.findMany({
    where: {
      taskType: taskKey,
      bucket: bucket === DEFAULT_BUCKET ? DEFAULT_BUCKET : { in: [bucket, DEFAULT_BUCKET] },
    },
    select: { bucket: true, ewmaCredits: true, ewmaSeconds: true, sampleCount: true },
  });
  if (rows.length === 0) return null;

  const exact = rows.find((r) => r.bucket === bucket);
  const fallback = rows.find((r) => r.bucket === DEFAULT_BUCKET);

  if (exact && exact.sampleCount >= BOOTSTRAP_THRESHOLD) {
    return { ewmaCredits: exact.ewmaCredits, ewmaSeconds: exact.ewmaSeconds };
  }
  if (fallback && fallback.sampleCount >= BOOTSTRAP_THRESHOLD) {
    return { ewmaCredits: fallback.ewmaCredits, ewmaSeconds: fallback.ewmaSeconds };
  }
  return null;
}

/** per-item 预估积分。未收敛时回退硬编码默认值。 */
export async function getEstimatedCredits(
  taskKey: EstimationTaskKey,
  bucket: string = DEFAULT_BUCKET,
): Promise<number> {
  try {
    const est = await readEstimation(taskKey, bucket);
    if (est?.ewmaCredits != null) {
      return Math.max(1, Math.round(est.ewmaCredits));
    }
  } catch {
    // DB 异常时降级到默认值
  }
  return defaultCredits(taskKey);
}

/** per-item 预估耗时（秒）。未收敛时返回 null（UI 展示「数据不足」）。 */
export async function getEstimatedSeconds(
  taskKey: EstimationTaskKey,
  bucket: string = DEFAULT_BUCKET,
): Promise<number | null> {
  try {
    const est = await readEstimation(taskKey, bucket);
    if (est?.ewmaSeconds != null) {
      return Math.max(1, Math.round(est.ewmaSeconds));
    }
  } catch {
    // 估算失败不影响调用方
  }
  return null;
}

/**
 * 整店翻译跑前/跑中预估：用 per-item EWMA × 计划条数得到总量。
 * 任一维度数据不足则返回 null（不展示捏造值）。
 */
export async function estimateTranslation(params: {
  bucket: string;
  itemCount: number;
}): Promise<{ seconds: number | null; credits: number | null }> {
  if (!Number.isFinite(params.itemCount) || params.itemCount <= 0) {
    return { seconds: null, credits: null };
  }
  try {
    const est = await readEstimation("translation", params.bucket);
    return {
      seconds:
        est?.ewmaSeconds != null
          ? Math.max(1, Math.round(est.ewmaSeconds * params.itemCount))
          : null,
      credits:
        est?.ewmaCredits != null
          ? Math.max(1, Math.round(est.ewmaCredits * params.itemCount))
          : null,
    };
  } catch {
    return { seconds: null, credits: null };
  }
}

async function upsertBucket(
  taskKey: EstimationTaskKey,
  bucket: string,
  actualCredits: number | null,
  actualSeconds: number | null,
): Promise<void> {
  const existing = await prisma.aITaskEstimation.findUnique({
    where: { taskType_bucket: { taskType: taskKey, bucket } },
  });

  const prevCount = existing?.sampleCount ?? 0;
  const newCount = prevCount + 1;

  const newEwmaCredits =
    actualCredits != null && actualCredits > 0
      ? calcEwma(existing?.ewmaCredits ?? null, prevCount, actualCredits)
      : existing?.ewmaCredits ?? null;

  const newEwmaSeconds =
    actualSeconds != null && actualSeconds > 0
      ? calcEwma(existing?.ewmaSeconds ?? null, prevCount, actualSeconds)
      : existing?.ewmaSeconds ?? null;

  await prisma.aITaskEstimation.upsert({
    where: { taskType_bucket: { taskType: taskKey, bucket } },
    update: {
      ewmaCredits: newEwmaCredits,
      ewmaSeconds: newEwmaSeconds,
      sampleCount: newCount,
    },
    create: {
      taskType: taskKey,
      bucket,
      ewmaCredits: newEwmaCredits,
      ewmaSeconds: newEwmaSeconds,
      sampleCount: newCount,
    },
  });
}

/**
 * 用真实值（per-item）增量更新 EWMA。fire-and-forget，失败不抛。
 * 同时更新精确桶和 default 聚合桶——后者作为「不知道具体规模」的页面级预估兜底，
 * 也是精确桶冷启动时的回退来源。
 */
export async function updateTaskEstimation(params: {
  taskKey: EstimationTaskKey;
  bucket?: string;
  actualCredits: number | null;
  actualSeconds: number | null;
}): Promise<void> {
  const { taskKey } = params;
  if (!taskKey) return;
  const bucket = params.bucket || DEFAULT_BUCKET;

  try {
    await upsertBucket(taskKey, bucket, params.actualCredits, params.actualSeconds);
    if (bucket !== DEFAULT_BUCKET) {
      await upsertBucket(taskKey, DEFAULT_BUCKET, params.actualCredits, params.actualSeconds);
    }
  } catch (e) {
    console.error("[AITaskEstimation] updateTaskEstimation failed", e);
  }
}
