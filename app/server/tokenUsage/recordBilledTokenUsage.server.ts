import { getAppEntry } from "../../config/appEntry.server";
import prisma from "../../db.server";
import { isBillingEnabledForApp } from "../billing/constants.server";
import type { BilledTokenUsageItem } from "./applyTokenBilling.server";
import { billTokenUsage } from "./applyTokenBilling.server";
import { recordTokenUsage } from "./recordTokenUsage.server";
import type { ParsedTokenUsage } from "./parseUsageMetadata.server";
import { parseUsageMetadata, sumParsedTokenUsage } from "./parseUsageMetadata.server";
import type { TokenBillingFeature } from "./tokenBillingTypes.server";

export type RecordBilledTokenUsageParams = {
  shop: string;
  appName?: string;
  feature: TokenBillingFeature;
  modelKey: string;
  usage: ParsedTokenUsage | unknown;
};

/**
 * 按 Turso `TokenBillingRule` 乘数计入 `Account.usedTokens`（仅启用计费的 App）。
 */
export async function recordBilledTokenUsage(
  params: RecordBilledTokenUsageParams,
): Promise<void> {
  await recordBilledTokenUsages({
    shop: params.shop,
    appName: params.appName,
    items: [
      {
        feature: params.feature,
        modelKey: params.modelKey,
        usage: params.usage,
      },
    ],
  });
}

/** 返回实际计费 token 总数（未产生计费时返回 0）。 */
export async function recordBilledTokenUsages(params: {
  shop: string;
  appName?: string;
  items: BilledTokenUsageItem[];
}): Promise<number> {
  const shop = params.shop.trim();
  if (!shop || params.items.length === 0) return 0;

  const appName = params.appName?.trim() || getAppEntry();
  if (!isBillingEnabledForApp(appName)) return 0;

  const billedItems = await Promise.all(
    params.items.map(async (item) => {
      const rawUsage = parseUsageMetadata(item.usage);
      const billedUsage = await billTokenUsage({
        appName,
        feature: item.feature,
        modelKey: item.modelKey,
        usage: item.usage,
      });
      return { item, rawUsage, billedUsage };
    }),
  );

  const positiveItems = billedItems.filter((entry) => entry.billedUsage.totalTokens > 0);
  if (positiveItems.length <= 0) return 0;

  const usage = sumParsedTokenUsage(positiveItems.map((entry) => entry.billedUsage));
  if (usage.totalTokens <= 0) return 0;

  await recordTokenUsage({ shop, appName, usage });

  await prisma.toolTokenUsageLog.createMany({
    data: positiveItems.map((entry) => ({
      shop,
      appName,
      feature: entry.item.feature,
      modelKey: entry.item.modelKey,
      rawTokens: entry.rawUsage.totalTokens,
      billedTokens: entry.billedUsage.totalTokens,
      inputTokens: entry.billedUsage.inputTokens,
      outputTokens: entry.billedUsage.outputTokens,
    })),
  });

  return usage.totalTokens;
}
