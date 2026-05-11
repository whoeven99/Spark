import type { BaseMessage } from "@langchain/core/messages";
import { ToolMessage } from "@langchain/core/messages";
import {
  TRANSLATION_FORM_PAYLOAD_KIND,
  type TranslationTaskFormPayload,
} from "../../lib/translationTaskFormPayload";
import { ALLOWED_TRANSLATABLE_RESOURCE_TYPES } from "../translation/types";

const DEFAULT_RESOURCE_MODULES: TranslationTaskFormPayload["resourceTypes"] = [
  "PRODUCT",
  "COLLECTION",
  "PAGE",
  "ARTICLE",
];

/** 从 Agent 消息序列中取出最近一次「翻译任务表单」工具输出。 */
export function extractTranslationTaskFormFromMessages(
  messages: BaseMessage[],
): TranslationTaskFormPayload | undefined {
  const allowed = new Set<string>(ALLOWED_TRANSLATABLE_RESOURCE_TYPES);

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (!ToolMessage.isInstance(m)) continue;

    const raw = typeof m.content === "string" ? m.content.trim() : "";
    if (!raw.startsWith("{")) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object") continue;

    const rec = parsed as Record<string, unknown>;
    if (rec._sparkKind !== TRANSLATION_FORM_PAYLOAD_KIND) continue;

    const rawTypes = Array.isArray(rec.resourceTypes)
      ? rec.resourceTypes.map((x) => String(x).trim().toUpperCase()).filter(Boolean)
      : [];
    const resourceTypes = rawTypes.filter((x) => allowed.has(x));

    return {
      sourceLocale: String(rec.sourceLocale ?? "zh-CN"),
      targetLocale: String(rec.targetLocale ?? ""),
      limitPerType:
        typeof rec.limitPerType === "number" && Number.isFinite(rec.limitPerType)
          ? rec.limitPerType
          : 20,
      resourceTypes: resourceTypes.length ? resourceTypes : [...DEFAULT_RESOURCE_MODULES],
    };
  }
  return undefined;
}
