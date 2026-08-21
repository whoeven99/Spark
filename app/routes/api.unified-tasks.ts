import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import { authenticate } from "../shopify.server";
import { listTasksPageForShop } from "../server/aiTask/aiTaskStore.server";
import type { AITaskItem } from "../lib/aiTaskTypes";
import {
  listOperationTasks,
  updateOperationTaskStatus,
  type OperationTaskAction,
} from "../server/operations/dailyInspection.server";
import { isOperationTaskCurrent, isOperationTaskHistory } from "../lib/operationTaskList";
import { listScheduledAutomationTasks } from "../server/automation/scheduledAutomationCatalog.server";
import type {
  UnifiedTaskEntry,
  UnifiedTaskListResponse,
  UnifiedTaskStatusFilter,
  UnifiedTaskTypeFilter,
  UnifiedTaskView,
} from "../lib/unifiedTaskTypes";

const DEFAULT_PAGE_SIZE = 10;
const FETCH_ALL_SIZE = 200;

function entryUpdatedAt(entry: UnifiedTaskEntry): string {
  if (entry.entryType === "ai_task") return entry.task.updatedAt;
  if (entry.entryType === "automation_task") return entry.task.updatedAt;
  return entry.task.resolvedAt ?? entry.task.createdAt;
}

function parseTypeFilter(value: string | null): UnifiedTaskTypeFilter {
  if (
    value === "automation_task" ||
    value === "operation_task" ||
    value === "product_improve" ||
    value === "image_generation" ||
    value === "picture_translate"
  ) {
    return value;
  }
  return "all";
}

function parseStatusFilter(value: string | null): UnifiedTaskStatusFilter {
  if (
    value === "running" ||
    value === "open" ||
    value === "in_progress" ||
    value === "needs_review" ||
    value === "failed" ||
    value === "completed" ||
    value === "ignored"
  ) {
    return value;
  }
  return "all";
}

function parseOperationSourceFilter(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item, index, array) => item.length > 0 && array.indexOf(item) === index);
}

function matchesTypeFilter(
  entry: UnifiedTaskEntry,
  typeFilter: UnifiedTaskTypeFilter,
): boolean {
  if (typeFilter === "all") return true;
  if (entry.entryType === "automation_task") return typeFilter === "automation_task";
  if (entry.entryType === "operation_task") return typeFilter === "operation_task";
  return entry.task.taskType === typeFilter;
}

function matchesStatusFilter(
  entry: UnifiedTaskEntry,
  statusFilter: UnifiedTaskStatusFilter,
): boolean {
  if (statusFilter === "all") return true;

  if (entry.entryType === "automation_task") {
    return statusFilter === "open";
  }

  if (entry.entryType === "operation_task") {
    const status = entry.task.status;
    if (statusFilter === "running") return status === "in_progress";
    if (statusFilter === "open") return status === "open";
    if (statusFilter === "in_progress") return status === "in_progress";
    if (statusFilter === "completed") {
      return status === "done" || status === "auto_closed";
    }
    if (statusFilter === "ignored") return status === "ignored";
    if (statusFilter === "failed" || statusFilter === "needs_review") return false;
    return true;
  }

  const status = entry.task.status;
  if (statusFilter === "running") return status === "running";
  if (statusFilter === "needs_review") {
    return status === "pending_review" || status === "scored";
  }
  if (statusFilter === "failed") return status === "failed";
  if (statusFilter === "completed") {
    return status === "succeeded" || status === "applied";
  }
  return true;
}

function matchesOperationSourceFilter(entry: UnifiedTaskEntry, operationSourceFilter: string[]): boolean {
  if (operationSourceFilter.length === 0) return true;
  if (entry.entryType !== "operation_task") return false;
  return operationSourceFilter.includes(entry.task.sourceKey);
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const now = new Date();

  const view: UnifiedTaskView =
    url.searchParams.get("view") === "history" ? "history" : "current";
  const pageRaw = Number(url.searchParams.get("page"));
  const page =
    Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;
  const pageSizeRaw = Number(url.searchParams.get("pageSize"));
  const pageSize =
    Number.isFinite(pageSizeRaw) && pageSizeRaw >= 1
      ? Math.min(Math.floor(pageSizeRaw), 50)
      : DEFAULT_PAGE_SIZE;
  const typeFilter = parseTypeFilter(url.searchParams.get("type"));
  const statusFilter = parseStatusFilter(url.searchParams.get("status"));
  const operationSourceFilter = parseOperationSourceFilter(url.searchParams.get("operationSource"));

  const [aiTaskPage, operationTasks] = await Promise.all([
    listTasksPageForShop({
      shop: session.shop,
      view,
      page: 1,
      pageSize: FETCH_ALL_SIZE,
    }),
    listOperationTasks(session.shop),
  ]);
  const automationEntries: UnifiedTaskEntry[] =
    view === "current"
      ? listScheduledAutomationTasks().map((task) => ({
          entryType: "automation_task",
          task,
        }))
      : [];

  const aiEntries: UnifiedTaskEntry[] = aiTaskPage.tasks.map((task: AITaskItem) => ({
    entryType: "ai_task",
    task,
  }));
  const operationEntries: UnifiedTaskEntry[] = operationTasks
    .filter((task) => {
      return view === "history"
        ? isOperationTaskHistory(task, now)
        : isOperationTaskCurrent(task, now);
    })
    .map((task) => ({
      entryType: "operation_task",
      task,
    }));

  const merged = [...automationEntries, ...aiEntries, ...operationEntries]
    .filter((entry) => matchesTypeFilter(entry, typeFilter))
    .filter((entry) => matchesStatusFilter(entry, statusFilter))
    .filter((entry) => matchesOperationSourceFilter(entry, operationSourceFilter))
    .sort((a, b) => {
      if (a.entryType === "automation_task" && b.entryType === "automation_task") {
        return a.task.sortOrder - b.task.sortOrder;
      }
      if (a.entryType === "automation_task") return -1;
      if (b.entryType === "automation_task") return 1;
      return new Date(entryUpdatedAt(b)).getTime() - new Date(entryUpdatedAt(a)).getTime();
    });

  const totalCount = merged.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const entries = merged.slice((page - 1) * pageSize, page * pageSize);

  return data<UnifiedTaskListResponse>({
    entries,
    view,
    typeFilter,
    statusFilter,
    operationSourceFilter,
    page,
    pageSize,
    totalCount,
    totalPages,
    currentCount:
      operationSourceFilter.length > 0
        ? operationTasks.filter(
            (task) =>
              isOperationTaskCurrent(task, now) &&
              operationSourceFilter.includes(task.sourceKey),
          ).length
        : aiTaskPage.metrics.currentCount +
          operationTasks.filter((task) => isOperationTaskCurrent(task, now)).length +
          automationEntries.length,
    historyCount:
      operationSourceFilter.length > 0
        ? operationTasks.filter(
            (task) =>
              isOperationTaskHistory(task, now) &&
              operationSourceFilter.includes(task.sourceKey),
          ).length
        : aiTaskPage.metrics.historyCount +
          operationTasks.filter((task) => isOperationTaskHistory(task, now)).length,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent")?.toString();

  if (intent !== "task") {
    return Response.json({ ok: false, error: "unsupported intent" }, { status: 400 });
  }

  const taskId = formData.get("taskId")?.toString().trim() ?? "";
  const taskAction = formData.get("taskAction")?.toString() as
    | OperationTaskAction
    | undefined;

  if (
    !taskId ||
    !taskAction ||
    !["start", "done", "ignore", "reopen"].includes(taskAction)
  ) {
    return Response.json({ ok: false, error: "invalid params" }, { status: 400 });
  }

  try {
    const updated = await updateOperationTaskStatus(session.shop, taskId, taskAction);
    if (!updated) {
      return Response.json({ ok: false, error: "task not found" }, { status: 404 });
    }
    return Response.json({ ok: true, task: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[api.unified-tasks] action failed:", error);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
};
