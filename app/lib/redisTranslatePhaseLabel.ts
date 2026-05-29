/** Redis translate_monitor_v3 phase → 界面文案 */

function readMetricNumber(raw: unknown): number | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const n = Number(raw.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function formatRedisTranslatePhaseLabel(phase: string): string {
  const trimmed = phase.trim();
  const p = trimmed.toUpperCase();
  if (!p || p === "—") return trimmed || "—";
  const map: Record<string, string> = {
    INIT_CREATED: "已创建任务",
    INIT_READING_SHOPIFY: "读取 Shopify 数据中",
    INIT_FAILED_NO_USER: "初始化失败（无店铺授权）",
    INIT_STOPPED_PRIMARY_LOCALE_MISMATCH: "已停止（店铺主语言不一致）",
    INIT_DONE_EMPTY_MODULES: "初始化完成（无可用模块）",
    INIT_DONE: "初始化完成",
  };
  return map[p] ?? trimmed;
}

/** 与进度条「分块文件」总数同源：Redis meta / Cosmos metrics / checkpoint */
export function readRuntimeChunksFileTotal(payload: {
  redisRuntime?: { meta?: Record<string, unknown> };
  cosmos?: Record<string, unknown>;
} | null): number | null {
  if (!payload) return null;
  const meta = payload.redisRuntime?.meta as Record<string, unknown> | undefined;
  const cosmos = payload.cosmos as Record<string, unknown> | undefined;
  const cm = cosmos?.metrics as Record<string, unknown> | undefined;
  const ck = cosmos?.checkpoint as Record<string, unknown> | undefined;
  return (
    readMetricNumber(meta?.runtimeChunksTotal) ??
    readMetricNumber(cm?.runtimeChunksTotal) ??
    readMetricNumber(ck?.runtimeChunksTotal)
  );
}
