import { getTranslateRedisClient } from "../translateRedis.server";
import { getV4Job, listV4Jobs } from "./cosmosV4Store.server";
import {
  ACTIVE_V4_STATUSES,
  TERMINAL_V4_STATUSES,
  type TranslationV4Job,
  type TranslationV4Metrics,
  type TranslationV4Status,
} from "./types";
import { formatTranslationV4TranslateDetail } from "../../../lib/translationV4Display";
import { sameTranslationLocale } from "./localeUtils";

export { formatTranslationV4TranslateDetail } from "../../../lib/translationV4Display";

function progressKey(taskId: string) {
  return `translate:v4:progress:${taskId}`;
}

export type TranslationV4MergedMetrics = TranslationV4Metrics & {
  currentModule: string | null;
  translateStartedAt: string | null;
  progressUpdatedAt: string | null;
};

export function mergeV4JobMetrics(
  job: TranslationV4Job,
  redisProgress: Record<string, string>,
): TranslationV4MergedMetrics {
  return {
    initTotal: Number(redisProgress.initTotal) || job.metrics.initTotal,
    initDone: Number(redisProgress.initDone) || job.metrics.initDone,
    translateTotal: Number(redisProgress.translateTotal) || job.metrics.translateTotal,
    translateDone: Number(redisProgress.translateDone) || job.metrics.translateDone,
    translateFailed: Number(redisProgress.translateFailed) || job.metrics.translateFailed,
    translateFallback: job.metrics.translateFallback,
    translateUnitTotal:
      Number(redisProgress.translateUnitTotal) || job.metrics.translateUnitTotal || 0,
    translateUnitDone:
      Number(redisProgress.translateUnitDone) || job.metrics.translateUnitDone || 0,
    writebackTotal: Number(redisProgress.writebackTotal) || job.metrics.writebackTotal,
    writebackDone: Number(redisProgress.writebackDone) || job.metrics.writebackDone,
    writebackFailed: Number(redisProgress.writebackFailed) || job.metrics.writebackFailed,
    verifyTotal: Number(redisProgress.verifyTotal) || job.metrics.verifyTotal,
    verifyDone: Number(redisProgress.verifyDone) || job.metrics.verifyDone,
    verifyFailed: Number(redisProgress.verifyFailed) || job.metrics.verifyFailed,
    usedTokens: Number(redisProgress.usedTokens) || job.metrics.usedTokens || 0,
    currentModule: redisProgress.currentModule ?? null,
    translateStartedAt: redisProgress.translateStartedAt ?? null,
    progressUpdatedAt: redisProgress.updatedAt ?? null,
  };
}

export function translationV4StatusLabel(status: TranslationV4Status): string {
  const labels: Record<TranslationV4Status, string> = {
    CREATED: "已创建",
    INIT_QUEUED: "等待初始化",
    INITIALIZING: "初始化中",
    INIT_DONE: "初始化完成",
    TRANSLATE_QUEUED: "等待翻译",
    TRANSLATING: "翻译中",
    TRANSLATE_DONE: "翻译完成",
    WRITEBACK_QUEUED: "等待写回",
    WRITING_BACK: "写回 Shopify 中",
    VERIFY_QUEUED: "等待校验",
    VERIFYING: "校验中",
    COMPLETED: "已完成",
    FAILED: "失败",
    PAUSED: "已暂停",
    CANCELLED: "已取消",
  };
  return labels[status] ?? status;
}

function ratioPercent(done: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.min(100, Math.round((done / total) * 100));
}

export function computeTranslationV4ProgressPercent(
  status: TranslationV4Status,
  metrics: TranslationV4Metrics,
): number | null {
  if (status === "COMPLETED") return 100;
  if (TERMINAL_V4_STATUSES.includes(status)) return null;

  if (
    status === "INIT_QUEUED" ||
    status === "INITIALIZING" ||
    status === "INIT_DONE" ||
    status === "CREATED"
  ) {
    return ratioPercent(metrics.initDone, metrics.initTotal);
  }

  if (
    status === "TRANSLATE_QUEUED" ||
    status === "TRANSLATING" ||
    status === "TRANSLATE_DONE"
  ) {
    if (metrics.translateUnitTotal > 0) {
      return ratioPercent(metrics.translateUnitDone, metrics.translateUnitTotal);
    }
    return ratioPercent(metrics.translateDone, metrics.translateTotal);
  }

  if (status === "WRITEBACK_QUEUED" || status === "WRITING_BACK") {
    return ratioPercent(metrics.writebackDone, metrics.writebackTotal);
  }

  if (status === "VERIFY_QUEUED" || status === "VERIFYING") {
    return ratioPercent(metrics.verifyDone, metrics.verifyTotal);
  }

  return null;
}

export function buildTranslationV4StageSummary(
  status: TranslationV4Status,
  metrics: TranslationV4MergedMetrics,
): string {
  const label = translationV4StatusLabel(status);
  if (status === "TRANSLATING" || status === "TRANSLATE_QUEUED" || status === "TRANSLATE_DONE") {
    const translateDetail = formatTranslationV4TranslateDetail(metrics);
    const modulePart = metrics.currentModule ? `当前模块 ${metrics.currentModule}` : null;
    return [label, translateDetail, modulePart].filter(Boolean).join(" · ");
  }

  if (status === "INITIALIZING" || status === "INIT_QUEUED" || status === "INIT_DONE") {
    if (metrics.initTotal > 0) {
      return `${label} · ${metrics.initDone}/${metrics.initTotal}`;
    }
    return label;
  }

  if (status === "WRITING_BACK" || status === "WRITEBACK_QUEUED") {
    if (metrics.writebackTotal > 0) {
      return `${label} · ${metrics.writebackDone}/${metrics.writebackTotal}`;
    }
    return label;
  }

  if (status === "VERIFYING" || status === "VERIFY_QUEUED") {
    if (metrics.verifyTotal > 0) {
      return `${label} · ${metrics.verifyDone}/${metrics.verifyTotal}`;
    }
    return label;
  }

  if (status === "FAILED" && metrics.translateFailed > 0) {
    return `${label} · 翻译失败 ${metrics.translateFailed} 项`;
  }

  return label;
}

export type TranslationJobProgressSummary = {
  taskId: string;
  status: TranslationV4Status;
  statusLabel: string;
  isActive: boolean;
  source: string;
  target: string;
  modules: string[];
  testMode: boolean;
  createdAt: string;
  updatedAt: string;
  errorMessage: string | null;
  errorStage: string | null;
  stageSummary: string;
  progressPercent: number | null;
  usedTokens: number;
  metrics: {
    initDone: number;
    initTotal: number;
    translateDone: number;
    translateTotal: number;
    translateUnitDone: number;
    translateUnitTotal: number;
    translateFailed: number;
    writebackDone: number;
    writebackTotal: number;
    writebackFailed: number;
    verifyDone: number;
    verifyTotal: number;
    verifyFailed: number;
    currentModule: string | null;
  };
};

function toProgressSummary(
  job: TranslationV4Job,
  metrics: TranslationV4MergedMetrics,
): TranslationJobProgressSummary {
  const status = job.status;
  return {
    taskId: job.id,
    status,
    statusLabel: translationV4StatusLabel(status),
    isActive: ACTIVE_V4_STATUSES.includes(status),
    source: job.source,
    target: job.target,
    modules: job.modules,
    testMode: job.testMode,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    errorMessage: job.errorMessage,
    errorStage: job.errorStage,
    stageSummary: buildTranslationV4StageSummary(status, metrics),
    progressPercent: computeTranslationV4ProgressPercent(status, metrics),
    usedTokens: metrics.usedTokens,
    metrics: {
      initDone: metrics.initDone,
      initTotal: metrics.initTotal,
      translateDone: metrics.translateDone,
      translateTotal: metrics.translateTotal,
      translateUnitDone: metrics.translateUnitDone,
      translateUnitTotal: metrics.translateUnitTotal,
      translateFailed: metrics.translateFailed,
      writebackDone: metrics.writebackDone,
      writebackTotal: metrics.writebackTotal,
      writebackFailed: metrics.writebackFailed,
      verifyDone: metrics.verifyDone,
      verifyTotal: metrics.verifyTotal,
      verifyFailed: metrics.verifyFailed,
      currentModule: metrics.currentModule,
    },
  };
}

async function readRedisProgress(taskId: string): Promise<Record<string, string>> {
  try {
    return await getTranslateRedisClient().hgetall(progressKey(taskId));
  } catch {
    return {};
  }
}

export async function getV4JobProgressSummary(
  shopName: string,
  taskId: string,
): Promise<TranslationJobProgressSummary | null> {
  const job = await getV4Job(shopName, taskId);
  if (!job) return null;
  const redisProgress = await readRedisProgress(taskId);
  return toProgressSummary(job, mergeV4JobMetrics(job, redisProgress));
}

export async function listV4JobProgressSummaries(
  shopName: string,
  options?: {
    limit?: number;
    targetLocale?: string;
    activeOnly?: boolean;
  },
): Promise<TranslationJobProgressSummary[]> {
  const limit = Math.min(Math.max(options?.limit ?? 10, 1), 20);
  const jobs = await listV4Jobs(shopName, limit);
  const targetLocale = options?.targetLocale?.trim();

  const filtered = jobs.filter((job) => {
    if (targetLocale && !sameTranslationLocale(job.target, targetLocale)) {
      return false;
    }
    if (options?.activeOnly && !ACTIVE_V4_STATUSES.includes(job.status)) {
      return false;
    }
    return true;
  });

  return filtered.map((job) =>
    toProgressSummary(job, mergeV4JobMetrics(job, {})),
  );
}
