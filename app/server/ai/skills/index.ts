import { createShopifyShopInfoTools } from "./shopifyInfo/tool";
import { translationTaskFormTool } from "./translation/tool";
import { globalToolRegistry } from "../core/toolRegistry.server";
import {
  extractTranslationTaskFormFromMessages,
  shouldInjectTranslationTaskFormFallback,
  defaultTranslationTaskFormPayload,
} from "./translation/extract";
import { coerceTranslationTaskFormPayload } from "../../../lib/translationTaskFormPayload";
import { sendTemplateEmailToolDefinition } from "./email/tool";
import { productOptimizationSkills } from "./productOptimization";

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

// 商品优化 Skill 组：文案生成、图片翻译、图片生成、质量评分
for (const skill of productOptimizationSkills) {
  globalToolRegistry.register(skill);
}

globalToolRegistry.register(sendTemplateEmailToolDefinition);
