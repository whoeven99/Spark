/**
 * Canonical, dependency-free source of truth for V4 translation
 * status / progress / stage derivation.
 *
 * This module is client-safe (no `.server` deps, no Redis/Cosmos) so it can be
 * imported by both server loaders/actions and client components. Previously this
 * logic was duplicated across `v4JobProgress.server.ts`, `translationV4Display.ts`,
 * and re-inlined in `TranslationV4TaskCard.tsx`, with subtle divergences (e.g.
 * `Number(x) || y` vs monotonic `Math.max`, and missing PAUSED handling). Keep
 * all status/progress/stage logic here and re-export from the old locations.
 *
 * NOTE: `admin/` is a separate deployable with its own copy
 * (`admin/server/lib/v4Progress.ts`). It can't import from this package without a
 * shared workspace package; until that exists, keep the two in sync — this file
 * is the authority and already matches admin's (correct) monotonic + PAUSED logic.
 */
import {
  ACTIVE_V4_STATUSES,
  TERMINAL_V4_STATUSES,
  type StageName,
  type TranslationV4Job,
  type TranslationV4Metrics,
  type TranslationV4Status,
} from "../../server/translation/v4/types";

// ─── Status sets / predicates ─────────────────────────────────────────────────

export function isActiveV4Status(status: TranslationV4Status): boolean {
  return ACTIVE_V4_STATUSES.includes(status);
}

export function isTerminalV4Status(status: TranslationV4Status): boolean {
  return TERMINAL_V4_STATUSES.includes(status);
}

/** Statuses a user can resume from (re-queue at the right stage). */
export function isResumableV4Status(status: TranslationV4Status): boolean {
  return status === "PAUSED" || status === "FAILED";
}

// ─── Stage derivation ─────────────────────────────────────────────────────────

const STAGE_BY_STATUS: Partial<Record<TranslationV4Status, StageName>> = {
  INIT_QUEUED: "INIT",
  INITIALIZING: "INIT",
  INIT_DONE: "INIT",
  TRANSLATE_QUEUED: "TRANSLATE",
  TRANSLATING: "TRANSLATE",
  TRANSLATE_DONE: "TRANSLATE",
  WRITEBACK_QUEUED: "WRITEBACK",
  WRITING_BACK: "WRITEBACK",
  VERIFY_QUEUED: "VERIFY",
  VERIFYING: "VERIFY",
};

/**
 * Map a status to its pipeline stage. Used when pausing (to record errorStage)
 * and for progress derivation. Non-stage statuses (CREATED / terminal / paused)
 * fall back to INIT, matching the prior `stageFromStatus` default.
 */
export function deriveStage(status: TranslationV4Status): StageName {
  return STAGE_BY_STATUS[status] ?? "INIT";
}

// ─── Status label ─────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<TranslationV4Status, string> = {
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

export function translationV4StatusLabel(status: TranslationV4Status): string {
  return STATUS_LABELS[status] ?? status;
}

// ─── Metrics merge (Cosmos + live Redis) ──────────────────────────────────────

export type TranslationV4MergedMetrics = TranslationV4Metrics & {
  currentModule: string | null;
  translateStartedAt: string | null;
  progressUpdatedAt: string | null;
};

type MetricCounterKey = keyof TranslationV4Metrics;

/**
 * Merge Cosmos-persisted metrics with the worker's live Redis progress.
 *
 * Counters take `Math.max(redis, cosmos)` so progress is MONOTONIC — a stale or
 * zeroed Redis field can never make a counter go backwards (the previous
 * `Number(redis) || cosmos` form regressed whenever Redis legitimately held 0).
 */
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
    translateStartedAt: redisProgress.translateStartedAt?.trim() || null,
    progressUpdatedAt: redisProgress.updatedAt?.trim() || null,
  };
}

// ─── Progress percent ─────────────────────────────────────────────────────────

function ratioPercent(done: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.min(100, Math.round((done / total) * 100));
}

/** Resource-count denominator: prefer translateTotal, fall back to initTotal. */
function taskResourceTotal(metrics: TranslationV4Metrics): number {
  return metrics.translateTotal || metrics.initTotal || 0;
}

/**
 * Progress percent for the current stage. For PAUSED, `errorStage` selects which
 * stage's progress to show (so a quota-paused translate keeps its translate %
 * instead of going blank).
 */
export function computeTranslationV4ProgressPercent(
  status: TranslationV4Status,
  metrics: TranslationV4Metrics,
  errorStage?: string | null,
): number | null {
  if (status === "COMPLETED") return 100;
  if (TERMINAL_V4_STATUSES.includes(status)) return null;

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

// ─── Display helpers (formatting) ─────────────────────────────────────────────

/** 翻译进度里「字段/HTML 片段」级计数的展示名 */
export const TRANSLATION_V4_UNIT_LABEL = "子节点";

type TranslateProgressMetrics = Pick<
  TranslationV4Metrics,
  "translateDone" | "translateTotal" | "translateUnitDone" | "translateUnitTotal"
>;

/** 翻译阶段进度条/百分比：有子节点总数时按节点，否则回退到资源数。 */
export function resolveTranslateProgressCounts(metrics: TranslateProgressMetrics): {
  done: number;
  total: number;
  useUnits: boolean;
} {
  if (metrics.translateUnitTotal > 0) {
    return {
      done: metrics.translateUnitDone,
      total: metrics.translateUnitTotal,
      useUnits: true,
    };
  }
  return {
    done: metrics.translateDone,
    total: metrics.translateTotal,
    useUnits: false,
  };
}

export function translateProgressPercent(metrics: TranslateProgressMetrics): number | null {
  const { done, total } = resolveTranslateProgressCounts(metrics);
  if (total <= 0) return null;
  return Math.min(100, Math.round((done / total) * 100));
}

export function formatV4TaskDate(iso: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(iso));
}

export function formatV4TaskElapsed(createdAt: string, endAt: string | null): string {
  const end = endAt ? new Date(endAt) : new Date();
  const ms = end.getTime() - new Date(createdAt).getTime();
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

export function formatV4JobTimeLine(
  job: Pick<TranslationV4Job, "createdAt" | "updatedAt">,
  status: TranslationV4Status,
): string {
  const created = formatV4TaskDate(job.createdAt);
  const isTerminal = TERMINAL_V4_STATUSES.includes(status);
  const freezeEnd =
    isTerminal || status === "PAUSED" || status === "CANCELLED" ? job.updatedAt : null;
  const elapsed = formatV4TaskElapsed(job.createdAt, freezeEnd);

  if (status === "COMPLETED") {
    return `创建于 ${created} · 完成于 ${formatV4TaskDate(job.updatedAt)} · 耗时 ${elapsed}`;
  }
  // COMPLETED already returned above; remaining terminal statuses are FAILED / CANCELLED.
  if (isTerminal) {
    return `创建于 ${created} · 耗时 ${elapsed}`;
  }
  // PAUSED and all in-progress statuses.
  return `创建于 ${created} · 已运行 ${elapsed}`;
}

/** 翻译阶段副文案：子节点在前，资源数在后（不展示「资源」二字）。 */
export function formatTranslationV4TranslateDetail(
  metrics: Pick<
    TranslationV4Metrics,
    "translateDone" | "translateTotal" | "translateUnitDone" | "translateUnitTotal"
  >,
): string | null {
  if (metrics.translateUnitTotal <= 0) return null;
  const unit = `${TRANSLATION_V4_UNIT_LABEL} ${metrics.translateUnitDone}/${metrics.translateUnitTotal}`;
  if (metrics.translateTotal > 0) {
    return `${unit} · ${metrics.translateDone}/${metrics.translateTotal}`;
  }
  return unit;
}

/** 带千分位格式化的翻译阶段副文案（任务卡片右侧计数）。 */
export function formatTranslationV4TranslateDetailLocalized(
  metrics: Pick<
    TranslationV4Metrics,
    "translateDone" | "translateTotal" | "translateUnitDone" | "translateUnitTotal"
  >,
): string | null {
  if (metrics.translateUnitTotal <= 0) return null;
  const unit = `${TRANSLATION_V4_UNIT_LABEL} ${metrics.translateUnitDone.toLocaleString()}/${metrics.translateUnitTotal.toLocaleString()}`;
  if (metrics.translateTotal > 0) {
    return `${unit} · ${metrics.translateDone.toLocaleString()}/${metrics.translateTotal.toLocaleString()}`;
  }
  return unit;
}

// ─── Stage summary ────────────────────────────────────────────────────────────

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
