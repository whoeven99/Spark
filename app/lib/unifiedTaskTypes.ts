import type { AITaskItem } from "./aiTaskTypes";

export type UnifiedTaskEntry = { entryType: "ai_task"; task: AITaskItem };

export type UnifiedTaskView = "current" | "history";
export type UnifiedTaskTypeFilter =
  | "all"
  | "product_improve"
  | "image_generation"
  | "picture_translate";
export type UnifiedTaskStatusFilter =
  | "all"
  | "running"
  | "needs_review"
  | "failed"
  | "completed";

export interface UnifiedTaskListResponse {
  entries: UnifiedTaskEntry[];
  view: UnifiedTaskView;
  typeFilter: UnifiedTaskTypeFilter;
  statusFilter: UnifiedTaskStatusFilter;
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  currentCount: number;
  historyCount: number;
}
