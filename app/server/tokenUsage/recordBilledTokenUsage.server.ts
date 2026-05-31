import { getAppEntry } from "../../config/appEntry.server";
import { isBillingEnabledForApp } from "../billing/constants.server";
import { appendBillingLog } from "../billing/billingLog.server";
import { BILLING_LOG_EVENT } from "../billing/types.server";
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

export async function recordBilledTokenUsages(params: {
  shop: string;
  appName?: string;
  items: BilledTokenUsageItem[];
}): Promise<void> {
  const shop = params.shop.trim();
  if (!shop || params.items.length === 0) return;

  const appName = params.appName?.trim() || getAppEntry();
  if (!isBillingEnabledForApp(appName)) return;

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
  if (positiveItems.length <= 0) return;

  const usage = sumParsedTokenUsage(positiveItems.map((entry) => entry.billedUsage));
  if (usage.totalTokens <= 0) return;

  await recordTokenUsage({ shop, appName, usage });

  await Promise.all(
    positiveItems.map((entry) =>
      appendBillingLog({
        shop,
        appName,
        eventType: BILLING_LOG_EVENT.TOOL_TOKEN_USED,
        tokensDelta: -entry.billedUsage.totalTokens,
        usedTokens: entry.billedUsage.totalTokens,
        metadata: {
          feature: entry.item.feature,
          modelKey: entry.item.modelKey,
          rawTokens: entry.rawUsage.totalTokens,
          billedTokens: entry.billedUsage.totalTokens,
          inputTokens: entry.billedUsage.inputTokens,
          outputTokens: entry.billedUsage.outputTokens,
        },
      }),
    ),
  );
}
