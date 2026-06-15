import type { BaseMessage } from "@langchain/core/messages";
import { ToolMessage } from "@langchain/core/messages";
import {
  coerceTranslationTaskFormPayload,
  TRANSLATION_FORM_PAYLOAD_KIND,
  type TranslationTaskFormPayload,
} from "../../../../lib/translationTaskFormPayload";
import { extractMessageText } from "../../utils/langchainMessageText";

/** 与 `open_translation_task_form` 工具缺省一致，供 LLM 兜底下发给前端。 */
export function defaultTranslationTaskFormPayload(): TranslationTaskFormPayload {
  return coerceTranslationTaskFormPayload({});
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

    return coerceTranslationTaskFormPayload(rec);
  }
  return undefined;
}
