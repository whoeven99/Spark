import type { AITaskMessageParams } from "./aiTaskMessage";

export type AITaskStatus =
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "pending_review"
  | "applied"
  | "scored";

export type AITaskType =
  | "image_generation"
  | "picture_translate"
  | "product_improve"
  | "ads_catalog_sync";

export type AITaskListView = "current" | "history";

export interface AITaskItem {
  id: string;
  batchId: string;
  shop: string;
  taskType: AITaskType;
  status: AITaskStatus;
  config: Record<string, unknown>;
  result: Record<string, unknown> | null;
  estimatedCredits: number | null;
  actualCredits: number | null;
  startedAt: string;
  completedAt: string | null;
  errorMsg: string | null;
  errorMsgKey?: string;
  errorMsgParams?: AITaskMessageParams;
  createdAt: string;
  updatedAt: string;
}

export interface AITaskListMetrics {
  currentCount: number;
  historyCount: number;
  runningCount: number;
  totalCount: number;
}

export interface AITaskListPageData {
  tasks: AITaskItem[];
  view: AITaskListView;
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  metrics: AITaskListMetrics;
}

export interface AITaskBatchItem {
  id: string;
  shop: string;
  taskType: AITaskType;
  config: Record<string, unknown>;
  createdAt: string;
  tasks: AITaskItem[];
}

export interface AITaskLogEntry {
  id: string;
  taskId: string;
  elapsedSeconds: number;
  message: string;
  messageKey?: string;
  messageParams?: AITaskMessageParams;
  createdAt: string;
}

export type AITaskSSEEvent =
  | { type: "connected"; taskId: string; existingLogs: AITaskLogEntry[] }
  | {
      type: "log";
      taskId: string;
      elapsedSeconds: number;
      message: string;
      messageKey?: string;
      messageParams?: AITaskMessageParams;
      createdAt: string;
    }
  | {
      type: "status_change";
      taskId: string;
      status: AITaskStatus;
      result?: Record<string, unknown>;
      errorMsg?: string;
      errorMsgKey?: string;
      errorMsgParams?: AITaskMessageParams;
    }
  | { type: "error"; message: string };

export interface ImageGenTaskConfig {
  description?: string;
  prompt: string;
  imageProvider: "openai" | "volc";
}

export interface PicTranslateTaskConfig {
  imageUrl?: string;
  sourceCode: string;
  targetCode: string;
  modelType: 1 | 2;
}

export interface ImageGenTaskResult {
  blobPath: string;
  provider: "openai" | "volc";
  imageUrl?: string;
}

export interface PicTranslateTaskResult {
  translatedBlobPath: string;
  originalBlobPath?: string;
  provider: string;
  imageUrl?: string;
}

export interface ProductImproveTaskConfig {
  productId: string;
  targetLanguage: string;
  originalTitle: string;
  originalText: string;
}

export interface ProductImproveTaskResult {
  title: string;
  description: string;
  reviewScore?: number;
  reviewNote?: string;
  optimizationComment?: string;
}

export type AdsCatalogPlatform = "facebook" | "google";

export interface AdsCatalogSyncTaskConfig {
  platform: AdsCatalogPlatform;
  productIds: string[] | null; // null = all
  totalProducts: number;
}

export interface AdsCatalogSyncTaskResult {
  platform: AdsCatalogPlatform;
  totalProcessed: number;
  succeeded: number;
  failed: number;
  errors: Array<{ productId: string; reason: string }>;
}

export type AITaskCreateResponse =
  | { success: true; taskId: string; batchId: string; status: "running" }
  | { success: false; errorCode: number; errorMsg: string };

export type AITaskDeleteResponse =
  | { success: true; taskId: string }
  | { success: false; errorCode: number; errorMsg: string };
