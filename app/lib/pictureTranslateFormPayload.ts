/** Tool / 流式 SSE 间传递「整图翻译卡片」预填载荷（与 open_picture_translate_form 输出对齐）。 */
export const PICTURE_TRANSLATE_FORM_PAYLOAD_KIND = "picture_translate_form_v1" as const;

export type PictureTranslateFormPayload = {
  imageUrl?: string;
  sourceLanguage: string;
  targetLanguage: string;
};

export function defaultPictureTranslateFormPayload(): PictureTranslateFormPayload {
  return {
    sourceLanguage: "auto",
    targetLanguage: "zh",
  };
}

export function coercePictureTranslateFormPayload(raw: unknown): PictureTranslateFormPayload {
  const rec =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  const imageUrl = String(rec.imageUrl ?? "").trim();
  const sourceLanguage = String(rec.sourceLanguage ?? "auto").trim() || "auto";
  const targetLanguage = String(rec.targetLanguage ?? "zh").trim() || "zh";

  return {
    ...(imageUrl ? { imageUrl } : {}),
    sourceLanguage,
    targetLanguage,
  };
}

export function isPictureTranslateFormToolPayload(raw: unknown): boolean {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  return (raw as Record<string, unknown>)._sparkKind === PICTURE_TRANSLATE_FORM_PAYLOAD_KIND;
}
