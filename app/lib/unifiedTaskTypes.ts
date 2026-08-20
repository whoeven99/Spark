import type { AITaskItem } from "./aiTaskTypes";
import type { OperationTaskView } from "../server/operations/dailyInspection.server";

export type UnifiedTaskEntry =
  | { entryType: "ai_task"; task: AITaskItem }
  | { entryType: "operation_task"; task: OperationTaskView };

export type UnifiedTaskView = "current" | "history";
export type UnifiedTaskTypeFilter =
  | "all"
  | "operation_task"
  | "product_improve"
  | "image_generation"
  | "picture_translate";
export type UnifiedTaskStatusFilter =
  | "all"
  | "running"
  | "open"
  | "in_progress"
  | "needs_review"
  | "failed"
  | "completed"
  | "ignored";

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
