import {
  parseUsageMetadata,
  type ParsedTokenUsage,
} from "./parseUsageMetadata.server";
import { recordBilledTokenUsages } from "./recordBilledTokenUsage.server";
import { normalizeBillingModelKey } from "./tokenBillingTypes.server";

/** Ask 聊天 Agent 使用的计费 modelKey（与 shopChatGraph 对齐）。 */
export function resolveChatBillingModelKey(): string {
  return normalizeBillingModelKey(
    process.env.DEEPSEEK_MODEL ?? process.env.OPENAI_MODEL ?? "deepseek-chat",
  );
}

/**
 * 将聊天相关 LLM 用量记入 Account.usedTokens + ToolTokenUsageLog（feature=chat）。
 * 这是聊天主链路 / 卡片补全 / fallback 的统一记账入口。
 */
export async function recordChatTokenUsage(params: {
  shop: string;
  usage: ParsedTokenUsage | unknown;
  modelKey?: string;
}): Promise<number> {
  const shop = params.shop.trim();
  if (!shop) return 0;

  const usage = parseUsageMetadata(params.usage);
  if (usage.totalTokens <= 0) return 0;

  return recordBilledTokenUsages({
    shop,
    items: [
      {
        feature: "chat",
        modelKey: params.modelKey ?? resolveChatBillingModelKey(),
        usage,
      },
    ],
  });
}
