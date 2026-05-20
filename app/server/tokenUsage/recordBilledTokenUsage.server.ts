import { getAppEntry } from "../../config/appEntry.server";
import { isBillingEnabledForApp } from "../billing/constants.server";
import type { BilledTokenUsageItem } from "./applyTokenBilling.server";
import { sumBilledTokenUsages } from "./applyTokenBilling.server";
import { recordTokenUsage } from "./recordTokenUsage.server";
import type { ParsedTokenUsage } from "./parseUsageMetadata.server";
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

  const usage = await sumBilledTokenUsages({ appName, items: params.items });
  if (usage.totalTokens <= 0) return;

  await recordTokenUsage({ shop, appName, usage });
}
