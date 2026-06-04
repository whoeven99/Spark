import { getAppEntry } from "../../config/appEntry.server";
import { isBillingEnabledForApp } from "../billing/constants.server";
import { requireBillingAccess } from "../billing/requireBilling.server";
import {
  DEFAULT_IMAGE_GENERATION_IMAGE_TOKEN_COST,
  DEFAULT_PICTURE_TRANSLATE_TOKEN_COST,
} from "./tokenBillingDefaults.server";
import type { ParsedTokenUsage } from "./parseUsageMetadata.server";
import {
  imageGenerationBillingModelKey,
  pictureTranslateBillingModelKey,
} from "./tokenBillingTypes.server";
import {
  recordBilledTokenUsages,
  type BilledTokenUsageItem,
} from "./recordBilledTokenUsage.server";

export {
  DEFAULT_IMAGE_GENERATION_IMAGE_TOKEN_COST,
  DEFAULT_PICTURE_TRANSLATE_TOKEN_COST,
} from "./tokenBillingDefaults.server";

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** 整图翻译定额基准（乘数由 TokenBillingRule 决定）。 */
export function getPictureTranslateTokenCost(
  provider?: "volc" | "aidge" | string | null,
): ParsedTokenUsage {
  const total = readPositiveIntEnv(
    "PICTURE_TRANSLATE_TOKEN_COST",
    DEFAULT_PICTURE_TRANSLATE_TOKEN_COST,
  );
  void provider;
  return { inputTokens: 0, outputTokens: 0, totalTokens: total };
}

/** 文生图出图定额基准（乘数由 TokenBillingRule 决定）。 */
export function getImageGenerationImageTokenCost(
  provider?: "openai" | "volc" | string | null,
): ParsedTokenUsage {
  const total = readPositiveIntEnv(
    "IMAGE_GENERATION_TOKEN_COST",
    DEFAULT_IMAGE_GENERATION_IMAGE_TOKEN_COST,
  );
  void provider;
  return { inputTokens: 0, outputTokens: 0, totalTokens: total };
}

export async function requireVisualToolBillingAccess(
  shop: string,
  appName?: string,
): Promise<void> {
  const resolvedApp = appName?.trim() || getAppEntry();
  if (!isBillingEnabledForApp(resolvedApp)) return;
  await requireBillingAccess(shop, resolvedApp);
}

/**
 * 图片工具成功完成后按「feature × 模型」系数计入 `Account.usedTokens`。
 * 返回实际计费积分数（计费未启用时返回 null）。
 */
export async function recordVisualToolTokenUsage(params: {
  shop: string;
  appName?: string;
  items: BilledTokenUsageItem[];
}): Promise<number | null> {
  const shop = params.shop.trim();
  if (!shop || params.items.length === 0) return null;

  const appName = params.appName?.trim() || getAppEntry();
  if (!isBillingEnabledForApp(appName)) return null;

  const billedTokens = await recordBilledTokenUsages({
    shop,
    appName,
    items: params.items,
  });
  return billedTokens;
}

export function buildPictureTranslateBillingItem(
  provider: "volc" | "aidge" | string | null | undefined,
): BilledTokenUsageItem {
  return {
    feature: "picture_translate",
    modelKey: pictureTranslateBillingModelKey(provider),
    usage: getPictureTranslateTokenCost(provider),
  };
}

export function buildImageGenerateBillingItem(
  provider: "openai" | "volc" | string | null | undefined,
): BilledTokenUsageItem {
  return {
    feature: "image_generate",
    modelKey: imageGenerationBillingModelKey(provider),
    usage: getImageGenerationImageTokenCost(provider),
  };
}

export function buildImagePromptBillingItem(
  modelKey: string,
  usage: ParsedTokenUsage | unknown,
): BilledTokenUsageItem {
  return {
    feature: "image_prompt",
    modelKey,
    usage,
  };
}
