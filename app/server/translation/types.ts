export const ALLOWED_TRANSLATABLE_RESOURCE_TYPES = [
  "PRODUCT",
  "COLLECTION",
  "PAGE",
  "ARTICLE",
  "METAOBJECT",
  "METAFIELD",
  "ONLINE_STORE_THEME",
] as const;

export type TranslatableResourceType =
  (typeof ALLOWED_TRANSLATABLE_RESOURCE_TYPES)[number];

export type TranslationJobStatus =
  | "PENDING"
  | "FETCHING"
  | "FETCHED"
  | "TRANSLATING"
  | "PAUSED"
  | "TRANSLATED"
  | "WRITING_BACK"
  | "COMPLETED"
  | "FAILED";

export type TranslationTaskCheckpoint = Record<string, unknown>;

export type TranslationTaskMetrics = Record<string, unknown>;

export type TranslationJobRecord = {
  id: string;
  shop: string;
  status: TranslationJobStatus;
  sourceLocale: string;
  targetLocale: string;
  taskType: string;
  aiModel: string;
  isCover: boolean;
  isHandle: boolean;
  moduleList: string[];
  sessionId: string;
  checkpoint: TranslationTaskCheckpoint;
  metrics: TranslationTaskMetrics;
  resourceTypes: string[];
  limitPerType: number;
  totalItems: number;
  fetchedItems: number;
  errorMessage: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};
