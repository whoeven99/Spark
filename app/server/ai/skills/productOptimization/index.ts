import type { ToolDefinition } from "../../core/toolRegistry.server";
import { createGenerateProductDescriptionTool, GENERATE_PRODUCT_DESCRIPTION_TOOL_NAME } from "../marketing/marketing.tool";
import {
  OPEN_PRODUCT_IMPROVE_FORM_TOOL_NAME,
  productImproveFormTool,
} from "../marketing/marketing.form.tool";
import { coerceProductImproveFormPayload } from "../../../../lib/productImproveFormPayload";
import { resolveProductImproveCardPayload } from "../marketing/marketing.extract";
import { pictureTranslateToolDefinition } from "../pictureTranslate/pictureTranslate.tool";
import { pictureTranslateFormToolDefinition } from "../pictureTranslate/pictureTranslate.form.skill";
import { imageGenerationFormToolDefinition } from "../imageGeneration/imageGeneration.form.skill";
import { imageGenerationToolDefinition } from "../imageGeneration/imageGeneration.tool";
import { scoreProductQualityToolDefinition } from "./scoreProduct";

const productImproveSkillDef: ToolDefinition = {
  name: "productImprove",
  displayName: "商品描述",
  category: "商品优化",
  stage: "propose",
  description: "在聊天内打开商品描述卡片，或由 AI 直接生成标题与描述",
  uiPayloadKey: "productImproveCardPayload",
  systemPromptExtension:
    "当用户要生成、撰写或优化商品描述/营销文案时，优先调用 open_product_improve_form 打开可编辑卡片，并从对话中尽量预填 productId、targetLanguage；调用后说明用户可在卡片内选商品、确认语言并点击生成。禁止在未成功调用 open_product_improve_form 时声称「已打开卡片」。若用户已明确提供商品 ID 且要求立即生成（不需卡片确认），可调用 generate_product_description；成功时用简洁中文概括要点，不要编造工具未返回的内容。\n【重要】若上下文中已有「已选商品（共 N 个）」且 N ≥ 2，说明用户已预选了多个商品，此时【禁止】调用 open_product_improve_form（单商品工具）；应改用 open_batch_tasks_form 批量处理。",
  createTool: (context) => [
    productImproveFormTool,
    createGenerateProductDescriptionTool(context),
  ],
  onStreamEvent: (ev, enqueue, streamContext) => {
    if (
      ev.event === "on_tool_start" &&
      ev.name === OPEN_PRODUCT_IMPROVE_FORM_TOOL_NAME
    ) {
      streamContext.emittedFlags.add("productImproveForm");
      enqueue({
        type: "tool_call",
        name: ev.name,
        args: coerceProductImproveFormPayload(ev.input),
      });
    }

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
  extractUIPayload: (messages, lastUserText, assistantReplyRaw) =>
    resolveProductImproveCardPayload(messages),
};

/**
 * 商品优化 Skill 组，包含：商品文案生成、图片翻译、图片生成、商品质量评分。
 * 在 skills/index.ts 中统一注册。
 */
export const productOptimizationSkills: ToolDefinition[] = [
  productImproveSkillDef,
  pictureTranslateFormToolDefinition,
  pictureTranslateToolDefinition,
  imageGenerationFormToolDefinition,
  imageGenerationToolDefinition,
  scoreProductQualityToolDefinition,
];
