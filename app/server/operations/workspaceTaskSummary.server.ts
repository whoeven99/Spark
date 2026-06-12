import type { AITaskItem, AITaskStatus, AITaskType } from "../../lib/aiTaskTypes";
import type { WorkspaceDashboardTaskSummary } from "../../lib/workspaceDashboardTypes";
import type { UnifiedTaskEntry } from "../../lib/unifiedTaskTypes";
import type {
  TranslationV4Metrics,
  TranslationV4Status,
} from "../translation/v4/types";

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

const V4_STATUS_LABELS: Record<TranslationV4Status, string> = {
  CREATED: "已创建",
  INIT_QUEUED: "等待初始化",
  INITIALIZING: "初始化中",
  INIT_DONE: "初始化完成",
  TRANSLATE_QUEUED: "等待翻译",
  TRANSLATING: "翻译中",
  TRANSLATE_DONE: "翻译完成",
  WRITEBACK_QUEUED: "等待写回",
  WRITING_BACK: "写回 Shopify 中",
  VERIFY_QUEUED: "等待校验",
  VERIFYING: "校验中",
  COMPLETED: "已完成",
  FAILED: "失败",
  PAUSED: "已暂停",
  CANCELLED: "已取消",
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

function v4ModuleSummary(modules: string[]): string {
  const names: Record<string, string> = {
    PRODUCT: "商品",
    COLLECTION: "集合",
    PAGE: "页面",
    ARTICLE: "文章",
    BLOG: "博客",
    MENU: "导航菜单",
  };
  const shown = modules.slice(0, 3).map((m) => names[m] ?? m);
  if (modules.length > 3) {
    return `${shown.join("、")} 等 ${modules.length} 个模块`;
  }
  return shown.join("、");
}

function v4ProgressDetail(metrics: TranslationV4Metrics): string {
  if (metrics.translateTotal > 0) {
    return `翻译进度 ${metrics.translateDone}/${metrics.translateTotal}`;
  }
  if (metrics.initTotal > 0) {
    return `初始化 ${metrics.initDone}/${metrics.initTotal}`;
  }
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

function summarizeV4Job(
  job: UnifiedTaskEntry & { entryType: "translation_v4" },
): WorkspaceDashboardTaskSummary {
  const v4Job = job.job;
  const statusLabel = V4_STATUS_LABELS[v4Job.status] ?? v4Job.status;
  const moduleText =
    v4Job.modules.length > 0 ? v4ModuleSummary(v4Job.modules) : "";
  const progress = v4ProgressDetail(v4Job.metrics);
  const localeText = v4Job.target ? `目标语言 ${v4Job.target}` : "";
  const parts = [statusLabel, formatTaskTimestamp(v4Job.updatedAt)];
  if (moduleText) parts.push(moduleText);
  if (localeText) parts.push(localeText);
  if (progress) parts.push(progress);
  return {
    id: v4Job.id,
    title: "多语言翻译",
    result: parts.join(" · "),
  };
}

export function buildWorkspaceTaskSummaries(
  entries: UnifiedTaskEntry[],
): WorkspaceDashboardTaskSummary[] {
  return entries.map((entry) => {
    if (entry.entryType === "ai_task") {
      return summarizeAITask(entry.task);
    }
    return summarizeV4Job(entry);
  });
}
