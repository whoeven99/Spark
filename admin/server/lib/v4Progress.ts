import { getRedis } from "./redis.js";
import type {
  TranslationV4Job,
  TranslationV4Metrics,
  TranslationV4Status,
} from "../types/translation.js";

export function v4ProgressKey(taskId: string): string {
  return `translate:v4:progress:${taskId}`;
}

const TERMINAL_STATUSES = new Set<TranslationV4Status>([
  "FAILED",
  "CANCELLED",
]);

/** Worker 运行中会写 Redis 的阶段（Cosmos metrics 更新较慢）。 */
const LIVE_PROGRESS_STATUSES = new Set<TranslationV4Status>([
  "CREATED",
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
  "PAUSED",
]);

export type TranslationV4MergedMetrics = TranslationV4Metrics & {
  currentModule: string | null;
  progressUpdatedAt: string | null;
};

export type TranslationJobEnriched = TranslationV4Job & {
  metrics: TranslationV4MergedMetrics;
  progressPercent: number;
};

type MetricCounterKey = keyof TranslationV4Metrics;

/** 合并 Cosmos 持久化 metrics 与 worker 实时写入 Redis 的进度（取 max，避免回退）。 */
export function mergeV4JobMetrics(
  job: TranslationV4Job,
  redisProgress: Record<string, string>,
): TranslationV4MergedMetrics {
  const merge = (key: MetricCounterKey): number =>
    Math.max(Number(redisProgress[key]) || 0, Number(job.metrics[key]) || 0);

  return {
    initTotal: merge("initTotal"),
    initDone: merge("initDone"),
    translateTotal: merge("translateTotal"),
    translateDone: merge("translateDone"),
    translateFailed: merge("translateFailed"),
    translateFallback: merge("translateFallback"),
    translateUnitTotal: merge("translateUnitTotal"),
    translateUnitDone: merge("translateUnitDone"),
    writebackTotal: merge("writebackTotal"),
    writebackDone: merge("writebackDone"),
    writebackFailed: merge("writebackFailed"),
    verifyTotal: merge("verifyTotal"),
    verifyDone: merge("verifyDone"),
    verifyFailed: merge("verifyFailed"),
    usedTokens: merge("usedTokens"),
    currentModule: redisProgress.currentModule?.trim() || null,
    progressUpdatedAt: redisProgress.updatedAt?.trim() || null,
  };
}

function ratioPercent(done: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.min(100, Math.round((done / total) * 100));
}

function taskResourceTotal(metrics: TranslationV4Metrics): number {
  return metrics.translateTotal || metrics.initTotal || 0;
}

/** 按当前 pipeline 阶段计算进度百分比（与 TsFrontend progress.server 对齐）。 */
export function computeTranslationV4ProgressPercent(
  status: TranslationV4Status,
  metrics: TranslationV4Metrics,
  errorStage?: string | null,
): number | null {
  if (status === "COMPLETED") return 100;
  if (TERMINAL_STATUSES.has(status)) return null;

  if (status === "PAUSED") {
    switch (errorStage) {
      case "WRITEBACK": {
        const total = taskResourceTotal(metrics);
        return total > 0 ? ratioPercent(metrics.writebackDone, total) : null;
      }
      case "VERIFY":
        return ratioPercent(metrics.verifyDone, metrics.verifyTotal);
      case "TRANSLATE":
      default:
        if (metrics.translateUnitTotal > 0) {
          return ratioPercent(metrics.translateUnitDone, metrics.translateUnitTotal);
        }
        return ratioPercent(metrics.translateDone, taskResourceTotal(metrics));
    }
  }

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
    return ratioPercent(metrics.translateDone, taskResourceTotal(metrics));
  }

  if (status === "WRITEBACK_QUEUED" || status === "WRITING_BACK") {
    const total = taskResourceTotal(metrics);
    return total > 0 ? ratioPercent(metrics.writebackDone, total) : null;
  }

  if (status === "VERIFY_QUEUED" || status === "VERIFYING") {
    return ratioPercent(metrics.verifyDone, metrics.verifyTotal);
  }

  return null;
}

export function resolveProgressPercent(
  status: TranslationV4Status,
  metrics: TranslationV4Metrics,
  errorStage?: string | null,
): number {
  const pct = computeTranslationV4ProgressPercent(status, metrics, errorStage);
  return pct ?? 0;
}

export async function batchReadRedisProgress(
  jobIds: string[],
): Promise<Map<string, Record<string, string>>> {
  const out = new Map<string, Record<string, string>>();
  if (jobIds.length === 0) return out;

  const redis = getRedis();
  if (!redis) return out;

  try {
    const pipe = redis.pipeline();
    for (const id of jobIds) pipe.hgetall(v4ProgressKey(id));
    const results = await pipe.exec();
    jobIds.forEach((id, i) => {
      const raw = results?.[i]?.[1];
      out.set(
        id,
        raw && typeof raw === "object" ? (raw as Record<string, string>) : {},
      );
    });
  } catch (err) {
    console.warn("[v4Progress] batch redis read failed:", err);
  }
  return out;
}

export async function enrichJobsWithLiveProgress(
  jobs: TranslationV4Job[],
): Promise<TranslationJobEnriched[]> {
  const liveIds = jobs.filter((j) => LIVE_PROGRESS_STATUSES.has(j.status)).map((j) => j.id);
  const redisById = await batchReadRedisProgress(liveIds);

  return jobs.map((job) => {
    const redis = redisById.get(job.id) ?? {};
    const metrics = mergeV4JobMetrics(job, redis);
    const progressPercent = resolveProgressPercent(
      job.status,
      metrics,
      job.errorStage,
    );
    return { ...job, metrics, progressPercent };
  });
}

export async function enrichJobWithLiveProgress(
  job: TranslationV4Job,
): Promise<TranslationJobEnriched> {
  const [enriched] = await enrichJobsWithLiveProgress([job]);
  return enriched;
}
