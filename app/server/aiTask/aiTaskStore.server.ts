import prisma from "../../db.server";
import { getGeneratedImageReadUrl } from "../imageGeneration/imageGenerationBlob.server";
import type {
  AITaskItem,
  AITaskListMetrics,
  AITaskListPageData,
  AITaskListView,
  AITaskLogEntry,
  AITaskStatus,
  AITaskType,
} from "../../lib/aiTaskTypes";
import {
  parseAITaskMessage,
  serializeAITaskMessage,
  type AITaskMessageInput,
} from "../../lib/aiTaskMessage";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PrismaJson = any;

const TASK_LIST_LIMIT = 20;
const TASK_PAGE_SIZE = 8;

function normalizeTaskPage(page: number | undefined): number {
  if (!Number.isFinite(page) || !page || page < 1) return 1;
  return Math.floor(page);
}

function normalizeTaskPageSize(pageSize: number | undefined): number {
  if (!Number.isFinite(pageSize) || !pageSize || pageSize < 1) return TASK_PAGE_SIZE;
  return Math.min(Math.floor(pageSize), TASK_LIST_LIMIT);
}

function buildTaskTypeWhere(params: {
  taskType?: AITaskType;
  taskTypes?: AITaskType[];
}) {
  if (params.taskType) {
    return { taskType: params.taskType };
  }
  if (params.taskTypes && params.taskTypes.length > 0) {
    return { taskType: { in: params.taskTypes } };
  }
  return {};
}

function buildTaskListWhere(params: {
  shop: string;
  appName: string;
  taskType?: AITaskType;
  taskTypes?: AITaskType[];
}) {
  return {
    shop: params.shop,
    appName: params.appName,
    ...buildTaskTypeWhere(params),
  };
}

function buildTaskViewWhere(view: AITaskListView, cutoff: Date) {
  return view === "current" ? { createdAt: { gte: cutoff } } : { createdAt: { lt: cutoff } };
}

function toAITaskStatus(raw: string): AITaskStatus {
  if (
    raw === "running" ||
    raw === "succeeded" ||
    raw === "failed" ||
    raw === "cancelled" ||
    raw === "pending_review" ||
    raw === "applied" ||
    raw === "scored"
  ) {
    return raw;
  }
  return "failed";
}

function resolveImageUrl(blobPath: string | null | undefined): string | null {
  if (!blobPath?.trim()) return null;
  try {
    return getGeneratedImageReadUrl(blobPath.trim());
  } catch {
    return null;
  }
}

function resolveResultImageUrl(
  taskType: string,
  result: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!result) return null;
  const out = { ...result };
  if (taskType === "image_generation") {
    const url = resolveImageUrl(result.blobPath as string | null);
    if (url) out.imageUrl = url;
  } else if (taskType === "picture_translate") {
    const url = resolveImageUrl(result.translatedBlobPath as string | null);
    if (url) out.imageUrl = url;
  }
  return out;
}

function rowToAITaskItem(row: {
  id: string;
  batchId: string;
  shop: string;
  appName: string;
  taskType: string;
  status: string;
  config: unknown;
  result: unknown;
  estimatedCredits: number | null;
  actualCredits: number | null;
  startedAt: Date;
  completedAt: Date | null;
  errorMsg: string | null;
  createdAt: Date;
  updatedAt: Date;
}): AITaskItem {
  const result =
    row.result != null ? (row.result as Record<string, unknown>) : null;
  const parsedError = parseAITaskMessage(row.errorMsg);
  return {
    id: row.id,
    batchId: row.batchId,
    shop: row.shop,
    appName: row.appName,
    taskType: row.taskType as AITaskType,
    status: toAITaskStatus(row.status),
    config: row.config as Record<string, unknown>,
    result: resolveResultImageUrl(row.taskType, result),
    estimatedCredits: row.estimatedCredits,
    actualCredits: row.actualCredits,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    errorMsg: parsedError.text || null,
    errorMsgKey: parsedError.key,
    errorMsgParams: parsedError.params,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function createBatchWithTask(params: {
  shop: string;
  appName: string;
  taskType: AITaskType;
  batchConfig: Record<string, unknown>;
  taskConfig: Record<string, unknown>;
  estimatedCredits?: number;
}): Promise<{ batchId: string; taskId: string }> {
  const batch = await prisma.aITaskBatch.create({
    data: {
      shop: params.shop,
      appName: params.appName,
      taskType: params.taskType,
      config: params.batchConfig as unknown as PrismaJson,
      tasks: {
        create: {
          shop: params.shop,
          appName: params.appName,
          taskType: params.taskType,
          status: "running",
          config: params.taskConfig as unknown as PrismaJson,
          estimatedCredits: params.estimatedCredits ?? null,
        },
      },
    },
    include: { tasks: { select: { id: true } } },
  }) as { id: string; tasks: { id: string }[] };
  return { batchId: batch.id, taskId: batch.tasks[0].id };
}

export async function markTaskSucceeded(params: {
  taskId: string;
  result: Record<string, unknown>;
  actualCredits?: number;
}): Promise<void> {
  await prisma.aITask.update({
    where: { id: params.taskId },
    data: {
      status: "succeeded",
      result: params.result as unknown as PrismaJson,
      actualCredits: params.actualCredits ?? null,
      completedAt: new Date(),
    },
  });
}

export async function markTaskFailed(params: {
  taskId: string;
  errorMsg: AITaskMessageInput;
}): Promise<void> {
  const serializedError = serializeAITaskMessage(params.errorMsg);
  await prisma.aITask.update({
    where: { id: params.taskId },
    data: {
      status: "failed",
      errorMsg: serializedError.slice(0, 2000),
      completedAt: new Date(),
    },
  });
}

export async function markTaskPendingReview(params: {
  taskId: string;
  result: Record<string, unknown>;
  actualCredits?: number;
}): Promise<void> {
  await prisma.aITask.update({
    where: { id: params.taskId },
    data: {
      status: "pending_review",
      result: params.result as unknown as PrismaJson,
      actualCredits: params.actualCredits ?? null,
      completedAt: new Date(),
    },
  });
}

export async function markTaskApplied(taskId: string): Promise<void> {
  await prisma.aITask.update({
    where: { id: taskId },
    data: { status: "applied" },
  });
}

export async function markTaskAppliedWithResult(params: {
  taskId: string;
  result?: Record<string, unknown>;
}): Promise<void> {
  await prisma.aITask.update({
    where: { id: params.taskId },
    data: {
      status: "applied",
      ...(params.result
        ? { result: params.result as unknown as PrismaJson }
        : {}),
    },
  });
}

export async function markTaskScored(params: {
  taskId: string;
  result?: Record<string, unknown>;
}): Promise<void> {
  await prisma.aITask.update({
    where: { id: params.taskId },
    data: {
      status: "scored",
      ...(params.result
        ? { result: params.result as unknown as PrismaJson }
        : {}),
    },
  });
}

export async function markTaskCancelled(taskId: string): Promise<void> {
  await prisma.aITask.update({
    where: { id: taskId },
    data: { status: "cancelled", completedAt: new Date() },
  });
}

export async function getTaskForShop(params: {
  taskId: string;
  shop: string;
}): Promise<AITaskItem | null> {
  const row = await prisma.aITask.findFirst({
    where: { id: params.taskId, shop: params.shop },
  });
  if (!row) return null;
  return rowToAITaskItem(row);
}

export async function listRecentTasksForShop(params: {
  shop: string;
  appName: string;
  taskType?: AITaskType;
  limit?: number;
}): Promise<AITaskItem[]> {
  const rows = await prisma.aITask.findMany({
    where: {
      shop: params.shop,
      appName: params.appName,
      ...(params.taskType ? { taskType: params.taskType } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: params.limit ?? TASK_LIST_LIMIT,
  });
  return rows.map(rowToAITaskItem);
}

export async function getTaskListMetricsForShop(params: {
  shop: string;
  appName: string;
  taskType?: AITaskType;
  taskTypes?: AITaskType[];
}): Promise<AITaskListMetrics> {
  const baseWhere = buildTaskListWhere(params);
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [currentCount, historyCount, runningCount] = await Promise.all([
    prisma.aITask.count({
      where: {
        ...baseWhere,
        createdAt: { gte: cutoff },
      },
    }),
    prisma.aITask.count({
      where: {
        ...baseWhere,
        createdAt: { lt: cutoff },
      },
    }),
    prisma.aITask.count({
      where: {
        ...baseWhere,
        status: "running",
      },
    }),
  ]);

  return {
    currentCount,
    historyCount,
    runningCount,
    totalCount: currentCount + historyCount,
  };
}

export async function listTasksPageForShop(params: {
  shop: string;
  appName: string;
  view: AITaskListView;
  page?: number;
  pageSize?: number;
  taskType?: AITaskType;
  taskTypes?: AITaskType[];
}): Promise<AITaskListPageData> {
  const pageSize = normalizeTaskPageSize(params.pageSize);
  const requestedPage = normalizeTaskPage(params.page);
  const baseWhere = buildTaskListWhere(params);
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const metrics = await getTaskListMetricsForShop(params);
  const totalCount = params.view === "current" ? metrics.currentCount : metrics.historyCount;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const rows = await prisma.aITask.findMany({
    where: {
      ...baseWhere,
      ...buildTaskViewWhere(params.view, cutoff),
    },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * pageSize,
    take: pageSize,
  });

  return {
    tasks: rows.map(rowToAITaskItem),
    view: params.view,
    page,
    pageSize,
    totalCount,
    totalPages,
    metrics,
  };
}

export async function listTaskLogs(taskId: string): Promise<AITaskLogEntry[]> {
  const rows = await prisma.aITaskLog.findMany({
    where: { taskId },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => {
    const parsedMessage = parseAITaskMessage(r.message);
    return {
      message: parsedMessage.text,
      messageKey: parsedMessage.key,
      messageParams: parsedMessage.params,
      id: r.id,
      taskId: r.taskId,
      elapsedSeconds: r.elapsedSeconds,
      createdAt: r.createdAt.toISOString(),
    };
  });
}

export async function appendTaskLog(params: {
  taskId: string;
  elapsedSeconds: number;
  message: AITaskMessageInput;
}): Promise<AITaskLogEntry> {
  const serializedMessage = serializeAITaskMessage(params.message);
  const row = await prisma.aITaskLog.create({
    data: {
      taskId: params.taskId,
      elapsedSeconds: params.elapsedSeconds,
      message: serializedMessage,
    },
  });
  const parsedMessage = parseAITaskMessage(row.message);
  return {
    message: parsedMessage.text,
    messageKey: parsedMessage.key,
    messageParams: parsedMessage.params,
    id: row.id,
    taskId: row.taskId,
    elapsedSeconds: row.elapsedSeconds,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function deleteTaskForShop(params: {
  taskId: string;
  shop: string;
}): Promise<
  | { ok: true; taskType: AITaskType; result: Record<string, unknown> | null }
  | { ok: false; status: number; errorMsg: string }
> {
  const row = await prisma.aITask.findFirst({
    where: { id: params.taskId, shop: params.shop },
  });
  if (!row) {
    return { ok: false, status: 404, errorMsg: "Task not found" };
  }
  await prisma.aITask.delete({ where: { id: params.taskId } });
  return {
    ok: true,
    taskType: row.taskType as AITaskType,
    result: row.result as Record<string, unknown> | null,
  };
}
