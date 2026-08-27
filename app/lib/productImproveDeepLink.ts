import { BATCH_PRODUCT_IMPROVE_SKILL_ID } from "./taskProposalPayload";

export const PRODUCT_IMPROVE_PAGE_PATH = "/app/studio/copy";

export type ProductImprovePageTab = "config" | "tasks";

export type OpenWorkspaceTasksOptions = {
  skillId?: string;
  taskType?: string;
  taskId?: string;
  intent?: "list" | "review";
};

export function isProductImproveTaskOpen(
  opts?: OpenWorkspaceTasksOptions,
): boolean {
  if (!opts) return false;
  return (
    opts.taskType === "product_improve" ||
    opts.skillId === BATCH_PRODUCT_IMPROVE_SKILL_ID
  );
}

export function readProductImproveTaskIdFromSearch(search: string): string | null {
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  const id = params.get("taskId")?.trim();
  return id || null;
}

export function readProductImproveTabFromSearch(search: string): ProductImprovePageTab {
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  if (params.get("tab") === "tasks" || readProductImproveTaskIdFromSearch(search)) {
    return "tasks";
  }
  return "config";
}

export function buildProductImprovePath(options: {
  tab?: ProductImprovePageTab;
  taskId?: string | null;
}): string {
  const params = new URLSearchParams();
  const tab = options.taskId ? "tasks" : options.tab;
  if (tab === "tasks") params.set("tab", "tasks");
  if (options.taskId) params.set("taskId", options.taskId);
  const qs = params.toString();
  return qs ? `${PRODUCT_IMPROVE_PAGE_PATH}?${qs}` : PRODUCT_IMPROVE_PAGE_PATH;
}

/** 对话/任务中心入口：审核直达详情，列表只打开任务 tab。 */
export function resolveProductImproveOpenPath(
  opts: OpenWorkspaceTasksOptions,
): string {
  const openReview = opts.intent !== "list" && Boolean(opts.taskId);
  return buildProductImprovePath({
    tab: "tasks",
    taskId: openReview ? opts.taskId : null,
  });
}
