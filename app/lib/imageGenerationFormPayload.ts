/** Tool / 流式 SSE 间传递「文生图卡片」预填载荷（与 open_image_generation_form 输出对齐）。 */
export const IMAGE_GENERATION_FORM_PAYLOAD_KIND = "image_generation_form_v1" as const;

export type ImageGenerationFormPayload = {
  description: string;
};

export function defaultImageGenerationFormPayload(): ImageGenerationFormPayload {
  return { description: "" };
}

export function coerceImageGenerationFormPayload(raw: unknown): ImageGenerationFormPayload {
  const rec =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  return {
    description: typeof rec.description === "string" ? rec.description : "",
  };
}

export function isImageGenerationFormToolPayload(raw: unknown): boolean {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  return (raw as Record<string, unknown>)._sparkKind === IMAGE_GENERATION_FORM_PAYLOAD_KIND;
}
