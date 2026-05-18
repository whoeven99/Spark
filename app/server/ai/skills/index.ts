import type { DynamicStructuredTool } from "@langchain/core/tools";
import { createShopifyShopInfoTools } from "./shopifyInfo/tool";
import { createGenerateProductDescriptionTool } from "./marketing/tool";
import { translationTaskFormTool } from "./translation/tool";
import { globalToolRegistry, type AgentContext } from "../core/toolRegistry.server";

import {
  extractTranslationTaskFormFromMessages,
  shouldInjectTranslationTaskFormFallback,
  defaultTranslationTaskFormPayload,
} from "./translation/extract";
import { coerceTranslationTaskFormPayload } from "../../../lib/translationTaskFormPayload";
import { pictureTranslateToolDefinition } from "./pictureTranslate/tool";

// ==========================================
// 注册各类核心与扩展 Tools 到全局注册表
// ==========================================

globalToolRegistry.register({
  name: "shopifyShopInfo",
  description: "获取 Shopify 商店的基础信息",
  createTool: ({ admin }) => createShopifyShopInfoTools(admin),
});

globalToolRegistry.register({
  name: "translationTaskForm",
  description: "打开翻译任务表单卡片",
  uiPayloadKey: "translationTaskForm",
  systemPromptExtension: "当用户想要创建「翻译任务」「批量翻译商品/页面」或填写目标语言做本地化时，必须调用工具 open_translation_task_form，并从对话中提取尽量准确的 sourceLocale、targetLocale、limitPerType、resourceTypes；不确定的字段可留空让用户在卡片里补全。调用该工具后仍需用一两句话说明接下来可在卡片中确认并提交。禁止在未成功调用 open_translation_task_form 时声称「已为你打开卡片」或「卡片已打开」；若尚未调用该工具，必须先发起工具调用，不要仅用文字描述表单内容来代替卡片。",
  createTool: () => translationTaskFormTool,
  onStreamEvent: (ev, enqueue, streamContext) => {
    if (ev.event === "on_tool_start" && ev.name === "open_translation_task_form") {
      streamContext.emittedFlags.add("translationTaskForm");
      enqueue({
        type: "tool_call",
        name: ev.name,
        args: coerceTranslationTaskFormPayload(ev.input),
      });
    }
  },
  extractUIPayload: (messages, lastUserText, assistantReplyRaw) => {
    const fromTool = extractTranslationTaskFormFromMessages(messages);
    if (fromTool) return fromTool;
    if (shouldInjectTranslationTaskFormFallback(lastUserText, assistantReplyRaw)) {
      return defaultTranslationTaskFormPayload();
    }
    return undefined;
  },
});

import { ToolMessage } from "@langchain/core/messages";
import { extractMessageText } from "../utils/langchainMessageText";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractGenerateDescriptionCardPayload(messages: any[]): any {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (!ToolMessage.isInstance(msg)) continue;
    if (msg.name !== "generate_product_description") continue;

    const raw = extractMessageText(msg).trim();
    if (!raw.startsWith("{")) continue;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object") continue;
    if (parsed.ok !== true) continue;

    const title = typeof parsed.title === "string" ? parsed.title.trim() : "";
    const description = typeof parsed.description === "string" ? parsed.description : "";
    if (!title || !description) continue;

    const productId = typeof parsed.productId === "string" ? parsed.productId.trim() : "";
    const targetLanguage = typeof parsed.targetLanguage === "string" ? parsed.targetLanguage.trim() : undefined;

    return {
      productId,
      title,
      description,
      ...(targetLanguage ? { targetLanguage } : {}),
    };
  }
  return undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function hasGenerateDescriptionToolCall(messages: any[]): boolean {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (ToolMessage.isInstance(msg) && msg.name === "generate_product_description") {
      return true;
    }
  }
  return false;
}

function shouldInjectGenerateDescriptionCardFallback(lastUserText: string, assistantReplyText: string): boolean {
  const u = lastUserText.trim();
  const a = assistantReplyText.trim();
  if (!u || !a) return false;
  const userSignals = /(商品描述|营销描述|文案|写描述|优化描述|product description)/i.test(u) && /(gid:\/\/shopify\/Product\/\d+|\b\d{6,}\b)/i.test(u);
  const assistantSignals = /(已生成|生成结果|核心要点|一句话概括|如需调整|商品描述)/i.test(a);
  return userSignals && assistantSignals;
}

globalToolRegistry.register({
  name: "generateProductDescription",
  description: "生成商品描述（可结合用户画像进行个性化建议）",
  uiPayloadKey: "generateDescriptionCardPayload",
  systemPromptExtension: "当用户明确要求根据商品 ID 生成、撰写或优化商品营销描述时，应调用工具 generate_product_description，传入 productId（及可选 targetLanguage）。工具返回 JSON 字符串：成功时含 description 字段，请用简洁中文向用户概括要点并引用描述中的关键信息，不要编造工具未返回的内容。若用户未提供商品 ID，先请对方提供，不要猜测 ID。",
  // 示例：可以根据 profile 决定是否提供特定功能
  // condition: ({ profile }) => profile?.plan !== 'free',
  createTool: ({ admin }) => createGenerateProductDescriptionTool(admin),
  onStreamEvent: (ev, enqueue, streamContext) => {
    if (ev.event === "on_tool_end" && ev.name === "generate_product_description") {
      streamContext.emittedFlags.add("generateProductDescription");
      
      let resultStr = String(ev.output);
      if (typeof ev.output === 'object') {
        try { resultStr = JSON.stringify(ev.output); } catch (e) {
          // ignore
        }
      }

      enqueue({
        type: "tool_result",
        name: ev.name,
        result: resultStr,
      });
    }
  },
  extractUIPayload: (messages, lastUserText, assistantReplyRaw) => {
    const payload = extractGenerateDescriptionCardPayload(messages);
    if (payload) return payload;
    
    const isFallbackCard = hasGenerateDescriptionToolCall(messages) || 
      shouldInjectGenerateDescriptionCardFallback(lastUserText, assistantReplyRaw);
      
    // 这里因为原来有两个标志，一个是 bool 的 generateDescriptionCard 
    // 我们暂时统一用 generateDescriptionCardPayload (如果没有 payload，但需要显示 card，可以返回 { _fallback: true })
    if (isFallbackCard) return { _fallback: true };
    return undefined;
  }
});

globalToolRegistry.register(pictureTranslateToolDefinition);

/**
 * 嵌入式聊天 Agent 的店铺相关工具集合（基于注册表动态组装）。
 * 后续可传入用户信息/画像（Profile）以便个性化返回 tools。
 */
export async function buildChatAgentExtraTools(
  context: AgentContext
): Promise<DynamicStructuredTool[]> {
  // 根据 AgentContext（如 admin，profile）从注册表获取所有可用的工具
  const tools = await globalToolRegistry.getToolsForContext(context);
  return tools;
}
