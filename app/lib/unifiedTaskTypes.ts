import type { AITaskItem } from "./aiTaskTypes";
import type { TranslationV4Job } from "../server/translation/v4/types";

export type UnifiedTaskEntry =
  | { entryType: "ai_task"; task: AITaskItem }
  | { entryType: "translation_v4"; job: TranslationV4Job };

export type UnifiedTaskView = "current" | "history";
export type UnifiedTaskTypeFilter =
  | "all"
  | "product_improve"
  | "image_generation"
  | "picture_translate"
  | "translation_v4";
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
