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
  translateUnitTotal: number;
  translateUnitDone: number;
  writebackTotal: number;
  writebackDone: number;
  writebackFailed: number;
  verifyTotal: number;
  verifyDone: number;
  verifyFailed: number;
  usedTokens: number;
};

export type TranslationV4Job = {
  id: string;
  shopName: string;
  source: string;
  target: string;
  modules: string[];
  aiModel: string;
  status: TranslationV4Status;
  claimedBy: string | null;
  blobPrefix?: string;
  lastHeartbeat?: string | null;
  metrics: TranslationV4Metrics;
  errorMessage: string | null;
  errorStage: string | null;
  createdAt: string;
  updatedAt: string;
};
