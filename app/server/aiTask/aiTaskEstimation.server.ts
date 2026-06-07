import prisma from "../../db.server";
import type { AITaskType } from "../../lib/aiTaskTypes";
import {
  DEFAULT_IMAGE_GENERATION_IMAGE_TOKEN_COST,
  DEFAULT_PICTURE_TRANSLATE_TOKEN_COST,
} from "../tokenUsage/tokenBillingDefaults.server";

const EWMA_ALPHA = 0.2;
const BOOTSTRAP_THRESHOLD = 5;

function defaultCredits(taskType: AITaskType): number {
  if (taskType === "picture_translate") return DEFAULT_PICTURE_TRANSLATE_TOKEN_COST;
  if (taskType === "image_generation") return DEFAULT_IMAGE_GENERATION_IMAGE_TOKEN_COST;
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

export async function getEstimatedCredits(taskType: AITaskType): Promise<number> {
  try {
    const row = await prisma.aITaskEstimation.findUnique({
      where: { taskType },
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

export async function getEstimatedSeconds(taskType: AITaskType): Promise<number | null> {
  try {
    const row = await prisma.aITaskEstimation.findUnique({
      where: { taskType },
      select: { ewmaSeconds: true, sampleCount: true },
    });
    if (row?.ewmaSeconds != null && row.sampleCount >= BOOTSTRAP_THRESHOLD) {
      return Math.max(1, Math.round(row.ewmaSeconds));
    }
  } catch {}
  return null;
}

export async function updateTaskEstimation(params: {
  taskType: AITaskType;
  actualCredits: number | null;
  actualSeconds: number | null;
}): Promise<void> {
  const { taskType } = params;
  if (!taskType) return;

  try {
    const existing = await prisma.aITaskEstimation.findUnique({
      where: { taskType },
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
      where: { taskType },
      update: {
        ewmaCredits: newEwmaCredits,
        ewmaSeconds: newEwmaSeconds,
        sampleCount: newCount,
      },
      create: {
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
