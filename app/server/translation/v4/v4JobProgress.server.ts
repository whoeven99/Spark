import { getTranslateRedisClient } from "../translateRedis.server";
import { getV4Job, listV4Jobs } from "./cosmosV4Store.server";
import {
  ACTIVE_V4_STATUSES,
  type TranslationV4Job,
  type TranslationV4Status,
} from "./types";
import {
  buildTranslationV4StageSummary,
  computeTranslationV4ProgressPercent,
  mergeV4JobMetrics,
  translationV4StatusLabel,
  type TranslationV4MergedMetrics,
} from "../../../lib/translationV4/state";
import { sameTranslationLocale } from "./localeUtils";

// Re-export the canonical pure helpers so existing import paths keep working.
export {
  formatTranslationV4TranslateDetail,
  buildTranslationV4StageSummary,
  computeTranslationV4ProgressPercent,
  mergeV4JobMetrics,
  translationV4StatusLabel,
  type TranslationV4MergedMetrics,
} from "../../../lib/translationV4/state";

function progressKey(taskId: string) {
  return `translate:v4:progress:${taskId}`;
}

export type TranslationJobProgressSummary = {
  taskId: string;
  status: TranslationV4Status;
  statusLabel: string;
  isActive: boolean;
  source: string;
  target: string;
  modules: string[];
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
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    errorMessage: job.errorMessage,
    errorStage: job.errorStage,
    stageSummary: buildTranslationV4StageSummary(status, metrics),
    progressPercent: computeTranslationV4ProgressPercent(status, metrics, job.errorStage),
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
