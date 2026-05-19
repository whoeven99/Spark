import type { AppEntry } from "../../config/appEntry.server";
import prisma from "../../db.server";
import type { ParsedTokenUsage } from "./parseUsageMetadata.server";

export type RecordTokenUsageParams = {
  shop: string;
  appName: AppEntry | string;
  usage: ParsedTokenUsage;
};

/**
 * 累加店铺在对应 App 下的 `usedTokens`（不写明细表）。
 * `allTokens` 保持默认 0，供后续配额逻辑使用。
 */
export async function recordTokenUsage(
  params: RecordTokenUsageParams,
): Promise<void> {
  const shop = params.shop.trim();
  if (!shop) return;

  const { usage } = params;
  if (usage.totalTokens <= 0) return;

  const appName = String(params.appName).trim();
  if (!appName) return;

  try {
    await prisma.account.upsert({
      where: {
        shop_appName: { shop, appName },
      },
      create: {
        shop,
        appName,
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
