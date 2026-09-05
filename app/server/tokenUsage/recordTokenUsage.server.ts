import prisma from "../../db.server";
import type { ParsedTokenUsage } from "./parseUsageMetadata.server";

export type RecordTokenUsageParams = {
  shop: string;
  usage: ParsedTokenUsage;
};

/**
 * 累加 `usedTokens`（周期内不修改各池额度；续费时再结算按量包剩余）。
 */
export async function recordTokenUsage(
  params: RecordTokenUsageParams,
): Promise<void> {
  const shop = params.shop.trim();
  if (!shop) return;

  const { usage } = params;
  if (usage.totalTokens <= 0) return;

  try {
    await prisma.account.upsert({
      where: { shop },
      create: {
        shop,
        subscriptionTokens: 0,
        purchasedTokens: 0,
        usedTokens: usage.totalTokens,
      },
      update: {
        usedTokens: { increment: usage.totalTokens },
      },
    });
  } catch (error) {
    // 不向上抛：DB 抖动不应打断聊天回复；但必须留下可检索的漏计告警以便对账。
    console.error(
      `[TokenUsage][record-failed] usedTokens NOT incremented shop=${shop} tokens=${usage.totalTokens}:`,
      error,
    );
  }
}
