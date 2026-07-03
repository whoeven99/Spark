import type { LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import { authenticate } from "../shopify.server";
import { listTasksPageForShop } from "../server/aiTask/aiTaskStore.server";
import { listV4Jobs } from "../server/translation/v4/cosmosV4Store.server";
import {
  ACTIVE_V4_STATUSES,
  TERMINAL_V4_STATUSES,
  type TranslationV4Job,
} from "../server/translation/v4/types";
import type { AITaskItem } from "../lib/aiTaskTypes";
import type {
  UnifiedTaskEntry,
  UnifiedTaskListResponse,
  UnifiedTaskStatusFilter,
  UnifiedTaskTypeFilter,
  UnifiedTaskView,
} from "../lib/unifiedTaskTypes";

const DEFAULT_PAGE_SIZE = 10;
// Fetch a large batch so we can merge + paginate the combined set client-side.
// Most shops have well under 200 tasks per view.
const FETCH_ALL_SIZE = 200;

function isCurrentV4Job(job: TranslationV4Job): boolean {
  return !TERMINAL_V4_STATUSES.includes(job.status) && job.status !== "PAUSED";
}

function entryUpdatedAt(entry: UnifiedTaskEntry): string {
  return entry.entryType === "ai_task" ? entry.task.updatedAt : entry.job.updatedAt;
}

function parseTypeFilter(value: string | null): UnifiedTaskTypeFilter {
  if (
    value === "product_improve" ||
    value === "image_generation" ||
    value === "picture_translate" ||
    value === "translation_v4"
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
  entry: UnifiedTaskEntry,
  typeFilter: UnifiedTaskTypeFilter,
): boolean {
  if (typeFilter === "all") return true;
  if (typeFilter === "translation_v4") return entry.entryType === "translation_v4";
  return entry.entryType === "ai_task" && entry.task.taskType === typeFilter;
}

function matchesStatusFilter(
  entry: UnifiedTaskEntry,
  statusFilter: UnifiedTaskStatusFilter,
): boolean {
  if (statusFilter === "all") return true;
  if (entry.entryType === "translation_v4") {
    if (statusFilter === "running") return ACTIVE_V4_STATUSES.includes(entry.job.status);
    if (statusFilter === "failed") return entry.job.status === "FAILED";
    if (statusFilter === "completed") return entry.job.status === "COMPLETED";
    return false;
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

  const [aiTaskPage, v4Jobs] = await Promise.all([
    listTasksPageForShop({
      shop: session.shop,
      view,
      page: 1,
      pageSize: FETCH_ALL_SIZE,
    }),
    listV4Jobs(session.shop).catch(() => [] as TranslationV4Job[]),
  ]);

  const filterV4 =
    view === "current"
      ? isCurrentV4Job
      : (job: TranslationV4Job) => !isCurrentV4Job(job);

  const aiEntries: UnifiedTaskEntry[] = aiTaskPage.tasks.map(
    (task: AITaskItem) => ({ entryType: "ai_task", task }),
  );
  const v4Entries: UnifiedTaskEntry[] = v4Jobs
    .filter(filterV4)
    .map((job) => ({ entryType: "translation_v4", job }));

  const merged = [...aiEntries, ...v4Entries]
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

  const currentV4Count = v4Jobs.filter(isCurrentV4Job).length;
  const historyV4Count = v4Jobs.length - currentV4Count;

  return data<UnifiedTaskListResponse>({
    entries,
    view,
    typeFilter,
    statusFilter,
    page,
    pageSize,
    totalCount,
    totalPages,
    currentCount: aiTaskPage.metrics.currentCount + currentV4Count,
    historyCount: aiTaskPage.metrics.historyCount + historyV4Count,
  });
};
