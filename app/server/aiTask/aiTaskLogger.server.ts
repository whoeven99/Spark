import {
  appendTaskLog,
  markTaskFailed,
  markTaskPendingReview,
  markTaskSucceeded,
} from "./aiTaskStore.server";
import {
  clearTaskSubscribers,
  emitTaskEvent,
} from "./aiTaskEventBus.server";

export async function appendLog(params: {
  taskId: string;
  startedAt: number;
  message: string;
}): Promise<void> {
  const elapsedSeconds = Math.floor((Date.now() - params.startedAt) / 1000);
  const entry = await appendTaskLog({
    taskId: params.taskId,
    elapsedSeconds,
    message: params.message,
  });
  emitTaskEvent(params.taskId, {
    type: "log",
    taskId: params.taskId,
    elapsedSeconds: entry.elapsedSeconds,
    message: entry.message,
    createdAt: entry.createdAt,
  });
}

export async function completeTask(params: {
  taskId: string;
  result: Record<string, unknown>;
  actualCredits?: number;
  finalMessage?: string;
}): Promise<void> {
  if (params.finalMessage) {
    const entry = await appendTaskLog({
      taskId: params.taskId,
      elapsedSeconds: 0,
      message: params.finalMessage,
    });
    emitTaskEvent(params.taskId, {
      type: "log",
      taskId: params.taskId,
      elapsedSeconds: entry.elapsedSeconds,
      message: entry.message,
      createdAt: entry.createdAt,
    });
  }
  await markTaskSucceeded({
    taskId: params.taskId,
    result: params.result,
    actualCredits: params.actualCredits,
  });
  emitTaskEvent(params.taskId, {
    type: "status_change",
    taskId: params.taskId,
    status: "succeeded",
    result: params.result,
  });
  clearTaskSubscribers(params.taskId);
}

export async function pendingReviewTask(params: {
  taskId: string;
  result: Record<string, unknown>;
  finalMessage?: string;
}): Promise<void> {
  if (params.finalMessage) {
    const entry = await appendTaskLog({
      taskId: params.taskId,
      elapsedSeconds: 0,
      message: params.finalMessage,
    });
    emitTaskEvent(params.taskId, {
      type: "log",
      taskId: params.taskId,
      elapsedSeconds: entry.elapsedSeconds,
      message: entry.message,
      createdAt: entry.createdAt,
    });
  }
  await markTaskPendingReview({ taskId: params.taskId, result: params.result });
  emitTaskEvent(params.taskId, {
    type: "status_change",
    taskId: params.taskId,
    status: "pending_review",
    result: params.result,
  });
  clearTaskSubscribers(params.taskId);
}

export async function failTask(params: {
  taskId: string;
  errorMsg: string;
  startedAt: number;
  finalMessage?: string;
}): Promise<void> {
  if (params.finalMessage) {
    const elapsedSeconds = Math.floor((Date.now() - params.startedAt) / 1000);
    const entry = await appendTaskLog({
      taskId: params.taskId,
      elapsedSeconds,
      message: params.finalMessage,
    });
    emitTaskEvent(params.taskId, {
      type: "log",
      taskId: params.taskId,
      elapsedSeconds: entry.elapsedSeconds,
      message: entry.message,
      createdAt: entry.createdAt,
    });
  }
  await markTaskFailed({
    taskId: params.taskId,
    errorMsg: params.errorMsg,
  });
  emitTaskEvent(params.taskId, {
    type: "status_change",
    taskId: params.taskId,
    status: "failed",
    errorMsg: params.errorMsg,
  });
  clearTaskSubscribers(params.taskId);
}
