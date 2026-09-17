import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import {
  HEALTH_DIAGNOSIS_CARD_PAYLOAD_KIND,
  coerceHealthDiagnosisFormPayload,
  defaultHealthDiagnosisFormPayload,
  type HealthDiagnosisFormPayload,
} from "../../../../lib/healthDiagnosisCardPayload";
import type { ToolDefinition } from "../../core/toolRegistry.server";
import { resolveHealthDiagnosisCardPayload } from "./healthDiagnosis.extract";

export const OPEN_HEALTH_DIAGNOSIS_FORM_TOOL_NAME = "open_health_diagnosis_form";

/**
 * 当用户要看今日健康诊断与待办时调用：在聊天内展示确认卡（读快照 / 可强制刷新，不调 LLM）。
 */
export const healthDiagnosisFormTool = new DynamicStructuredTool({
  name: OPEN_HEALTH_DIAGNOSIS_FORM_TOOL_NAME,
  description:
    "仅当用户明确要看「今日健康诊断」「今日待办与风险」「店铺健康检查」「有什么要处理的」时使用，打开健康诊断与待办卡片。不要在用户笼统问「店铺怎么样 / 目前如何 / 近况」时调用。不要在用户只问销售额/转化率等具体数字时调用。若用户明确要求用文字解读诊断数字，可改用 get_daily_operations。",
  schema: z.object({}),
  func: async () => {
    const payload: HealthDiagnosisFormPayload & {
      _sparkKind: typeof HEALTH_DIAGNOSIS_CARD_PAYLOAD_KIND;
    } = {
      _sparkKind: HEALTH_DIAGNOSIS_CARD_PAYLOAD_KIND,
      ...defaultHealthDiagnosisFormPayload(),
    };
    return JSON.stringify(payload);
  },
});

export const healthDiagnosisFormSkillDefinition: ToolDefinition = {
  name: "healthDiagnosisForm",
  displayName: "健康诊断与待办",
  category: "店铺运营",
  stage: "monitor",
  visibility: "internal",
  description:
    "在聊天内打开今日健康诊断与待办卡片（规则引擎快照）。仅限显式诊断/待办意图，不含笼统「店铺怎么样」。",
  uiPayloadKey: "healthDiagnosisCard",
  systemPromptExtension:
    "仅当用户明确要「今日健康诊断」「今日待办」「有哪些风险要处理」「店铺健康检查」时，才调用 open_health_diagnosis_form 打开聊天内卡片；调用后简短说明可在卡片内查看风险与待办。笼统「店铺怎么样 / 目前如何 / 近况」禁止开此卡。禁止让用户去设置页或 Today。禁止在未成功调用该工具时声称「已打开卡片」。本卡片读取规则引擎快照，不消耗 LLM、不创建异步 AITask。用户追问某条待办时只做只读解读与列对象。仅当用户明确要求用文字解读/总结诊断并引用数字时，再调用 get_daily_operations。",
  createTool: () => [healthDiagnosisFormTool],
  onStreamEvent: (ev, enqueue, streamContext) => {
    if (
      ev.event === "on_tool_start" &&
      ev.name === OPEN_HEALTH_DIAGNOSIS_FORM_TOOL_NAME
    ) {
      streamContext.emittedFlags.add("healthDiagnosisForm");
      enqueue({
        type: "tool_call",
        name: ev.name,
        args: coerceHealthDiagnosisFormPayload(ev.input),
      });
    }
  },
  extractUIPayload: (messages) => resolveHealthDiagnosisCardPayload(messages),
};
