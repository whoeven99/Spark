import { DynamicStructuredTool } from "@langchain/core/tools";
import type { AgentContext, ToolDefinition } from "../../core/toolRegistry.server";
import type { StepSpec } from "../../core/skillTypes.server";
import { isImageGenerationConfigured } from "../../../imageGeneration/imageGenerationConfig.server";
import {
  GENERATE_PRODUCT_IMAGE_TOOL_NAME,
  IMAGE_GENERATION_TOOL_LOG_PREFIX,
} from "./imageGeneration.constants";
import { generateProductImageToolSchema } from "./imageGeneration.schema";
import { safeExecuteGenerateProductImageTool } from "./imageGeneration.service";
import { extractChatImageAttachmentsFromMessages } from "../shared/imageAttachmentsExtract";

const IMAGE_GENERATION_SKILL_NAME = "imageGeneration";

/**
 * 文生图原子 Skill 的内部流程（多阶段进度）。
 * 这是「原子 Skill 也能在聊天/Admin 展示流程」的样板。
 */
export const IMAGE_GENERATION_STEPS: readonly StepSpec[] = [
  {
    id: "preparePrompt",
    label: "准备提示词",
    kind: "compute",
    stage: "propose",
    runningLabel: "正在整理提示词",
  },
  {
    id: "callModel",
    label: "调用图像模型",
    kind: "tool",
    stage: "propose",
    runningLabel: "正在调用大模型生成图片",
  },
  {
    id: "returnImage",
    label: "回传图片",
    kind: "compute",
    stage: "propose",
    runningLabel: "正在回传生成结果",
  },
];

function isImageGenerationToolEnabled(): boolean {
  const raw = process.env.IMAGE_GENERATION_ENABLED?.trim().toLowerCase();
  if (raw === "false" || raw === "0") return false;
  return isImageGenerationConfigured();
}

export function createGenerateProductImageTool(
  context: AgentContext,
): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: GENERATE_PRODUCT_IMAGE_TOOL_NAME,
    description:
      "根据文字提示词生成商品或营销场景图片（文生图）。当用户要求生成、绘制、创作商品主图、场景图、海报、配图，且不是要翻译已有图片中的文字时使用。需要清晰的画面描述 prompt；不要用于图片翻译或 OCR。",
    schema: generateProductImageToolSchema,
    func: async ({ prompt }) => {
      const requestId = crypto.randomUUID();
      const shop = context.shop?.trim() || "unknown-shop";

      const emit = (
        step: StepSpec,
        status: "running" | "completed" | "error",
        detail?: string,
      ) =>
        context.emitProgress?.({
          skill: IMAGE_GENERATION_SKILL_NAME,
          stepId: step.id,
          label: status === "running" ? step.runningLabel ?? step.label : step.label,
          status,
          detail,
        });

      const [preparePrompt, callModel, returnImage] = IMAGE_GENERATION_STEPS;

      emit(preparePrompt, "running");
      emit(preparePrompt, "completed");

      emit(callModel, "running");
      const result = await safeExecuteGenerateProductImageTool({
        requestId,
        shop,
        prompt,
      });

      if (result.success) {
        emit(callModel, "completed");
        emit(returnImage, "running");
        emit(returnImage, "completed");
      } else {
        emit(callModel, "error", result.error);
      }

      console.info(
        `${IMAGE_GENERATION_TOOL_LOG_PREFIX} done requestId=${requestId} toolName=${GENERATE_PRODUCT_IMAGE_TOOL_NAME} success=${String(result.success)}`,
      );
      return JSON.stringify(result);
    },
  });
}

export const imageGenerationToolDefinition: ToolDefinition = {
  name: IMAGE_GENERATION_SKILL_NAME,
  displayName: "文生图",
  category: "商品优化",
  stage: "propose",
  steps: IMAGE_GENERATION_STEPS,
  description: "根据提示词生成商品/营销图片",
  uiPayloadKey: "attachments",
  systemPromptExtension:
    "当用户明确要求根据文字描述生成、绘制、创作商品图、营销图、场景图、海报或 AI 配图（且不是翻译已有图片文字）时，调用工具 generate_product_image，传入 prompt（画面描述）。成功后用简短中文说明已生成图片；不要输出 Markdown 图片链接，图片会由前端在聊天内直接展示。若用户未给出足够画面描述，先请其补充风格、主体与背景后再调用。不要与 picture_translate 混用。",
  condition: () => isImageGenerationToolEnabled(),
  createTool: (context) => createGenerateProductImageTool(context),
  extractUIPayload: (messages) =>
    extractChatImageAttachmentsFromMessages(messages),
};
