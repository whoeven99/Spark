import type { AITaskItem, AITaskStatus, AITaskType } from "../../lib/aiTaskTypes";
import type { WorkspaceDashboardTaskSummary } from "../../lib/workspaceDashboardTypes";
import type { UnifiedTaskEntry } from "../../lib/unifiedTaskTypes";

const AI_TASK_TYPE_LABELS: Record<AITaskType, string> = {
  product_improve: "商品文案优化",
  image_generation: "图片生成",
  picture_translate: "图片翻译",
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

export function buildWorkspaceTaskSummaries(
  entries: UnifiedTaskEntry[],
): WorkspaceDashboardTaskSummary[] {
  return entries
    .filter((entry): entry is Extract<UnifiedTaskEntry, { entryType: "ai_task" }> =>
      entry.entryType === "ai_task",
    )
    .map((entry) => summarizeAITask(entry.task));
}
