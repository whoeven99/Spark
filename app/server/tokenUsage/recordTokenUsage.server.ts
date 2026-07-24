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
        trialTokens: 0,
        usedTokens: usage.totalTokens,
      },
      update: {
        usedTokens: { increment: usage.totalTokens },
      },
    });
  } catch (error) {
    console.error("[TokenUsage] recordTokenUsage failed:", error);
  }
}
