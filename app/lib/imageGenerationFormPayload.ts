/** Tool / 流式 SSE 间传递「文生图卡片」预填载荷（与 open_image_generation_form 输出对齐）。 */
export const IMAGE_GENERATION_FORM_PAYLOAD_KIND = "image_generation_form_v1" as const;

export type ImageGenerationFormPayload = {
  description: string;
  productId?: string;
  productTitle?: string;
};

export function defaultImageGenerationFormPayload(): ImageGenerationFormPayload {
  return { description: "" };
}

export function coerceImageGenerationFormPayload(raw: unknown): ImageGenerationFormPayload {
  const rec =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  const productId = typeof rec.productId === "string" ? rec.productId.trim() : "";
  const productTitle = typeof rec.productTitle === "string" ? rec.productTitle.trim() : "";

  return {
    description: typeof rec.description === "string" ? rec.description : "",
    ...(productId ? { productId } : {}),
    ...(productTitle ? { productTitle } : {}),
  };
}

export function isImageGenerationFormToolPayload(raw: unknown): boolean {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  return (raw as Record<string, unknown>)._sparkKind === IMAGE_GENERATION_FORM_PAYLOAD_KIND;
}

/** 卡片未带商品时，用工作台已选的第一个商品预填。 */
export function mergeImageGenerationContextProduct(
  form: ImageGenerationFormPayload,
  product?: { id: string; title: string } | null,
): ImageGenerationFormPayload {
  if (form.productId?.trim() || !product?.id.trim()) return form;
  return coerceImageGenerationFormPayload({
    ...form,
    productId: product.id,
    productTitle: product.title,
  });
}

/** 历史 TaskProposal（文生图）→ 对话内文生图表单载荷。 */
export function imageGenerationFormFromProposal(proposal: {
  skillId: string;
  params: Array<{ key: string; value: string }>;
}): ImageGenerationFormPayload | null {
  if (proposal.skillId !== "image_generation") return null;
  const description = proposal.params.find((field) => field.key === "description")?.value ?? "";
  const productId = proposal.params.find((field) => field.key === "productId")?.value ?? "";
  const productTitle = proposal.params.find((field) => field.key === "productTitle")?.value ?? "";
  return coerceImageGenerationFormPayload({ description, productId, productTitle });
}
