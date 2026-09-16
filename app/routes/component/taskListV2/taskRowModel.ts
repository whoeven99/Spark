/**
 * 把三类任务压成两行列表模型：状态、对象、结论句、进度和下一步。
 */
import type { AITaskItem, AITaskStatus, AITaskType } from "../../../lib/aiTaskTypes";
import { safeTranslateAITaskMessage } from "../../../lib/aiTaskMessage";
import type { UnifiedTaskEntry } from "../../../lib/unifiedTaskTypes";
import {
  catalogPreviewActionLabel,
  progressPercentForCatalogTask,
} from "../catalogManage/catalogReviewUi";
import { isChatInlineReviewTask } from "../chat/chatInlineReviewTasks";

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

export type TaskRowAction =
  /** 本页先只选中这一行；审核仍走对话 */
  | { type: "select"; label: string; primary: boolean }
  /** 交给助手继续处理，带预填话术 */
  | { type: "chat"; label: string; prompt: string }
  | { type: "none" };

export type TaskRowModel = {
  key: string;
  taskId: string;
  entryType: UnifiedTaskEntry["entryType"];
  typeLabel: string;
  title: string;
  /** 对象旁的短计量，如「1 行」「86 个变体」 */
  meta: string[];
  /** 第二行结论，来自任务 v1 卡片主文案 */
  summary: string;
  progressPercent: number;
  timestamp: string;
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
  bulk_product_field_edit: "tasksV2.type.bulkProductFieldEdit",
  bulk_collection_edit: "tasksV2.type.bulkCollectionEdit",
  product_duplicate: "tasksV2.type.productDuplicate",
  bulk_archive: "tasksV2.type.bulkArchive",
  product_export: "tasksV2.type.productExport",
  product_import: "tasksV2.type.productImport",
  sku_export: "tasksV2.type.skuExport",
  inventory_export: "tasksV2.type.inventoryExport",
  inventory_import: "tasksV2.type.inventoryImport",
  inventory_qty_edit: "tasksV2.type.inventoryQtyEdit",
};

const MACHINE_KEY_RE = /^[a-z][a-z0-9]*([_-][a-z0-9]+)+$/;

function translateKey(key: string, t: TranslateFn): string | null {
  const label = t(key);
  return label && label !== key ? label : null;
}

export function resolveAiTypeLabel(taskType: string, t: TranslateFn): string {
  const mapped = AI_TYPE_LABEL_KEY[taskType as AITaskType];
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function failedReason(task: AITaskItem, t: TranslateFn): string {
  if (task.errorMsgKey) {
    return safeTranslateAITaskMessage({
      t,
      message: task.errorMsg ?? t("common.unknown"),
      messageKey: task.errorMsgKey,
      messageParams: task.errorMsgParams,
    });
  }
  return task.errorMsg ?? t("common.unknown");
}

function describeAiTask(task: AITaskItem, t: TranslateFn): string {
  const config = task.config ?? {};
  const result = asRecord(task.result);

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
    case "bulk_status_edit":
    case "bulk_product_field_edit":
    case "bulk_collection_edit":
    case "product_duplicate":
    case "bulk_archive": {
      const total = readCount(config.totalProducts);
      return total != null
        ? t("tasksV2.fallback.products", { count: total })
        : t("tasksV2.fallback.bulk");
    }
    case "ads_catalog_sync":
      return readString(config.platform) ?? t("tasksV2.fallback.ads");
    case "product_import":
    case "product_export":
    case "sku_export":
    case "inventory_export":
    case "inventory_import":
    case "inventory_qty_edit":
      return (
        readString(result?.fileName) ??
        readString(config.fileName) ??
        readString(config.filename) ??
        t("tasksV2.fallback.generic")
      );
    default: {
      const exhaustive: never = task.taskType;
      return exhaustive;
    }
  }
}

function catalogActionPrefix(
  taskType: AITaskType,
): "productImport" | "productExport" | "skuExport" | "inventoryExport" | "inventoryImport" | "inventoryQtyEdit" | null {
  if (taskType === "product_import") return "productImport";
  if (taskType === "product_export") return "productExport";
  if (taskType === "sku_export") return "skuExport";
  if (taskType === "inventory_export") return "inventoryExport";
  if (taskType === "inventory_import") return "inventoryImport";
  if (taskType === "inventory_qty_edit") return "inventoryQtyEdit";
  return null;
}

function catalogSummaryPrefix(taskType: AITaskType): string | null {
  switch (taskType) {
    case "product_import":
      return "productImport";
    case "product_export":
      return "productExport";
    case "sku_export":
      return "skuExport";
    case "inventory_export":
      return "inventoryExport";
    case "inventory_import":
      return "inventoryImport";
    case "inventory_qty_edit":
      return "inventoryQtyEdit";
    case "bulk_price_edit":
      return "bulkPriceEdit";
    case "bulk_tag_edit":
      return "bulkTagEdit";
    case "bulk_status_edit":
      return "bulkStatusEdit";
    case "bulk_product_field_edit":
      return "bulkProductFieldEdit";
    case "bulk_collection_edit":
      return "bulkCollectionEdit";
    case "product_duplicate":
      return "productDuplicate";
    case "bulk_archive":
      return "bulkArchive";
    case "product_improve":
    case "image_generation":
    case "picture_translate":
    case "ads_catalog_sync":
      return null;
    default: {
      const exhaustive: never = taskType;
      return exhaustive;
    }
  }
}

function readCatalogCounts(task: AITaskItem): {
  changed: number;
  skipped: number;
  exported: number;
  succeeded: number;
  failed: number;
  issues: number;
} {
  const result = asRecord(task.result);
  const summary = asRecord(result?.summary);
  const apply = asRecord(result?.apply);
  const changed = readCount(summary?.changed) ?? 0;
  const skipped = readCount(summary?.skipped) ?? readCount(summary?.issues) ?? 0;
  const exported = readCount(summary?.exported) ?? changed;
  return {
    changed,
    skipped,
    exported,
    succeeded: readCount(apply?.succeeded) ?? 0,
    failed: readCount(apply?.failed) ?? 0,
    issues: readCount(summary?.issues) ?? skipped,
  };
}

function buildCatalogSummary(
  prefix: string,
  task: AITaskItem,
  t: TranslateFn,
): string {
  const counts = readCatalogCounts(task);
  const reason = failedReason(task, t);
  switch (task.status) {
    case "running":
      return t(`${prefix}.cardPrimaryRunning`);
    case "pending_review":
      return t(`${prefix}.cardPrimaryPendingReview`, {
        changed: counts.changed,
        skipped: counts.skipped,
        exported: counts.exported,
        issues: counts.issues,
      });
    case "succeeded": {
      const key = `${prefix}.cardPrimarySucceeded`;
      const label = t(key, {
        exported: counts.exported,
        skipped: counts.skipped,
      });
      return label !== key
        ? label
        : t(`${prefix}.cardPrimaryApplied`, {
            succeeded: counts.succeeded,
            failed: counts.failed,
          });
    }
    case "applied":
      return t(`${prefix}.cardPrimaryApplied`, {
        succeeded: counts.succeeded,
        failed: counts.failed,
      });
    case "failed":
      return t(`${prefix}.cardPrimaryFailed`, { reason });
    case "cancelled":
      return t(`${prefix}.cardPrimaryCancelled`);
    case "scored":
      return t(`${prefix}.cardPrimaryPendingReview`, {
        changed: counts.changed,
        skipped: counts.skipped,
        exported: counts.exported,
        issues: counts.issues,
      });
    default: {
      const exhaustive: never = task.status;
      return exhaustive;
    }
  }
}

function buildAiSummary(task: AITaskItem, t: TranslateFn): string {
  const catalogPrefix = catalogSummaryPrefix(task.taskType);
  if (catalogPrefix) return buildCatalogSummary(catalogPrefix, task, t);

  const reason = failedReason(task, t);
  if (task.taskType === "product_improve") {
    switch (task.status) {
      case "running":
        return t("productImproveStage1.cardPrimaryRunning");
      case "pending_review":
        return t("productImproveStage1.cardPrimaryPendingReview");
      case "succeeded":
        return t("productImproveStage1.cardPrimarySucceeded");
      case "scored":
        return t("productImproveStage1.cardPrimaryScored");
      case "applied":
        return t("productImproveStage1.cardPrimaryApplied");
      case "failed":
        return t("productImproveStage1.cardPrimaryFailed", { errorReason: reason });
      case "cancelled":
        return t("productImproveStage1.cardPrimaryCancelled");
      default: {
        const exhaustive: never = task.status;
        return exhaustive;
      }
    }
  }

  if (task.taskType === "image_generation") {
    if (task.status === "running") return t("imageStudio.cardPrimaryGenerating");
    if (task.status === "failed") {
      return t("imageStudio.cardPrimaryGenerationFailed", { errorReason: reason });
    }
    return t("imageStudio.cardPrimaryGenerationReady");
  }

  if (task.taskType === "picture_translate") {
    if (task.status === "running") return t("imageStudio.cardPrimaryTranslating");
    if (task.status === "failed") {
      return t("imageStudio.cardPrimaryTranslateFailed", { errorReason: reason });
    }
    return t("imageStudio.cardPrimaryTranslateReady");
  }

  switch (task.status) {
    case "running":
      return t("tasksV2.summary.running");
    case "pending_review":
    case "scored":
      return t("tasksV2.summary.pendingReview");
    case "failed":
      return t("tasksV2.summary.failed", { reason });
    case "cancelled":
      return t("tasksV2.summary.cancelled");
    case "applied":
    case "succeeded":
      return t("tasksV2.summary.done");
    default: {
      const exhaustive: never = task.status;
      return exhaustive;
    }
  }
}

function resolveAiAction(task: AITaskItem, t: TranslateFn): TaskRowAction {
  if (!isChatInlineReviewTask(task.taskType)) return { type: "none" };

  const catalogPrefix = catalogActionPrefix(task.taskType);
  if (catalogPrefix) {
    return {
      type: "select",
      label: catalogPreviewActionLabel(task.status, t, catalogPrefix),
      primary: task.status === "pending_review" || task.status === "scored",
    };
  }

  if (task.status === "pending_review" || task.status === "scored") {
    return { type: "select", label: t("tasksV2.action.review"), primary: true };
  }
  if (task.status === "failed") {
    return { type: "select", label: t("tasksV2.action.viewReason"), primary: false };
  }
  if (task.status === "running") {
    return { type: "select", label: t("tasksV2.action.viewProgress"), primary: false };
  }
  return { type: "select", label: t("tasksV2.action.viewResult"), primary: false };
}

function buildAiMeta(task: AITaskItem, t: TranslateFn): string[] {
  const config = task.config ?? {};
  const result = asRecord(task.result);
  const summary = asRecord(result?.summary);

  if (task.taskType === "product_import" || task.taskType === "inventory_import") {
    const rows = readCount(summary?.rows) ?? readCount(config.totalProducts);
    return rows != null ? [t("tasksV2.meta.rows", { count: rows })] : [];
  }

  if (task.taskType === "bulk_price_edit") {
    const variants = readCount(summary?.variants);
    if (variants != null) return [t("tasksV2.meta.variants", { count: variants })];
  }

  if (
    task.taskType === "bulk_price_edit" ||
    task.taskType === "bulk_tag_edit" ||
    task.taskType === "bulk_status_edit" ||
    task.taskType === "bulk_product_field_edit" ||
    task.taskType === "bulk_collection_edit" ||
    task.taskType === "product_duplicate" ||
    task.taskType === "bulk_archive" ||
    task.taskType === "product_export" ||
    task.taskType === "sku_export" ||
    task.taskType === "inventory_export" ||
    task.taskType === "inventory_qty_edit"
  ) {
    const products = readCount(summary?.products) ?? readCount(config.totalProducts);
    return products != null ? [t("tasksV2.fallback.products", { count: products })] : [];
  }

  return [];
}

function buildAiProgress(task: AITaskItem): number {
  if (task.taskType === "product_improve") {
    const fromResult = readCount(asRecord(task.result)?.progressPercent);
    if (fromResult != null) return Math.max(0, Math.min(100, fromResult));
  }
  return progressPercentForCatalogTask(task.status);
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
      summary: buildAiSummary(task, t),
      progressPercent: buildAiProgress(task),
      timestamp: task.updatedAt || task.createdAt,
      aiStatus: task.status,
      statusText: null,
      action: resolveAiAction(task, t),
    };
  }

  if (entry.entryType === "operation_task") {
    const { task } = entry;
    const statusKey = OPERATION_STATUS_LABEL_KEY[task.status];
    const done = task.status === "done" || task.status === "ignored" || task.status === "auto_closed";
    return {
      key: `operation:${task.id}`,
      taskId: task.id,
      entryType: "operation_task",
      typeLabel: t("tasksV2.type.operation"),
      title: task.title,
      meta: [task.ownerRole].filter((item): item is string => Boolean(item)),
      summary: task.triggerReason || t("tasksV2.summary.pendingReview"),
      progressPercent: done ? 100 : 45,
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
    summary: task.summary || t("tasksV2.summary.done"),
    progressPercent: task.enabled ? 100 : 24,
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

export function sortTaskRowsByTimeDesc(rows: TaskRowModel[]): TaskRowModel[] {
  return [...rows].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}

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
