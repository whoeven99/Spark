import type { ParsedTokenUsage } from "./parseUsageMetadata.server";

const CJK_RE = /[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/gu;

/**
 * 粗略 token 估算：CJK/日韩字符约 1.6 token/字，其余按 4 字符 ≈ 1 token。
 * 仅用于「provider 未返回 usage_metadata」的兜底，不追求精确，只求不至于把真实消耗记为 0。
 */
export function estimateTokensFromText(text: string): number {
  if (!text) return 0;
  const cjk = (text.match(CJK_RE) ?? []).length;
  const other = Math.max(0, text.length - cjk);
  return Math.ceil(cjk * 1.6 + other / 4);
}

/** 由输入/输出文本估算一轮对话的 token 用量（估算值，非计量精确值）。 */
export function estimateChatTokenUsage(
  inputText: string,
  outputText: string,
): ParsedTokenUsage {
  const inputTokens = estimateTokensFromText(inputText);
  const outputTokens = estimateTokensFromText(outputText);
  return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens };
}

/** 是否在缺失 usage_metadata 时按估算兜底计费（默认关闭：改动真实扣费，需显式开启）。 */
export function isChatTokenEstimateFallbackEnabled(): boolean {
  return process.env.CHAT_TOKEN_USAGE_ESTIMATE_FALLBACK === "true";
}
