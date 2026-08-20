import type { AITaskItem, AITaskStatus, AITaskType } from "../../lib/aiTaskTypes";
import type { WorkspaceDashboardTaskSummary } from "../../lib/workspaceDashboardTypes";
import type { UnifiedTaskEntry } from "../../lib/unifiedTaskTypes";
import type { OperationTaskView } from "./dailyInspection.server";

const AI_TASK_TYPE_LABELS: Record<AITaskType, string> = {
  product_improve: "商品文案优化",
  image_generation: "图片生成",
  picture_translate: "图片翻译",
  ads_catalog_sync: "广告 Catalog 同步",
};

const AI_STATUS_LABELS: Record<AITaskStatus, string> = {
  running: "执行中",
  succeeded: "已完成",
  failed: "失败",
  cancelled: "已取消",
  pending_review: "待审核",
  applied: "已应用",
  scored: "已评分",
};

function formatTaskTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("zh-CN", { hour12: false });
}

function aiTaskDetail(task: AITaskItem): string {
  const cfg = task.config;
  if (task.taskType === "product_improve") {
    const products = cfg.products as unknown[] | undefined;
    if (Array.isArray(products) && products.length > 0) {
      return `${products.length} 个商品`;
    }
    const productId = cfg.productId as string | undefined;
    if (productId) return "1 个商品";
  }
  if (task.taskType === "image_generation") {
    const prompt =
      (cfg.description as string | undefined) || (cfg.prompt as string | undefined);
    if (prompt?.trim()) return prompt.trim().slice(0, 48);
  }
  if (task.taskType === "picture_translate") {
    const source = cfg.sourceCode as string | undefined;
    const target = cfg.targetCode as string | undefined;
    if (source || target) return `${source ?? "auto"} → ${target ?? ""}`.trim();
  }
  if (task.errorMsg?.trim()) return task.errorMsg.trim().slice(0, 64);
  return "";
}

function summarizeAITask(task: AITaskItem): WorkspaceDashboardTaskSummary {
  const detail = aiTaskDetail(task);
  const statusLabel = AI_STATUS_LABELS[task.status];
  const parts = [statusLabel, formatTaskTimestamp(task.updatedAt)];
  if (detail) parts.push(detail);
  return {
    id: task.id,
    title: AI_TASK_TYPE_LABELS[task.taskType],
    result: parts.join(" · "),
  };
}

const OPERATION_STATUS_LABELS: Record<string, string> = {
  open: "待处理",
  in_progress: "进行中",
  done: "已完成",
  ignored: "已忽略",
  auto_closed: "已自动关闭",
};

function summarizeOperationTask(task: OperationTaskView): WorkspaceDashboardTaskSummary {
  const statusLabel = OPERATION_STATUS_LABELS[task.status] ?? task.status;
  const actionHint = task.suggestedActions[0] ?? task.triggerReason;
  return {
    id: task.id,
    title: task.title,
    result: [task.priority, statusLabel, actionHint].filter(Boolean).join(" · "),
  };
}

export function buildWorkspaceTaskSummaries(
  entries: UnifiedTaskEntry[],
): WorkspaceDashboardTaskSummary[] {
  return entries
    .map((entry) =>
      entry.entryType === "ai_task"
        ? summarizeAITask(entry.task)
        : summarizeOperationTask(entry.task),
    );
}
