import type { ToolDefinition } from "../../core/toolRegistry.server";
import { coerceImageGenerationFormPayload } from "../../../../lib/imageGenerationFormPayload";
import {
  OPEN_IMAGE_GENERATION_FORM_TOOL_NAME,
  imageGenerationFormTool,
} from "./imageGeneration.form.tool";
import { resolveImageGenerationCardPayload } from "./imageGeneration.extract";

export const imageGenerationFormToolDefinition: ToolDefinition = {
  name: "imageGenerationForm",
  displayName: "文生图卡片",
  category: "商品优化",
  stage: "propose",
  description: "在聊天内打开文生图配置卡片，供用户确认画面描述后提交",
  uiPayloadKey: "imageGenerationCard",
  systemPromptExtension:
    "当用户要生成、绘制、创作商品图、营销图、场景图、海报或 AI 配图（且不是翻译已有图片文字）时，必须调用 open_image_generation_form 打开可编辑卡片，并从对话尽量预填 description（画面描述）。调用后说明用户可在卡片内确认描述并点击生成。禁止在未成功调用 open_image_generation_form 时声称「已打开卡片」或仅用文字描述表单；必须先发起工具调用。若用户已给出完整画面描述且要求立即生成，可调用 generate_product_image 直接执行；成功后不要输出 Markdown 图片链接，图片由前端展示。",
  createTool: () => imageGenerationFormTool,
  onStreamEvent: (ev, enqueue, streamContext) => {
    if (
      ev.event === "on_tool_start" &&
      ev.name === OPEN_IMAGE_GENERATION_FORM_TOOL_NAME
    ) {
      streamContext.emittedFlags.add("imageGenerationForm");
      enqueue({
        type: "tool_call",
        name: ev.name,
        args: coerceImageGenerationFormPayload(ev.input),
      });
    }
  },
  extractUIPayload: (messages) => resolveImageGenerationCardPayload(messages),
};
