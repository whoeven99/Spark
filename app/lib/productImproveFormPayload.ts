/** Tool / 流式 SSE 间传递「商品描述卡片」预填载荷（与 open_product_improve_form 输出对齐）。 */
export const PRODUCT_IMPROVE_FORM_PAYLOAD_KIND = "product_improve_form_v1" as const;

export type ProductImproveFormPayload = {
  productId: string;
  title: string;
  description: string;
  targetLanguage?: string;
};

export function defaultProductImproveFormPayload(): ProductImproveFormPayload {
  return {
    productId: "",
    title: "",
    description: "",
  };
}

export function coerceProductImproveFormPayload(raw: unknown): ProductImproveFormPayload {
  const rec =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  const productId = String(rec.productId ?? "").trim();
  const title = String(rec.title ?? "").trim();
  const description = typeof rec.description === "string" ? rec.description : "";
  const targetLanguage = String(rec.targetLanguage ?? "").trim();

  return {
    productId,
    title,
    description,
    ...(targetLanguage ? { targetLanguage } : {}),
  };
}

export function isProductImproveFormToolPayload(raw: unknown): boolean {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  return (raw as Record<string, unknown>)._sparkKind === PRODUCT_IMPROVE_FORM_PAYLOAD_KIND;
}
