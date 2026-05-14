import type { BaseMessage } from "@langchain/core/messages";
import { ToolMessage } from "@langchain/core/messages";
import {
  TRANSLATION_FORM_PAYLOAD_KIND,
  type TranslationTaskFormPayload,
} from "../../../lib/translationTaskFormPayload";
import { ALLOWED_TRANSLATABLE_RESOURCE_TYPES } from "../../translation/types";
import { extractMessageText } from "./langchainMessageText";

const DEFAULT_RESOURCE_MODULES: TranslationTaskFormPayload["resourceTypes"] = [
  "PRODUCT",
  "COLLECTION",
  "PAGE",
  "ARTICLE",
];

/** 与 `open_translation_task_form` 工具缺省一致，供服务端兜底下发给前端。 */
export function defaultTranslationTaskFormPayload(): TranslationTaskFormPayload {
  return {
    sourceLocale: "zh-CN",
    targetLocale: "",
    limitPerType: 20,
    resourceTypes: [...DEFAULT_RESOURCE_MODULES],
  };
}

/**
 * 模型未调用工具但口头称已打开「翻译任务卡片」时，用默认表单补全，避免前端无卡片。
 */
export function shouldInjectTranslationTaskFormFallback(
  lastUserText: string,
  assistantReplyText: string,
): boolean {
  const u = lastUserText.trim();
  const a = assistantReplyText.trim();
  if (!u || !a) return false;
  const userSignals =
    /翻译任务|创建翻译|批量翻译|打开卡片|翻译\s*卡片|我要翻译|开启翻译/i.test(u);
  const assistantSignals =
    /卡片|表单|创建翻译任务|翻译任务创建|已为你打开|已经为你打开/i.test(a);
  return userSignals && assistantSignals;
}

function toolMessageJsonPayloadString(m: ToolMessage): string | null {
  const fromText = extractMessageText(m).trim();
  if (fromText.startsWith("{")) return fromText;
  const c = m.content as unknown;
  if (c && typeof c === "object" && !Array.isArray(c)) {
    const s = JSON.stringify(c);
    return s.startsWith("{") ? s : null;
  }
  return null;
}

/** 从 Agent 消息序列中取出最近一次「翻译任务表单」工具输出。 */
export function extractTranslationTaskFormFromMessages(
  messages: BaseMessage[],
): TranslationTaskFormPayload | undefined {
  const allowed = new Set<string>(ALLOWED_TRANSLATABLE_RESOURCE_TYPES);

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (!ToolMessage.isInstance(m)) continue;

    const raw = toolMessageJsonPayloadString(m);
    if (!raw) continue;

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
