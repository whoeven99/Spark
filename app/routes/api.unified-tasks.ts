import type { LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import { authenticate } from "../shopify.server";
import { listTasksPageForShop } from "../server/aiTask/aiTaskStore.server";
import type { AITaskItem } from "../lib/aiTaskTypes";
import type {
  UnifiedTaskEntry,
  UnifiedTaskListResponse,
  UnifiedTaskStatusFilter,
  UnifiedTaskTypeFilter,
  UnifiedTaskView,
} from "../lib/unifiedTaskTypes";

const DEFAULT_PAGE_SIZE = 10;
const FETCH_ALL_SIZE = 200;

function entryUpdatedAt(entry: Extract<UnifiedTaskEntry, { entryType: "ai_task" }>): string {
  return entry.task.updatedAt;
}

function parseTypeFilter(value: string | null): UnifiedTaskTypeFilter {
  if (
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
    value === "needs_review" ||
    value === "failed" ||
    value === "completed"
  ) {
    return value;
  }
  return "all";
}

function matchesTypeFilter(
  entry: Extract<UnifiedTaskEntry, { entryType: "ai_task" }>,
  typeFilter: UnifiedTaskTypeFilter,
): boolean {
  if (typeFilter === "all") return true;
  return entry.task.taskType === typeFilter;
}

function matchesStatusFilter(
  entry: Extract<UnifiedTaskEntry, { entryType: "ai_task" }>,
  statusFilter: UnifiedTaskStatusFilter,
): boolean {
  if (statusFilter === "all") return true;

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

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);

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

  const aiTaskPage = await listTasksPageForShop({
    shop: session.shop,
    view,
    page: 1,
    pageSize: FETCH_ALL_SIZE,
  });

  const aiEntries: UnifiedTaskEntry[] = aiTaskPage.tasks.map(
    (task: AITaskItem) => ({ entryType: "ai_task", task }),
  );

  const merged = aiEntries
    .filter((entry) => matchesTypeFilter(entry, typeFilter))
    .filter((entry) => matchesStatusFilter(entry, statusFilter))
    .sort(
    (a, b) =>
      new Date(entryUpdatedAt(b)).getTime() -
      new Date(entryUpdatedAt(a)).getTime(),
  );

  const totalCount = merged.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const entries = merged.slice((page - 1) * pageSize, page * pageSize);

  return data<UnifiedTaskListResponse>({
    entries,
    view,
    typeFilter,
    statusFilter,
    page,
    pageSize,
    totalCount,
    totalPages,
    currentCount: aiTaskPage.metrics.currentCount,
    historyCount: aiTaskPage.metrics.historyCount,
  });
};
