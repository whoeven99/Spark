import { TRANSLATION_V4_MODULES } from "../server/translation/v4/types";

/** Tool / API 间传递「首页翻译任务卡片」载荷（与 open_translation_task_form 输出对齐）。 */
export const TRANSLATION_FORM_PAYLOAD_KIND = "translation_task_form_v1" as const;

export type TranslationTaskFormPayload = {
  sourceLocale: string;
  targetLocale: string;
  limitPerType: number;
  resourceTypes: string[];
};

const DEFAULT_RESOURCE_MODULES: TranslationTaskFormPayload["resourceTypes"] = [
  ...TRANSLATION_V4_MODULES,
];

/**
 * 将流式 tool_call 的原始 args 或部分载荷规范为完整表单（避免 resourceTypes 等缺省为 undefined）。
 * 与 `translationTaskFormTool` / `extractTranslationTaskFormFromMessages` 口径一致。
 */
export function coerceTranslationTaskFormPayload(raw: unknown): TranslationTaskFormPayload {
  const rec =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const allowed = new Set<string>([...TRANSLATION_V4_MODULES]);

  const rawTypes = Array.isArray(rec.resourceTypes)
    ? rec.resourceTypes.map((x) => String(x).trim().toUpperCase()).filter(Boolean)
    : [];
  const resourceTypes = rawTypes.filter((x) => allowed.has(x));

  const limitRaw = rec.limitPerType;
  const limitPerType =
    typeof limitRaw === "number" && Number.isFinite(limitRaw)
      ? Math.min(200, Math.max(1, Math.floor(limitRaw)))
      : 20;

  const source = String(rec.sourceLocale ?? "zh-CN").trim();
  const target = String(rec.targetLocale ?? "").trim();

  return {
    sourceLocale: source || "zh-CN",
    targetLocale: target,
    limitPerType,
    resourceTypes: resourceTypes.length ? resourceTypes : [...DEFAULT_RESOURCE_MODULES],
  };
}
