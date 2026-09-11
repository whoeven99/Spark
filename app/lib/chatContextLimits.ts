/** DeepSeek Flash 官方上下文长度（输入）。 */
export const DEEPSEEK_CONTEXT_TOKENS = 1_000_000;

/** DeepSeek Flash 官方单次输出上限。 */
export const DEEPSEEK_MAX_OUTPUT_TOKENS = 384_000;

/**
 * 留给 system / 工具 schema / 本轮输出的余量。
 * 历史消息按此预算从旧到新裁，避免打满 1M 后被服务端拒。
 */
export const CHAT_INPUT_TOKEN_BUDGET = 900_000;

/** 思考 + 长回复不易截断；可用 AI_MAX_TOKENS 覆盖，且不超过官方输出上限。 */
export const DEFAULT_CHAT_MAX_OUTPUT_TOKENS = 32_768;

export function resolveChatMaxOutputTokens(
  raw = typeof process !== "undefined" ? process.env.AI_MAX_TOKENS : undefined,
): number {
  const parsed = Number(raw);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.min(Math.floor(parsed), DEEPSEEK_MAX_OUTPUT_TOKENS);
  }
  return DEFAULT_CHAT_MAX_OUTPUT_TOKENS;
}

export function formatContextTokenCount(n: number): string {
  if (n >= 1_000_000) {
    const millions = n / 1_000_000;
    return Number.isInteger(millions) ? `${millions}M` : `${millions.toFixed(1)}M`;
  }
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}
