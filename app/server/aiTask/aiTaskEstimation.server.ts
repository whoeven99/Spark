import prisma from "../../db.server";
import type { AITaskType } from "../../lib/aiTaskTypes";
import {
  DEFAULT_IMAGE_GENERATION_IMAGE_TOKEN_COST,
  DEFAULT_PICTURE_TRANSLATE_TOKEN_COST,
} from "../tokenUsage/tokenBillingDefaults.server";

const EWMA_ALPHA = 0.2;        // 新样本权重：0.2 → 约10次收敛
const BOOTSTRAP_THRESHOLD = 5; // 前 N 条用简单均值

/** 任务类型的硬编码兜底默认值（未收集到足够样本时使用）。 */
function defaultCredits(taskType: AITaskType): number {
  if (taskType === "picture_translate") return DEFAULT_PICTURE_TRANSLATE_TOKEN_COST;
  if (taskType === "image_generation") return DEFAULT_IMAGE_GENERATION_IMAGE_TOKEN_COST;
  return 0;
}

/**
 * 计算新的 EWMA 值。
 * - sampleCount < BOOTSTRAP_THRESHOLD：简单均值（bootstrap 阶段）
 * - sampleCount >= BOOTSTRAP_THRESHOLD：指数加权移动均值
 */
function calcEwma(
  prev: number | null,
  prevCount: number,
  actual: number,
): number {
  if (prev == null || prevCount < BOOTSTRAP_THRESHOLD) {
    // bootstrap：简单均值
    const n = prevCount + 1;
    return ((prev ?? 0) * prevCount + actual) / n;
  }
  return EWMA_ALPHA * actual + (1 - EWMA_ALPHA) * prev;
}

/**
 * 读取当前预估积分。
 * 优先返回 EWMA 收敛值，不足5条时返回硬编码默认值。
 */
export async function getEstimatedCredits(
  appName: string,
  taskType: AITaskType,
): Promise<number> {
  try {
    const row = await prisma.aITaskEstimation.findUnique({
      where: { appName_taskType: { appName, taskType } },
      select: { ewmaCredits: true, sampleCount: true },
    });
    if (row?.ewmaCredits != null && row.sampleCount >= BOOTSTRAP_THRESHOLD) {
      return Math.max(1, Math.round(row.ewmaCredits));
    }
  } catch {
    // DB 异常时降级到默认值
  }
  return defaultCredits(taskType);
}

/**
 * 读取当前预估耗时（秒）。
 * 不足5条时返回 null（页面不展示预估时间）。
 */
export async function getEstimatedSeconds(
  appName: string,
  taskType: AITaskType,
): Promise<number | null> {
  try {
    const row = await prisma.aITaskEstimation.findUnique({
      where: { appName_taskType: { appName, taskType } },
      select: { ewmaSeconds: true, sampleCount: true },
    });
    if (row?.ewmaSeconds != null && row.sampleCount >= BOOTSTRAP_THRESHOLD) {
      return Math.max(1, Math.round(row.ewmaSeconds));
    }
  } catch {}
  return null;
}

/**
 * 任务完成后更新 EWMA（fire-and-forget，失败不影响主流程）。
 */
export async function updateTaskEstimation(params: {
  appName: string;
  taskType: AITaskType;
  actualCredits: number | null;
  actualSeconds: number | null;
}): Promise<void> {
  const { appName, taskType } = params;
  if (!appName || !taskType) return;

  try {
    const existing = await prisma.aITaskEstimation.findUnique({
      where: { appName_taskType: { appName, taskType } },
    });

    const prevCount = existing?.sampleCount ?? 0;
    const newCount = prevCount + 1;

    const newEwmaCredits =
      params.actualCredits != null
        ? calcEwma(existing?.ewmaCredits ?? null, prevCount, params.actualCredits)
        : existing?.ewmaCredits ?? null;

    const newEwmaSeconds =
      params.actualSeconds != null && params.actualSeconds > 0
        ? calcEwma(existing?.ewmaSeconds ?? null, prevCount, params.actualSeconds)
        : existing?.ewmaSeconds ?? null;

    await prisma.aITaskEstimation.upsert({
      where: { appName_taskType: { appName, taskType } },
      update: {
        ewmaCredits: newEwmaCredits,
        ewmaSeconds: newEwmaSeconds,
        sampleCount: newCount,
      },
      create: {
        appName,
        taskType,
        ewmaCredits: newEwmaCredits,
        ewmaSeconds: newEwmaSeconds,
        sampleCount: newCount,
      },
    });
  } catch (e) {
    console.error("[AITaskEstimation] updateTaskEstimation failed", e);
  }
}
