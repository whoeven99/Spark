import {
  TERMINAL_V4_STATUSES,
  type TranslationV4Job,
  type TranslationV4Metrics,
  type TranslationV4Status,
} from "../server/translation/v4/types";

/** 翻译进度里「字段/HTML 片段」级计数的展示名 */
export const TRANSLATION_V4_UNIT_LABEL = "子节点";

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
  if (status === "CANCELLED" || (isTerminal && status !== "COMPLETED")) {
    return `创建于 ${created} · 耗时 ${elapsed}`;
  }
  if (status === "PAUSED") {
    return `创建于 ${created} · 已运行 ${elapsed}`;
  }
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
