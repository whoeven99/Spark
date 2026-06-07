import type { ToolDefinition } from "../../core/toolRegistry.server";
import { createGenerateProductDescriptionTool, GENERATE_PRODUCT_DESCRIPTION_TOOL_NAME } from "../marketing/marketing.tool";
import {
  extractProductImproveCardPayload,
  hasProductImproveToolCall,
  shouldInjectProductImproveFallback,
} from "../marketing/marketing.extract";
import { pictureTranslateToolDefinition } from "../pictureTranslate/pictureTranslate.tool";
import { imageGenerationToolDefinition } from "../imageGeneration/imageGeneration.tool";
import { scoreProductQualityToolDefinition } from "./scoreProduct";

const generateProductDescriptionToolDef: ToolDefinition = {
  name: "generateProductDescription",
  displayName: "生成商品描述",
  category: "商品优化",
  stage: "propose",
  description: "输入商品 ID，AI 生成高质量商品标题与描述，可结合用户画像个性化",
  uiPayloadKey: "productImproveCardPayload",
  systemPromptExtension:
    "当用户明确要求根据商品 ID 生成、撰写或优化商品营销描述时，应调用工具 generate_product_description，传入 productId（及可选 targetLanguage）。工具返回 JSON 字符串：成功时含 description 字段，请用简洁中文向用户概括要点并引用描述中的关键信息，不要编造工具未返回的内容。若用户未提供商品 ID，先请对方提供，不要猜测 ID。",
  createTool: (context) => createGenerateProductDescriptionTool(context),
  onStreamEvent: (ev, enqueue, streamContext) => {
    if (ev.event === "on_tool_end" && ev.name === GENERATE_PRODUCT_DESCRIPTION_TOOL_NAME) {
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
};

/**
 * 商品优化 Skill 组，包含：商品文案生成、图片翻译、图片生成、商品质量评分。
 * 在 skills/index.ts 中统一注册。
 */
export const productOptimizationSkills: ToolDefinition[] = [
  generateProductDescriptionToolDef,
  pictureTranslateToolDefinition,
  imageGenerationToolDefinition,
  scoreProductQualityToolDefinition,
];
