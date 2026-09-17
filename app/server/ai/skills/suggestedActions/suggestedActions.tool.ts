import { AIMessage, ToolMessage, type BaseMessage } from "@langchain/core/messages";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import {
  WORKSPACE_ACTION_KEYS,
  parseWorkspaceActionsPayload,
  type WorkspaceActionsPayload,
} from "../../../../lib/workspaceSuggestedActions";
import type { ToolDefinition } from "../../core/toolRegistry.server";

export const SUGGEST_NEXT_ACTIONS_TOOL_NAME = "suggest_next_actions";

const ACTION_KEY_GUIDE = [
  "todayPulse=今日健康诊断与待办",
  "seoAudit=站内 SEO 体检",
  "connectAds=连接广告账户",
  "viewAdsPerformance=查看广告表现",
  "qualityScore=商品页质量评分",
  "optimizeCopy=优化商品文案",
  "translateImage=翻译商品图文字",
  "generateImage=生成商品主图",
  "productExport=导出商品",
  "productImport=导入商品（改字段/SEO/合集/成本等）",
  "bulkPriceEdit=批量调价",
  "bulkTagEdit=批量打标",
  "bulkStatusEdit=批量上下架",
].join("；");

const suggestNextActionsSchema = z.object({
  keys: z
    .array(z.enum(WORKSPACE_ACTION_KEYS))
    .min(1)
    .max(4)
    .describe(`按推荐顺序给 1–4 个方向。可选值：${ACTION_KEY_GUIDE}`),
});

export const suggestNextActionsTool = new DynamicStructuredTool({
  name: SUGGEST_NEXT_ACTIONS_TOOL_NAME,
  description:
    "当你这一轮不打开任何确认卡、并且建议商户从几个方向里挑一个继续时调用，传你在回复里推荐的那几个方向。系统会把它们渲染成回复下方的可点按钮。只传与本轮建议直接相关的，不要凑数；已经开卡、用户意图唯一明确、或与店铺经营无关时都不要调用。",
  schema: suggestNextActionsSchema,
  func: async ({ keys }) => JSON.stringify({ ok: true, keys }),
});

function payloadFromArgs(args: unknown): WorkspaceActionsPayload | undefined {
  const keys = (args as { keys?: unknown } | null | undefined)?.keys;
  return parseWorkspaceActionsPayload({ keys }) ?? undefined;
}

/** 从本轮消息里取模型选的方向（取最近一次调用）。 */
export function resolveSuggestedActionsPayload(
  messages: BaseMessage[],
): WorkspaceActionsPayload | undefined {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (ToolMessage.isInstance(msg) && msg.name === SUGGEST_NEXT_ACTIONS_TOOL_NAME) {
      try {
        const parsed = JSON.parse(String(msg.content ?? "")) as unknown;
        const payload = payloadFromArgs(parsed);
        if (payload) return payload;
      } catch {
        /* 落到下面按 tool_calls 取参数 */
      }
    }
    if (AIMessage.isInstance(msg) && Array.isArray(msg.tool_calls)) {
      for (const call of msg.tool_calls) {
        if (call.name !== SUGGEST_NEXT_ACTIONS_TOOL_NAME) continue;
        const payload = payloadFromArgs(call.args);
        if (payload) return payload;
      }
    }
  }
  return undefined;
}

export const suggestedActionsSkillDefinition: ToolDefinition = {
  name: "suggestedActions",
  displayName: "推荐后续方向",
  category: "系统",
  stage: "monitor",
  visibility: "internal",
  description:
    "不开卡时由模型选出 1–4 个相关方向，渲染成回复下方的可点按钮；不是对外能力，不要写进功能清单。",
  uiPayloadKey: "workspaceActions",
  createTool: () => [suggestNextActionsTool],
  extractUIPayload: (messages) => resolveSuggestedActionsPayload(messages),
};
