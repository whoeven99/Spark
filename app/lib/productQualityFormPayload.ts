/** Tool / 流式 SSE 间传递「商品页质量评分卡片」预填或结果载荷。 */
import type {
  ProductQualityDimension,
  ProductQualityScoreData,
} from "./productQualityScoreTypes";

export const PRODUCT_QUALITY_FORM_PAYLOAD_KIND = "product_quality_form_v1" as const;

export type ProductQualityFormPayload = {
  productId: string;
  title?: string;
} & Partial<ProductQualityScoreData> & {
  billedTokens?: number;
};

export function defaultProductQualityFormPayload(): ProductQualityFormPayload {
  return { productId: "" };
}

function coerceDimension(raw: unknown): ProductQualityDimension | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const rec = raw as Record<string, unknown>;
  const score = Number(rec.score);
  if (!Number.isFinite(score)) return undefined;
  return {
    score,
    suggestion: typeof rec.suggestion === "string" ? rec.suggestion : "",
  };
}

export function coerceProductQualityFormPayload(raw: unknown): ProductQualityFormPayload {
  const rec =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  const productId = String(rec.productId ?? "").trim();
  const title = String(rec.title ?? "").trim();
  const billedTokensRaw = Number(rec.billedTokens);
  const billedTokens = Number.isFinite(billedTokensRaw) && billedTokensRaw > 0
    ? Math.round(billedTokensRaw)
    : undefined;

  const scoreRaw = Number(rec.score);
  const score = Number.isFinite(scoreRaw) ? scoreRaw : undefined;
  const overallSuggestions = Array.isArray(rec.overallSuggestions)
    ? rec.overallSuggestions.filter((item): item is string => typeof item === "string")
    : undefined;

  const dimRec =
    rec.dimensions && typeof rec.dimensions === "object" && !Array.isArray(rec.dimensions)
      ? (rec.dimensions as Record<string, unknown>)
      : null;
  const titleDim = coerceDimension(dimRec?.title);
  const imagesDim = coerceDimension(dimRec?.images);
  const descriptionDim = coerceDimension(dimRec?.description);
  const variantsDim = coerceDimension(dimRec?.variants);
  const tagsDim = coerceDimension(dimRec?.tags);
  const dimensions =
    titleDim && imagesDim && descriptionDim && variantsDim && tagsDim
      ? {
          title: titleDim,
          images: imagesDim,
          description: descriptionDim,
          variants: variantsDim,
          tags: tagsDim,
        }
      : undefined;

  return {
    productId,
    ...(title ? { title } : {}),
    ...(score != null ? { score } : {}),
    ...(dimensions ? { dimensions } : {}),
    ...(overallSuggestions ? { overallSuggestions } : {}),
    ...(billedTokens != null ? { billedTokens } : {}),
  };
}

export function isProductQualityFormToolPayload(raw: unknown): boolean {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  return (raw as Record<string, unknown>)._sparkKind === PRODUCT_QUALITY_FORM_PAYLOAD_KIND;
}

export function productQualityFormHasScore(
  payload: ProductQualityFormPayload | null | undefined,
): boolean {
  return Boolean(
    payload &&
      payload.score != null &&
      payload.dimensions &&
      payload.productId.trim(),
  );
}
