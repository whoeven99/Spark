import type { AITaskItem } from "./aiTaskTypes";
import type { TranslationV4Job } from "../server/translation/v4/types";

export type UnifiedTaskEntry =
  | { entryType: "ai_task"; task: AITaskItem }
  | { entryType: "translation_v4"; job: TranslationV4Job };

export type UnifiedTaskView = "current" | "history";

export interface UnifiedTaskListResponse {
  entries: UnifiedTaskEntry[];
  view: UnifiedTaskView;
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  currentCount: number;
  historyCount: number;
}
