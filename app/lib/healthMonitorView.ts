/**
 * Health Monitor 的 URL 视图：总览只读快照指标，详情才需要诊断对象名单。
 */

export type HealthMonitorViewMode = "overview" | "detail";

export function resolveHealthMonitorView(value: string | null | undefined): HealthMonitorViewMode {
  return value === "detail" ? "detail" : "overview";
}

/** 只有详情页需要 `ensureDailySnapshot` 现算的 30 天对象名单。 */
export function healthMonitorNeedsDiagnosisDetail(view: HealthMonitorViewMode): boolean {
  return view === "detail";
}

/**
 * 同页只切 monitor / returnTo / 从详情回总览时，沿用已有 loader 数据。
 * 总览 → 详情必须重跑，才能补上 relatedObjects。
 */
export function shouldRevalidateHealthMonitor(args: {
  currentUrl: URL;
  nextUrl: URL;
  defaultShouldRevalidate: boolean;
}): boolean {
  const { currentUrl, nextUrl, defaultShouldRevalidate } = args;
  if (currentUrl.pathname !== nextUrl.pathname) {
    return defaultShouldRevalidate;
  }

  const currentView = resolveHealthMonitorView(currentUrl.searchParams.get("view"));
  const nextView = resolveHealthMonitorView(nextUrl.searchParams.get("view"));
  if (currentView === "overview" && nextView === "detail") {
    return true;
  }

  return false;
}
