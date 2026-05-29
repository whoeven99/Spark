import { TRANSLATION_V4_MODULES } from "../server/translation/v4/types";

/** Tool / API 间传递「首页翻译任务卡片」载荷（与 open_translation_task_form 输出对齐）。 */
export const TRANSLATION_FORM_PAYLOAD_KIND = "translation_task_form_v1" as const;

export type TranslationTaskFormPayload = {
  sourceLocale: string;
  /** 兼容旧消息；多选时可为第一项 */
  targetLocale: string;
  targetLocales?: string[];
  limitPerType: number;
  resourceTypes: string[];
};

const DEFAULT_RESOURCE_MODULES: TranslationTaskFormPayload["resourceTypes"] = [
  ...TRANSLATION_V4_MODULES,
];

function parseTargetLocalesFromRaw(rec: Record<string, unknown>): string[] {
  if (Array.isArray(rec.targetLocales)) {
    return rec.targetLocales
      .map((x) => String(x).trim())
      .filter(Boolean);
  }
  const single = String(rec.targetLocale ?? "").trim();
  return single ? [single] : [];
}

/** 从 payload 取目标语言列表（多选优先）。 */
export function getTargetLocalesFromPayload(
  payload: TranslationTaskFormPayload,
): string[] {
  if (payload.targetLocales?.length) {
    return payload.targetLocales.map((x) => x.trim()).filter(Boolean);
  }
  const single = payload.targetLocale.trim();
  return single ? [single] : [];
}

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
  const targetLocales = parseTargetLocalesFromRaw(rec);
  const targetLocale = targetLocales[0] ?? "";

  return {
    sourceLocale: source || "zh-CN",
    targetLocale,
    ...(targetLocales.length ? { targetLocales } : {}),
    limitPerType,
    resourceTypes: resourceTypes.length ? resourceTypes : [...DEFAULT_RESOURCE_MODULES],
  };
}
