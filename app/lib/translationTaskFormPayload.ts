
/** Tool / API 间传递「首页翻译任务卡片」载荷（与 open_translation_task_form 输出对齐）。 */
export const TRANSLATION_FORM_PAYLOAD_KIND = "translation_task_form_v1" as const;

export type TranslationTaskFormPayload = {
  sourceLocale: string;
  targetLocale: string;
  taskName?: string;
  contentToTranslate?: string;
  notes?: string;
};



/**
 * 将流式 tool_call 的原始 args 或部分载荷规范为完整表单（避免 resourceTypes 等缺省为 undefined）。
 * 与 `translationTaskFormTool` / `extractTranslationTaskFormFromMessages` 口径一致。
 */
export function coerceTranslationTaskFormPayload(raw: unknown): TranslationTaskFormPayload {
  const rec =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  const source = String(rec.sourceLocale ?? "zh-CN").trim();
  const target = String(rec.targetLocale ?? "").trim();
  const taskName = String(rec.taskName ?? "").trim();
  const contentToTranslate = String(rec.contentToTranslate ?? "").trim();
  const notes = String(rec.notes ?? "").trim();

  return {
    sourceLocale: source || "zh-CN",
    targetLocale: target,
    taskName,
    contentToTranslate,
    notes,
  };
}
