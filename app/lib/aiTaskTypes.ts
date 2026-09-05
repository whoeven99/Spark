import type { AITaskMessageParams } from "./aiTaskMessage";
import type {
  BulkPriceEditApplyOutcome,
  BulkPriceEditCompareAtMode,
  BulkPriceEditPriceMode,
  BulkPriceEditRounding,
  BulkPriceEditRow,
  BulkPriceEditSummary,
} from "./bulkPriceEdit";
import type {
  BulkTagEditApplyOutcome,
  BulkTagEditRow,
  BulkTagEditSummary,
} from "./bulkTagEdit";
import type {
  BulkStatusEditApplyOutcome,
  BulkStatusEditInventoryCondition,
  BulkStatusEditRow,
  BulkStatusEditSummary,
  BulkStatusEditTargetStatus,
} from "./bulkStatusEdit";
import type {
  BulkCollectionEditAction,
  BulkCollectionEditApplyOutcome,
  BulkCollectionEditRow,
  BulkCollectionEditSummary,
} from "./bulkCollectionEdit";
import type {
  BulkSeoEditApplyOutcome,
  BulkSeoEditOverflow,
  BulkSeoEditRow,
  BulkSeoEditSummary,
} from "./bulkSeoEdit";
import type {
  BulkPriceImportIssue,
  BulkPriceImportRow,
  BulkPriceImportSummary,
} from "./bulkPriceImport";
import type {
  BulkCostImportApplyOutcome,
  BulkCostImportIssue,
  BulkCostImportRow,
  BulkCostImportSummary,
} from "./bulkCostImport";

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
  | "ads_catalog_sync"
  | "bulk_price_edit"
  | "bulk_tag_edit"
  | "bulk_status_edit"
  | "bulk_collection_edit"
  | "bulk_seo_edit"
  | "bulk_price_import"
  | "bulk_cost_import";

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
  | {
      type: "result_update";
      taskId: string;
      result: Record<string, unknown>;
    }
  | { type: "error"; message: string };

export interface ImageGenTaskConfig {
  description?: string;
  prompt: string;
  imageProvider: "openai" | "volc";
  productId?: string;
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

// 用 type 而非 interface：任务 store 的 result 形参是 Record<string, unknown>，
// 只有类型别名会被 TS 推导出隐式索引签名。
export type ProductImproveTaskResult = {
  title: string;
  description: string;
  reviewScore?: number;
  reviewNote?: string;
  optimizationComment?: string;
};

export type AdsCatalogPlatform = "facebook" | "google" | "tiktok";

export interface AdsCatalogSyncTaskConfig {
  platform: AdsCatalogPlatform;
  productIds: string[] | null; // null = all
  totalProducts: number;
}

export interface AdsCatalogGmcReviewSummary {
  checked: number;
  approved: number;
  disapproved: number;
  pending: number;
  accountSuspended: boolean;
  checkedAt: string;
  products: Array<{
    offerId: string;
    title: string | null;
    status: string;
    issues: Array<{ code: string; servability: string; description: string }>;
  }>;
}

/** Meta（Facebook）Catalog 同步后拉取的商品审核状态摘要。 */
export interface AdsCatalogMetaReviewSummary {
  checked: number;
  approved: number;
  disapproved: number;
  pending: number;
  /** Catalog / 商务账户级被限制或封禁。 */
  accountRestricted: boolean;
  checkedAt: string;
  products: Array<{
    offerId: string;
    title: string | null;
    status: string;
    issues: Array<{ code: string; servability: string; description: string }>;
  }>;
}

export interface AdsCatalogSyncTaskResult {
  platform: AdsCatalogPlatform;
  totalProcessed: number;
  succeeded: number;
  failed: number;
  /** 校验阶段被跳过的硬错误商品数（仅 Google）。 */
  skippedByValidation?: number;
  errors: Array<{ productId: string; reason: string }>;
  /** 同步后即时拉取的 GMC 审核状态摘要（仅 Google）。 */
  gmcReview?: AdsCatalogGmcReviewSummary;
  /** 同步后即时拉取的 Meta Catalog 审核状态摘要（仅 Facebook）。 */
  metaReview?: AdsCatalogMetaReviewSummary;
  /**
   * TikTok：shopify_official = 官方同步目录（仅映射校验，不 API 上传）；
   * api_managed = Spark API 上传。
   */
  syncMode?: "shopify_official" | "api_managed";
  /** TikTok：api_managed 下的上传方式。 */
  uploadMethod?: "product_upload" | "product_file";
  /** TikTok：本次同步绑定的 Catalog ID。 */
  catalogId?: string;
  /** TikTok：product/upload 或 product/file 返回的异步 feed_log_id。 */
  feedLogId?: string;
  /** TikTok Feed 文件公网 URL（排障用）。 */
  feedFileUrl?: string;
  /** TikTok：逐商品同步/审核结果。 */
  productResults?: TiktokCatalogProductResult[];
  /** TikTok product_feed_log 处理状态。 */
  feedLogStatus?: string;
  /** TikTok feed log CSV 解析摘要。 */
  feedCsvSummary?: string;
}

export type TiktokCatalogProductResultStatus =
  | "success"
  | "failed"
  | "warning"
  | "pending"
  | "unknown";

export interface TiktokCatalogProductResult {
  productId: string;
  status: TiktokCatalogProductResultStatus;
  reason?: string;
}

/**
 * 变体批量调价（受控写回）：一个任务覆盖一批商品。
 * dry-run 阶段只读 Shopify 并算出 changeset，写回要用户在审核弹窗二次确认。
 */
export type BulkPriceEditTaskConfig = {
  priceMode: BulkPriceEditPriceMode;
  priceValue: number;
  rounding: BulkPriceEditRounding;
  compareAtMode: BulkPriceEditCompareAtMode;
  minPrice: number | null;
  productIds: string[];
  totalProducts: number;
};

export type BulkPriceEditTaskResult = {
  rows: BulkPriceEditRow[];
  summary: BulkPriceEditSummary;
  /** 变体数超出上限时被截断，行数少于店铺实际变体数 */
  truncated?: boolean;
  /** 写回后的结果；未写回时缺省 */
  apply?: BulkPriceEditApplyOutcome;
  /** 写回开始时间，用于拒绝重复提交 */
  applyStartedAt?: string;
};

export type BulkPriceEditApplyResponse =
  | { ok: true; succeeded: number; failed: number }
  | { ok: false; error: string };

export type BulkTagEditTaskConfig = {
  addTags: string[];
  removeTags: string[];
  removePrefixes: string[];
  productIds: string[];
  totalProducts: number;
};

export type BulkTagEditTaskResult = {
  rows: BulkTagEditRow[];
  summary: BulkTagEditSummary;
  /** 商品数超出上限时被截断，行数少于所选商品数 */
  truncated?: boolean;
  /** 写回后的结果；未写回时缺省 */
  apply?: BulkTagEditApplyOutcome;
  /** 写回开始时间，用于拒绝重复提交 */
  applyStartedAt?: string;
};

export type BulkTagEditApplyResponse =
  | { ok: true; succeeded: number; failed: number }
  | { ok: false; error: string };

export type BulkStatusEditTaskConfig = {
  targetStatus: BulkStatusEditTargetStatus;
  inventoryCondition: BulkStatusEditInventoryCondition;
  productIds: string[];
  totalProducts: number;
};

export type BulkStatusEditTaskResult = {
  rows: BulkStatusEditRow[];
  summary: BulkStatusEditSummary;
  /** 商品数超出上限时被截断，行数少于所选商品数 */
  truncated?: boolean;
  /** 写回后的结果；未写回时缺省 */
  apply?: BulkStatusEditApplyOutcome;
  /** 写回开始时间，用于拒绝重复提交 */
  applyStartedAt?: string;
};

export type BulkStatusEditApplyResponse =
  | { ok: true; succeeded: number; failed: number }
  | { ok: false; error: string };

export type BulkCollectionEditTaskConfig = {
  action: BulkCollectionEditAction;
  collectionId: string;
  productIds: string[];
  totalProducts: number;
};

export type BulkCollectionEditTaskResult = {
  rows: BulkCollectionEditRow[];
  summary: BulkCollectionEditSummary;
  /** 试算时从 Shopify 读到的权威合集信息，卡片与 CSV 都用它，不用卡片里的旧标题 */
  collectionId: string;
  collectionTitle: string;
  action: BulkCollectionEditAction;
  /** 商品数超出上限时被截断，行数少于所选商品数 */
  truncated?: boolean;
  /** 写回后的结果；未写回时缺省 */
  apply?: BulkCollectionEditApplyOutcome;
  /** 写回开始时间，用于拒绝重复提交 */
  applyStartedAt?: string;
};

export type BulkCollectionEditApplyResponse =
  | { ok: true; succeeded: number; failed: number; pendingJob: boolean }
  | { ok: false; error: string };

export type BulkSeoEditTaskConfig = {
  titleTemplate: string | null;
  descriptionTemplate: string | null;
  onlyFillEmpty: boolean;
  overflow: BulkSeoEditOverflow;
  productIds: string[];
  totalProducts: number;
};

export type BulkSeoEditTaskResult = {
  rows: BulkSeoEditRow[];
  summary: BulkSeoEditSummary;
  /** 商品数超出上限时被截断，行数少于所选商品数 */
  truncated?: boolean;
  /** 写回后的结果；未写回时缺省 */
  apply?: BulkSeoEditApplyOutcome;
  /** 写回开始时间，用于拒绝重复提交 */
  applyStartedAt?: string;
};

export type BulkSeoEditApplyResponse =
  | { ok: true; succeeded: number; failed: number }
  | { ok: false; error: string };

export type BulkPriceImportTaskConfig = {
  fileId: string;
  fileName: string;
  skuColumn: string;
  priceColumn: string;
  compareAtColumn: string | null;
};

export type BulkPriceImportTaskResult = {
  rows: BulkPriceImportRow[];
  /** 未写入的行：未匹配、SKU 冲突、价格解析失败等 */
  issues: BulkPriceImportIssue[];
  summary: BulkPriceImportSummary;
  fileName: string;
  /** 表格行数超出上限时被截断 */
  truncated?: boolean;
  apply?: BulkPriceEditApplyOutcome;
  applyStartedAt?: string;
};

export type BulkPriceImportApplyResponse =
  | { ok: true; succeeded: number; failed: number }
  | { ok: false; error: string };

export type BulkCostImportTaskConfig = {
  fileId: string;
  fileName: string;
  skuColumn: string;
  costColumn: string;
};

export type BulkCostImportTaskResult = {
  rows: BulkCostImportRow[];
  /** 未写入的行：未匹配、SKU 冲突、成本解析失败等 */
  issues: BulkCostImportIssue[];
  summary: BulkCostImportSummary;
  fileName: string;
  /** 表格行数超出上限时被截断 */
  truncated?: boolean;
  apply?: BulkCostImportApplyOutcome;
  applyStartedAt?: string;
};

export type BulkCostImportApplyResponse =
  | { ok: true; succeeded: number; failed: number }
  | { ok: false; error: string };

export type AITaskCreateResponse =
  | { success: true; taskId: string; batchId: string; status: "running" }
  | { success: false; errorCode: number; errorMsg: string };

export type AITaskDeleteResponse =
  | { success: true; taskId: string }
  | { success: false; errorCode: number; errorMsg: string };
