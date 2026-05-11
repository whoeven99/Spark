/** Tool / API 间传递「首页翻译任务卡片」载荷（与 open_translation_task_form 输出对齐）。 */
export const TRANSLATION_FORM_PAYLOAD_KIND = "translation_task_form_v1" as const;

export type TranslationTaskFormPayload = {
  sourceLocale: string;
  targetLocale: string;
  limitPerType: number;
  resourceTypes: string[];
};
