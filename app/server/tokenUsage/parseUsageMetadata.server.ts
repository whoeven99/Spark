export type ParsedTokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

function toNonNegativeInt(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

/**
 * 将 LangChain `usage_metadata` 或同类结构规范为 token 计数。
 */
export function parseUsageMetadata(meta: unknown): ParsedTokenUsage {
  if (!meta || typeof meta !== "object") {
    return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  }

  const record = meta as Record<string, unknown>;
  const inputTokens = toNonNegativeInt(
    record.input_tokens ?? record.inputTokens ?? record.prompt_tokens,
  );
  const outputTokens = toNonNegativeInt(
    record.output_tokens ?? record.outputTokens ?? record.completion_tokens,
  );
  let totalTokens = toNonNegativeInt(
    record.total_tokens ?? record.totalTokens,
  );
  if (totalTokens === 0 && (inputTokens > 0 || outputTokens > 0)) {
    totalTokens = inputTokens + outputTokens;
  }

  return { inputTokens, outputTokens, totalTokens };
}

export function sumParsedTokenUsage(usages: ParsedTokenUsage[]): ParsedTokenUsage {
  return usages.reduce(
    (acc, u) => ({
      inputTokens: acc.inputTokens + u.inputTokens,
      outputTokens: acc.outputTokens + u.outputTokens,
      totalTokens: acc.totalTokens + u.totalTokens,
    }),
    { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
  );
}
