/** 与 AgentTask TranslateTaskMonitorV3RedisService / Cosmos checkpoint 对齐 */

export type TaskFailureInfo = {
  phase: string;
  phaseLabel: string;
  reason: string;
  hint: string;
  detail: string;
  at: string;
};

function safeText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function readCheckpointField(
  checkpoint: Record<string, unknown> | undefined,
  key: string,
): string {
  if (!checkpoint) return "";
  return safeText(checkpoint[key]);
}

function isFailurePhase(phase: string): boolean {
  const p = phase.toUpperCase();
  if (!p) return false;
  return p.includes("FAILED") || p.includes("STOPPED") || p === "TOKEN_LIMIT_REACHED";
}

/** 从 translateMonitor / Cosmos checkpoint / runtimeResult 聚合最近一次失败信息 */
export function readTaskFailureInfo(payload: {
  translateMonitor?: Record<string, string> | null;
  cosmos?: Record<string, unknown> | null;
} | null | undefined): TaskFailureInfo | null {
  if (!payload) return null;

  const tm = payload.translateMonitor ?? {};
  const cosmos = payload.cosmos ?? {};
  const checkpoint =
    cosmos.checkpoint && typeof cosmos.checkpoint === "object" && !Array.isArray(cosmos.checkpoint)
      ? (cosmos.checkpoint as Record<string, unknown>)
      : undefined;
  const runtimeResult =
    checkpoint?.runtimeResult &&
    typeof checkpoint.runtimeResult === "object" &&
    !Array.isArray(checkpoint.runtimeResult)
      ? (checkpoint.runtimeResult as Record<string, unknown>)
      : undefined;

  const phase =
    safeText(tm.lastFailurePhase) ||
    safeText(tm.phase) ||
    readCheckpointField(checkpoint, "lastFailurePhase") ||
    (safeText(runtimeResult?.status).toUpperCase() === "FAILED" ? "TRANSLATE_FAILED_RUNTIME" : "");

  const reason =
    safeText(tm.lastFailureReason) ||
    readCheckpointField(checkpoint, "lastFailureReason") ||
    safeText(runtimeResult?.reason) ||
    safeText(runtimeResult?.message);

  const hint =
    safeText(tm.lastFailureHint) ||
    readCheckpointField(checkpoint, "lastFailureHint") ||
    safeText(runtimeResult?.hint);

  const detail =
    safeText(tm.lastFailureDetail) ||
    readCheckpointField(checkpoint, "lastFailureDetail");

  const at =
    safeText(tm.lastFailureAt) ||
    readCheckpointField(checkpoint, "lastFailureAt");

  if (!reason && !hint && !isFailurePhase(phase)) {
    return null;
  }

  return {
    phase: phase || "UNKNOWN",
    phaseLabel: formatFailurePhaseLabel(phase || "UNKNOWN"),
    reason: reason || "—",
    hint,
    detail,
    at,
  };
}

export function formatFailurePhaseLabel(phase: string): string {
  const p = phase.trim().toUpperCase();
  const map: Record<string, string> = {
    INIT_FAILED_NO_USER: "初始化失败（无店铺授权）",
    INIT_STOPPED_PRIMARY_LOCALE_MISMATCH: "已停止（店铺主语言不一致）",
    TRANSLATE_FAILED_NO_USER: "翻译失败（无店铺授权）",
    TRANSLATE_FAILED_RUNTIME: "Runtime 翻译失败",
    TRANSLATE_PARTIAL_FAILED_RUNTIME: "Runtime 翻译部分失败",
    TRANSLATE_STOPPED_PRIMARY_LOCALE_MISMATCH: "已停止（店铺主语言不一致）",
    TRANSLATE_STOPPED_TOKEN_LIMIT: "已停止（Token 配额不足）",
    SAVE_FAILED_NO_USER: "回写失败（无店铺授权）",
    SAVE_PARTIAL_FAILED: "回写部分失败",
    VERIFY_FAILED_NO_USER: "校验失败（无店铺授权）",
  };
  return map[p] ?? phase;
}

export function failureReasonDisplayCode(reason: string): string {
  const r = reason.trim();
  if (!r) return "—";
  const friendly: Record<string, string> = {
    MISSING_SHOPIFY_ACCESS_TOKEN: "缺少 Shopify 访问令牌",
    PRIMARY_LOCALE_MISMATCH: "店铺主语言与源语言不一致",
    CHECKPOINT_MISSING_BLOB_URIS: "缺少翻译 Blob 路径（chunk 未就绪）",
    JSON_RUNTIME_FAILED: "JSON Runtime 执行失败",
    TOKEN_LIMIT_REACHED: "Token 配额已用尽",
    INVALID_PROVIDER_CONFIG: "LLM 提供商配置无效",
    TASK_NOT_FOUND: "任务不存在",
    NOT_JSON_RUNTIME_TASK: "非 JSON Runtime 任务类型",
  };
  return friendly[r] ?? r;
}
