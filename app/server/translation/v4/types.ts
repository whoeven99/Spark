export const TRANSLATION_V4_MODULES = [
  "PRODUCT",
  "PRODUCT_OPTION",
  "PRODUCT_OPTION_VALUE",
  "COLLECTION",
  "ONLINE_STORE_THEME_APP_EMBED",
  "ONLINE_STORE_THEME_JSON_TEMPLATE",
  "ONLINE_STORE_THEME_SECTION_GROUP",
  "ONLINE_STORE_THEME_SETTINGS_DATA_SECTIONS",
  "MENU",
  "LINK",
  "DELIVERY_METHOD_DEFINITION",
  "FILTER",
  "METAFIELD",
  "METAOBJECT",
  "PAYMENT_GATEWAY",
  "SELLING_PLAN",
  "SELLING_PLAN_GROUP",
  "SHOP",
  "ARTICLE",
  "BLOG",
  "PAGE",
] as const;

export type TranslationV4Module = (typeof TRANSLATION_V4_MODULES)[number];

export type TranslationV4Status =
  | "CREATED"
  | "INIT_QUEUED"
  | "INITIALIZING"
  | "INIT_DONE"
  | "TRANSLATE_QUEUED"
  | "TRANSLATING"
  | "TRANSLATE_DONE"
  | "WRITEBACK_QUEUED"
  | "WRITING_BACK"
  | "VERIFY_QUEUED"
  | "VERIFYING"
  | "COMPLETED"
  | "FAILED"
  | "PAUSED"
  | "CANCELLED";

export type TranslationV4Metrics = {
  initTotal: number;
  initDone: number;
  translateTotal: number;
  translateDone: number;
  translateFailed: number;
  translateFallback: number;
  writebackTotal: number;
  writebackDone: number;
  writebackFailed: number;
  verifyTotal: number;
  verifyDone: number;
  verifyFailed: number;
  usedTokens: number;
};

export const EMPTY_V4_METRICS: TranslationV4Metrics = {
  initTotal: 0,
  initDone: 0,
  translateTotal: 0,
  translateDone: 0,
  translateFailed: 0,
  translateFallback: 0,
  writebackTotal: 0,
  writebackDone: 0,
  writebackFailed: 0,
  verifyTotal: 0,
  verifyDone: 0,
  verifyFailed: 0,
  usedTokens: 0,
};

export type TranslationV4Job = {
  id: string;
  shopName: string;
  shopifyAccessToken: string;
  source: string;
  target: string;
  modules: TranslationV4Module[];
  aiModel: string;
  /** The engine actually used at translate time (real data, set by the worker). */
  aiModelUsed: string | null;
  aiProvider: string | null;
  /** Per-engine-model breakdown of translated content (units + source chars). */
  engineUsage: Record<string, { units: number; chars: number }> | null;
  limitPerType: number;
  isCover: boolean;
  isHandle: boolean;
  testMode: boolean;
  status: TranslationV4Status;
  claimedBy: string | null;
  claimedAt: string | null;
  lastHeartbeat: string | null;
  blobPrefix: string;
  metrics: TranslationV4Metrics;
  errorMessage: string | null;
  errorStage: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

/** Statuses that mean the job is actively running in a worker */
export const ACTIVE_V4_STATUSES: TranslationV4Status[] = [
  "INIT_QUEUED",
  "INITIALIZING",
  "INIT_DONE",
  "TRANSLATE_QUEUED",
  "TRANSLATING",
  "TRANSLATE_DONE",
  "WRITEBACK_QUEUED",
  "WRITING_BACK",
  "VERIFY_QUEUED",
  "VERIFYING",
];

export const TERMINAL_V4_STATUSES: TranslationV4Status[] = [
  "COMPLETED",
  "FAILED",
  "CANCELLED",
];
