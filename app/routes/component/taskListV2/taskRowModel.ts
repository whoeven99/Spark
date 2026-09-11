/**
 * 把三类任务（AI 任务 / 经营任务 / 定时任务）压成同一个行模型。
 *
 * 压缩列表只呈现「这是什么、跑到哪了、什么时候、下一步点哪」，
 * 详细字段留给详情弹窗，不在行里铺开。
 */
import type { AITaskItem, AITaskStatus, AITaskType } from "../../../lib/aiTaskTypes";
import type { UnifiedTaskEntry } from "../../../lib/unifiedTaskTypes";
import { isChatInlineReviewTask } from "../chat/chatInlineReviewTasks";

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

export type TaskRowAction =
  /** 在本页弹窗里看结果或做审核 */
  | { type: "detail"; label: string; primary: boolean }
  /** 交给助手继续处理，带预填话术 */
  | { type: "chat"; label: string; prompt: string }
  | { type: "none" };

export type TaskRowModel = {
  key: string;
  taskId: string;
  entryType: UnifiedTaskEntry["entryType"];
  typeLabel: string;
  title: string;
  /** 副行的次要信息，已按有值过滤 */
  meta: string[];
  /** 排序与展示共用的时间戳 */
  timestamp: string;
  /** AI 任务才有语义状态色，其余类型用 statusText */
  aiStatus: AITaskStatus | null;
  statusText: string | null;
  action: TaskRowAction;
};

const AI_TYPE_LABEL_KEY: Record<AITaskType, string> = {
  product_improve: "tasksV2.type.productImprove",
  image_generation: "tasksV2.type.imageGeneration",
  picture_translate: "tasksV2.type.pictureTranslate",
  ads_catalog_sync: "tasksV2.type.adsCatalogSync",
  bulk_price_edit: "tasksV2.type.bulkPriceEdit",
  bulk_tag_edit: "tasksV2.type.bulkTagEdit",
  bulk_status_edit: "tasksV2.type.bulkStatusEdit",
};

/** 库里可能出现、但尚未收入 AITaskType 联合的任务类型。 */
const EXTRA_AI_TYPE_LABEL_KEY: Record<string, string> = {
  product_import: "tasksV2.type.productImport",
  product_export: "tasksV2.type.productExport",
  product_duplicate: "tasksV2.type.productDuplicate",
};

/** 内部 key（snake / kebab），不应直接展示给商户。 */
const MACHINE_KEY_RE = /^[a-z][a-z0-9]*([_-][a-z0-9]+)+$/;

function translateKey(key: string, t: TranslateFn): string | null {
  const label = t(key);
  return label && label !== key ? label : null;
}

/** 任务类型一律走 i18n；没有条目时用「其他任务」，不把 raw key 亮出去。 */
export function resolveAiTypeLabel(taskType: string, t: TranslateFn): string {
  const mapped =
    AI_TYPE_LABEL_KEY[taskType as AITaskType] ?? EXTRA_AI_TYPE_LABEL_KEY[taskType];
  if (mapped) {
    const label = translateKey(mapped, t);
    if (label) return label;
  }
  const snakeLabel = translateKey(`tasksV2.type.${taskType}`, t);
  if (snakeLabel) return snakeLabel;
  return t("tasksV2.type.unknown");
}

function localizeMachineName(value: string, t: TranslateFn): string {
  if (!MACHINE_KEY_RE.test(value)) return value;
  const asType = resolveAiTypeLabel(value, t);
  return asType === t("tasksV2.type.unknown") ? value : asType;
}

const OPERATION_STATUS_LABEL_KEY: Record<string, string> = {
  open: "taskWorkbench.taskStatusOpen",
  in_progress: "taskWorkbench.taskStatusInProgress",
  done: "taskWorkbench.taskStatusDone",
  ignored: "taskWorkbench.taskStatusIgnored",
  auto_closed: "taskWorkbench.taskStatusAutoClosed",
};

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readCount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function describeAiTask(task: AITaskItem, t: TranslateFn): string {
  const config = task.config ?? {};

  switch (task.taskType) {
    case "product_improve":
      return readString(config.originalTitle) ?? t("tasksV2.fallback.product");
    case "image_generation":
      return (
        readString(config.description) ??
        readString(config.prompt) ??
        t("tasksV2.fallback.image")
      );
    case "picture_translate": {
      const source = readString(config.sourceCode);
      const target = readString(config.targetCode);
      return source && target ? `${source} → ${target}` : t("tasksV2.fallback.image");
    }
    case "bulk_price_edit":
    case "bulk_tag_edit":
    case "bulk_status_edit": {
      const total = readCount(config.totalProducts);
      return total != null
        ? t("tasksV2.fallback.products", { count: total })
        : t("tasksV2.fallback.bulk");
    }
    case "ads_catalog_sync":
      return readString(config.platform) ?? t("tasksV2.fallback.ads");
    default: {
      const exhaustive: never = task.taskType;
      void exhaustive;
      return (
        localizeMachineName(
          readString(config.originalTitle) ??
            readString(config.title) ??
            readString(config.fileName) ??
            readString(config.filename) ??
            readString(config.name) ??
            "",
          t,
        ) || t("tasksV2.fallback.generic")
      );
    }
  }
}

function resolveAiAction(task: AITaskItem, t: TranslateFn): TaskRowAction {
  // 详情弹窗复用的是对话内审核那套组件，白名单外的类型没有可挂的详情页。
  if (!isChatInlineReviewTask(task.taskType)) return { type: "none" };

  if (task.status === "pending_review" || task.status === "scored") {
    return { type: "detail", label: t("tasksV2.action.review"), primary: true };
  }
  if (task.status === "failed") {
    return { type: "detail", label: t("tasksV2.action.viewReason"), primary: false };
  }
  if (task.status === "running") {
    return { type: "detail", label: t("tasksV2.action.viewProgress"), primary: false };
  }
  return { type: "detail", label: t("tasksV2.action.viewResult"), primary: false };
}

function buildAiMeta(task: AITaskItem, t: TranslateFn): string[] {
  const credits = task.actualCredits ?? task.estimatedCredits;
  return [
    credits != null && credits > 0
      ? t("tasksV2.meta.credits", { value: credits })
      : null,
  ].filter((item): item is string => Boolean(item));
}

export function buildTaskRow(entry: UnifiedTaskEntry, t: TranslateFn): TaskRowModel {
  if (entry.entryType === "ai_task") {
    const { task } = entry;
    const typeLabel = resolveAiTypeLabel(task.taskType, t);
    const described = localizeMachineName(describeAiTask(task, t), t);
    return {
      key: `ai:${task.id}`,
      taskId: task.id,
      entryType: "ai_task",
      typeLabel,
      title: described && described !== typeLabel ? described : t("tasksV2.fallback.generic"),
      meta: buildAiMeta(task, t),
      timestamp: task.updatedAt || task.createdAt,
      aiStatus: task.status,
      statusText: null,
      action: resolveAiAction(task, t),
    };
  }

  if (entry.entryType === "operation_task") {
    const { task } = entry;
    const statusKey = OPERATION_STATUS_LABEL_KEY[task.status];
    return {
      key: `operation:${task.id}`,
      taskId: task.id,
      entryType: "operation_task",
      typeLabel: t("tasksV2.type.operation"),
      title: task.title,
      meta: [task.ownerRole].filter((item): item is string => Boolean(item)),
      timestamp: task.resolvedAt ?? task.createdAt,
      aiStatus: null,
      statusText: statusKey ? t(statusKey) : task.status,
      action: {
        type: "chat",
        label: t("tasksV2.action.handle"),
        prompt: t("tasksV2.prompt.operation", {
          title: task.title,
          reason: task.triggerReason,
        }),
      },
    };
  }

  const { task } = entry;
  return {
    key: `automation:${task.id}`,
    taskId: task.id,
    entryType: "automation_task",
    typeLabel: t("tasksV2.type.automation"),
    title: task.title,
    meta: [task.schedule].filter((item): item is string => Boolean(item)),
    timestamp: task.updatedAt || task.createdAt,
    aiStatus: null,
    statusText: t(
      task.enabled ? "tasksV2.status.automationOn" : "tasksV2.status.automationOff",
    ),
    action: task.defaultQuestion
      ? { type: "chat", label: t("tasksV2.action.run"), prompt: task.defaultQuestion }
      : { type: "none" },
  };
}

/** 严格按时间倒序；不给任何任务类型置顶特权。 */
export function sortTaskRowsByTimeDesc(rows: TaskRowModel[]): TaskRowModel[] {
  return [...rows].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}

/**
 * 相对时间：一天内用相对说法，超过一天落到具体日期。
 * SSR 与首帧统一走 UTC，避免 hydrate 前后文案跳动。
 */
export function formatTaskRowTime(
  iso: string,
  t: TranslateFn,
  language: string,
  hydrated: boolean,
): string {
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) return "—";

  const diffMinutes = Math.floor((Date.now() - time) / 60000);
  if (diffMinutes < 1) return t("tasksV2.time.justNow");
  if (diffMinutes < 60) return t("tasksV2.time.minutesAgo", { value: diffMinutes });

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return t("tasksV2.time.hoursAgo", { value: diffHours });

  return new Date(time).toLocaleString(language, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    ...(hydrated ? {} : { timeZone: "UTC" }),
  });
}
