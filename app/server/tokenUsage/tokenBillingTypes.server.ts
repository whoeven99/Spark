/** 计入 Account.usedTokens 前按「业务能力 × 模型」查表的 feature。 */
export const TOKEN_BILLING_FEATURES = [
  "product_copy",
  "image_prompt",
  "image_generate",
  "picture_translate",
] as const;

export type TokenBillingFeature = (typeof TOKEN_BILLING_FEATURES)[number];

export function isTokenBillingFeature(value: string): value is TokenBillingFeature {
  return (TOKEN_BILLING_FEATURES as readonly string[]).includes(value);
}

export function normalizeBillingModelKey(raw: string): string {
  const normalized = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || "_default";
}

/** 与 `OPENAI_IMAGE_MODEL` / `IMAGE_GEN_VOLC_REQ_KEY` 对齐，供 TokenBillingRule.modelKey 匹配。 */
export function imageGenerationBillingModelKey(
  provider: "openai" | "volc" | string | null | undefined,
): string {
  if (provider === "volc") {
    const reqKey =
      process.env.IMAGE_GEN_VOLC_REQ_KEY?.trim() || "high_aes_general_v20";
    return normalizeBillingModelKey(reqKey);
  }
  if (provider === "openai") {
    const model =
      process.env.OPENAI_IMAGE_MODEL?.trim() ||
      process.env.OPENAI_DALLE_MODEL?.trim() ||
      "gpt-image-2";
    return normalizeBillingModelKey(model);
  }
  return "_default";
}

export function pictureTranslateBillingModelKey(
  provider: "volc" | "aidge" | string | null | undefined,
): string {
  if (provider === "volc") return "volc-translate";
  if (provider === "aidge") return "aidge-translate";
  return "_default";
}
