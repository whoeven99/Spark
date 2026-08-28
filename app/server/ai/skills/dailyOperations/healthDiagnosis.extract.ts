import {
  AIMessage,
  ToolMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import {
  coerceHealthDiagnosisFormPayload,
  isHealthDiagnosisFormToolPayload,
  type HealthDiagnosisFormPayload,
} from "../../../../lib/healthDiagnosisCardPayload";
import { OPEN_HEALTH_DIAGNOSIS_FORM_TOOL_NAME } from "./healthDiagnosis.form.tool";

function tryParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

/** 从 agent 消息中提取健康诊断卡片载荷（打开标记即可）。 */
export function resolveHealthDiagnosisCardPayload(
  messages: BaseMessage[],
): HealthDiagnosisFormPayload | undefined {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (ToolMessage.isInstance(msg) && msg.name === OPEN_HEALTH_DIAGNOSIS_FORM_TOOL_NAME) {
      const parsed = tryParseJson(String(msg.content ?? ""));
      if (isHealthDiagnosisFormToolPayload(parsed) || parsed) {
        return coerceHealthDiagnosisFormPayload(parsed);
      }
      return coerceHealthDiagnosisFormPayload({});
    }
    if (AIMessage.isInstance(msg) && Array.isArray(msg.tool_calls)) {
      for (const call of msg.tool_calls) {
        if (call.name === OPEN_HEALTH_DIAGNOSIS_FORM_TOOL_NAME) {
          return coerceHealthDiagnosisFormPayload(call.args ?? {});
        }
      }
    }
  }
  return undefined;
}
