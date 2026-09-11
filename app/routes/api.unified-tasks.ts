import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import { authenticate } from "../shopify.server";
import {
  AI_TASK_VIEW_FETCH_LIMIT,
  listRecentAITasksForShop,
  listTasksPageForShop,
} from "../server/aiTask/aiTaskStore.server";
import type { AITaskItem, AITaskListPageData } from "../lib/aiTaskTypes";
import {
  listOperationTasks,
  updateOperationTaskStatus,
  type OperationTaskAction,
} from "../server/operations/dailyInspection.server";
import { isOperationTaskCurrent, isOperationTaskHistory } from "../lib/operationTaskList";
import { computeUnifiedTaskTabCounts } from "../lib/unifiedTaskCounts";
import { listScheduledAutomationTasks } from "../server/automation/scheduledAutomationCatalog.server";
import type {
  UnifiedTaskEntry,
  UnifiedTaskListResponse,
  UnifiedTaskStatusFilter,
  UnifiedTaskTypeFilter,
  UnifiedTaskView,
} from "../lib/unifiedTaskTypes";

const DEFAULT_PAGE_SIZE = 10;

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

/**
 * 排序口径。`default` 把定时任务钉在最前（任务中心的既有行为）；
 * `time_desc` 一律按更新时间倒序，不给任何类型置顶特权。
 */
type UnifiedTaskSort = "default" | "time_desc";

function parseSort(value: string | null): UnifiedTaskSort {
  return value === "time_desc" ? "time_desc" : "default";
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

function buildEmptyAITaskPage(view: UnifiedTaskView, page: number, pageSize: number): AITaskListPageData {
  return {
    tasks: [],
    view,
    page,
    pageSize,
    totalCount: 0,
    totalPages: 1,
    metrics: {
      currentCount: 0,
      historyCount: 0,
      runningCount: 0,
      totalCount: 0,
    },
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const now = new Date();

  const viewParam = url.searchParams.get("view");
  const view: UnifiedTaskView =
    viewParam === "history" ? "history" : viewParam === "all" ? "all" : "current";
  const includeAiOnly = url.searchParams.get("include") === "ai";
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
  const sort = parseSort(url.searchParams.get("sort"));

  const [aiTaskPage, operationTasks] = await Promise.all([
    (view === "all"
      ? listRecentAITasksForShop(session.shop, AI_TASK_VIEW_FETCH_LIMIT).then((tasks) => ({
          tasks,
          metrics: {
            currentCount: 0,
            historyCount: 0,
            runningCount: 0,
            totalCount: tasks.length,
          },
        }))
      : listTasksPageForShop({
          shop: session.shop,
          view: view === "history" ? "history" : "current",
          page: 1,
          pageSize: AI_TASK_VIEW_FETCH_LIMIT,
          maxPageSize: AI_TASK_VIEW_FETCH_LIMIT,
        })
    ).catch((error) => {
      console.error("[api.unified-tasks] failed to load AI tasks, falling back to empty list:", error);
      return buildEmptyAITaskPage(view === "all" ? "current" : view, 1, AI_TASK_VIEW_FETCH_LIMIT);
    }),
    includeAiOnly ? Promise.resolve([]) : listOperationTasks(session.shop),
  ]);
  const scheduledAutomationTasks = includeAiOnly ? [] : listScheduledAutomationTasks();
  const automationEntries: UnifiedTaskEntry[] =
    !includeAiOnly && view === "current"
      ? scheduledAutomationTasks.map((task) => ({
          entryType: "automation_task",
          task,
        }))
      : [];

  const aiEntries: UnifiedTaskEntry[] = aiTaskPage.tasks.map((task: AITaskItem) => ({
    entryType: "ai_task",
    task,
  }));
  const operationEntries: UnifiedTaskEntry[] = includeAiOnly
    ? []
    : operationTasks
        .filter((task) => {
          if (view === "all") return true;
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
      if (sort === "default") {
        if (a.entryType === "automation_task" && b.entryType === "automation_task") {
          return a.task.sortOrder - b.task.sortOrder;
        }
        if (a.entryType === "automation_task") return -1;
        if (b.entryType === "automation_task") return 1;
      }
      return new Date(entryUpdatedAt(b)).getTime() - new Date(entryUpdatedAt(a)).getTime();
    });

  const totalCount = merged.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const entries = merged.slice((page - 1) * pageSize, page * pageSize);
  const { currentCount, historyCount } = computeUnifiedTaskTabCounts({
    aiCurrentCount: aiTaskPage.metrics.currentCount,
    aiHistoryCount: aiTaskPage.metrics.historyCount,
    operationTasks,
    scheduledAutomationCount: scheduledAutomationTasks.length,
    operationSourceFilter,
    now,
  });

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
    currentCount,
    historyCount,
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
