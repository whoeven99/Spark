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
import {
  SCORE_PRODUCT_QUALITY_TOOL_NAME,
  createScoreProductQualityTool,
  scoreProductQualityToolDefinition,
} from "./scoreProduct";
import {
  OPEN_PRODUCT_QUALITY_FORM_TOOL_NAME,
  productQualityFormTool,
} from "./productQuality.form.tool";
import { coerceProductQualityFormPayload } from "../../../../lib/productQualityFormPayload";
import { resolveProductQualityCardPayload } from "./productQuality.extract";

/**
 * 1 级对外能力：商品优化。
 * 实际工具仍由下方 internal 子 Skill 提供；本条目只负责商户介绍与意图分流总述。
 */
const productOptimizationPublicSkill: ToolDefinition = {
  name: "productOptimization",
  displayName: "商品优化",
  category: "商品优化",
  stage: "propose",
  visibility: "public",
  description:
    "含三个子能力：AI 生成/优化商品文案；商品页质量评分（诊断）；商品图片翻译",
  systemPromptExtension: [
    "【商品优化】对外介绍时作为一项一级能力，下含三个子能力；按用户意图选工具，不要一次全调：",
    "1) AI 生成/优化商品文案 → open_product_improve_form（多商品时 open_batch_tasks_form）；已明确商品且要求立即生成可用 generate_product_description。",
    "2) 商品页质量评分（诊断）→ open_product_quality_form；已明确商品且要求立刻出分可用 score_product_quality。",
    "3) 商品图片翻译 → open_picture_translate_form；已有可访问图片 URL 与目标语言且要求立即翻译可用 picture_translate。",
    "图片生成（文生图）是独立一级能力，不要算进本能力、不要与图片翻译混淆。",
  ].join("\n"),
  createTool: () => [],
};

const productImproveSkillDef: ToolDefinition = {
  name: "productImprove",
  displayName: "AI 生成/优化商品文案",
  category: "商品优化",
  stage: "propose",
  visibility: "internal",
  description: "在聊天内打开商品描述卡片，或由 AI 直接生成标题与描述",
  uiPayloadKey: "productImproveCardPayload",
  systemPromptExtension:
    "当用户要生成、撰写或优化商品标题、描述或营销文案时，优先调用 open_product_improve_form 打开可编辑卡片，并从对话中尽量预填 productId、targetLanguage；调用后说明用户可在卡片内选商品、确认语言并点击生成，生成结果含标题与描述，需审核后才写回。禁止在未成功调用 open_product_improve_form 时声称「已打开卡片」。若用户已明确提供商品 ID 且要求立即生成（不需卡片确认），可调用 generate_product_description；成功时用简洁中文概括要点，不要编造工具未返回的内容。\n【重要】若上下文中已有「已选商品（共 N 个）」且 N ≥ 2，说明用户已预选了多个商品，此时【禁止】调用 open_product_improve_form（单商品工具）；应改用 open_batch_tasks_form 批量处理。\n【严禁混淆】本工具及 generate_product_description 只用于「商品描述/文案」，绝不用于「翻译图片中的文字」。用户要翻译商品图片时，改用 open_picture_translate_form（单图）或 open_batch_tasks_form 且 taskType=picture_translate。",
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

const productQualityScoreSkillDef: ToolDefinition = {
  ...scoreProductQualityToolDefinition,
  displayName: "商品页质量评分（诊断）",
  visibility: "internal",
  uiPayloadKey: "productQualityCard",
  systemPromptExtension:
    "当用户想评估、诊断或了解某个商品的页面质量，或要求对商品页内容进行评分时，优先调用 open_product_quality_form 打开可交互卡片，并从对话尽量预填 productId。调用后说明用户可在卡片内选择商品并点击开始评分；评分结果在同一张卡片展示，含各维度分数与本次积分消耗。禁止在未成功调用 open_product_quality_form 时声称「已打开卡片」。若用户已明确提供商品 ID 且要求立刻出分（不需卡片确认），可调用 score_product_quality；成功时用简洁中文概括低分项与改进优先级，不要编造工具未返回的内容。本能力不写回 Shopify、不创建异步任务。",
  createTool: (context) => [productQualityFormTool, createScoreProductQualityTool(context)],
  onStreamEvent: (ev, enqueue, streamContext) => {
    if (ev.event === "on_tool_start" && ev.name === OPEN_PRODUCT_QUALITY_FORM_TOOL_NAME) {
      streamContext.emittedFlags.add("productQualityForm");
      enqueue({
        type: "tool_call",
        name: ev.name,
        args: coerceProductQualityFormPayload(ev.input),
      });
    }

    if (ev.event === "on_tool_end" && ev.name === SCORE_PRODUCT_QUALITY_TOOL_NAME) {
      streamContext.emittedFlags.add("scoreProductQuality");

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
  extractUIPayload: (messages) => resolveProductQualityCardPayload(messages),
};

/**
 * 商品优化相关 Skill 注册清单。
 * - public：商品优化（一级对外）、图片生成（独立一级）
 * - internal：文案 / 质量评分 / 图片翻译（及对应卡片）、文生图卡片
 */
export const productOptimizationSkills: ToolDefinition[] = [
  productOptimizationPublicSkill,
  productImproveSkillDef,
  productQualityScoreSkillDef,
  {
    ...pictureTranslateFormToolDefinition,
    displayName: "商品图片翻译卡片",
    visibility: "internal",
  },
  {
    ...pictureTranslateToolDefinition,
    displayName: "商品图片翻译",
    visibility: "internal",
  },
  {
    ...imageGenerationFormToolDefinition,
    category: "图片生成",
    visibility: "internal",
  },
  {
    ...imageGenerationToolDefinition,
    displayName: "图片生成",
    category: "图片生成",
    description: "根据提示词生成商品/营销图片（独立一级能力，不含图片文字翻译）",
    visibility: "public",
  },
];
