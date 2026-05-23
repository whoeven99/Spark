import { ToolMessage } from "@langchain/core/messages";
import { createShopifyShopInfoTools } from "./shopifyInfo/tool";
import { createGenerateProductDescriptionTool } from "./marketing/tool";
import { translationTaskFormTool } from "./translation/tool";
import { globalToolRegistry } from "../core/toolRegistry.server";

import {
  extractTranslationTaskFormFromMessages,
  shouldInjectTranslationTaskFormFallback,
  defaultTranslationTaskFormPayload,
} from "./translation/extract";
import { coerceTranslationTaskFormPayload } from "../../../lib/translationTaskFormPayload";
import { pictureTranslateToolDefinition } from "./pictureTranslate/tool";
import { imageGenerationToolDefinition } from "./imageGeneration/tool";
import { sendTemplateEmailToolDefinition } from "./email/tool";
import {
  extractProductImproveCardPayload,
  hasProductImproveToolCall,
  shouldInjectProductImproveFallback,
} from "./marketing/extract";

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
  systemPromptExtension:
    "当用户想要创建「翻译任务」「批量翻译商品/页面」或填写目标语言做本地化时，必须调用工具 open_translation_task_form，并从对话中提取尽量准确的 sourceLocale、targetLocale、limitPerType、resourceTypes；不确定的字段可留空让用户在卡片里补全。调用该工具后仍需用一两句话说明接下来可在卡片中确认并提交。禁止在未成功调用 open_translation_task_form 时声称「已为你打开卡片」或「卡片已打开」；若尚未调用该工具，必须先发起工具调用，不要仅用文字描述表单内容来代替卡片。",
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

globalToolRegistry.register({
  name: "generateProductDescription",
  description: "生成商品描述（可结合用户画像进行个性化建议）",
  uiPayloadKey: "productImproveCardPayload",
  systemPromptExtension:
    "当用户明确要求根据商品 ID 生成、撰写或优化商品营销描述时，应调用工具 generate_product_description，传入 productId（及可选 targetLanguage）。工具返回 JSON 字符串：成功时含 description 字段，请用简洁中文向用户概括要点并引用描述中的关键信息，不要编造工具未返回的内容。若用户未提供商品 ID，先请对方提供，不要猜测 ID。",
  createTool: (context) => createGenerateProductDescriptionTool(context),
  onStreamEvent: (ev, enqueue, streamContext) => {
    if (ev.event === "on_tool_end" && ev.name === "generate_product_description") {
      streamContext.emittedFlags.add("generateProductDescription");

      let resultStr = String(ev.output);
      if (typeof ev.output === "object") {
        try {
          resultStr = JSON.stringify(ev.output);
        } catch {
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
    const payload = extractProductImproveCardPayload(messages);
    if (payload) return payload;

    const isFallbackCard =
      hasProductImproveToolCall(messages) ||
      shouldInjectProductImproveFallback(lastUserText, assistantReplyRaw);

    if (isFallbackCard) return { _fallback: true };
    return undefined;
  },
});

globalToolRegistry.register(pictureTranslateToolDefinition);

globalToolRegistry.register(imageGenerationToolDefinition);

globalToolRegistry.register(sendTemplateEmailToolDefinition);
