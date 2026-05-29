const MAX_HUMAN_CHARS = 500;
const MAX_ERROR_CHARS = 500;

export function truncateText(value: string, maxLen: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen)}…`;
}

export function sanitizeHumanInput(text: string | undefined): string | undefined {
  if (!text?.trim()) return undefined;
  return truncateText(text, MAX_HUMAN_CHARS);
}

export function sanitizeErrorMessage(message: string): string {
  return truncateText(message, MAX_ERROR_CHARS);
}

/** 仅保留 host，避免在日志中存完整商品图 URL 查询串 */
export function imageUrlToHost(imageUrl: string | undefined): string | undefined {
  if (!imageUrl?.trim()) return undefined;
  try {
    return new URL(imageUrl).host;
  } catch {
    return undefined;
  }
}

export function resolveAgentRunStatus(params: {
  explicitStatus?: "success" | "error";
  durationMs: number;
  timedOut?: boolean;
}): "success" | "error" | "timeout" {
  if (params.timedOut) return "timeout";
  const timeoutMs = Number(process.env.AGENT_RUN_TIMEOUT_MS ?? "120000");
  if (Number.isFinite(timeoutMs) && params.durationMs > timeoutMs) {
    return "timeout";
  }
  return params.explicitStatus === "error" ? "error" : "success";
}
