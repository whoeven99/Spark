import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import {
  IMAGE_GENERATION_FORM_PAYLOAD_KIND,
  coerceImageGenerationFormPayload,
  type ImageGenerationFormPayload,
} from "../../../../lib/imageGenerationFormPayload";

export const OPEN_IMAGE_GENERATION_FORM_TOOL_NAME = "open_image_generation_form";

/**
 * 当用户要文生图但未直接执行时调用：在聊天内展示可编辑卡片（不直接调用生成 API）。
 */
export const imageGenerationFormTool = new DynamicStructuredTool({
  name: OPEN_IMAGE_GENERATION_FORM_TOOL_NAME,
  description:
    "当用户明确表示要生成、绘制、创作商品图、营销图、场景图、海报或 AI 配图，且需要在卡片里确认画面描述后再生成时使用。根据对话尽量填入 description（画面描述）；不确定可留空由用户在卡片内补全。不要在用户仅闲聊或未提及文生图时调用。",
  schema: z.object({
    description: z
      .string()
      .optional()
      .describe("画面描述 prompt，例如风格、主体、背景、光线等"),
  }),
  func: async ({ description }) => {
    const payload: ImageGenerationFormPayload & {
      _sparkKind: typeof IMAGE_GENERATION_FORM_PAYLOAD_KIND;
    } = {
      _sparkKind: IMAGE_GENERATION_FORM_PAYLOAD_KIND,
      ...coerceImageGenerationFormPayload({
        description: description ?? "",
      }),
    };
    return JSON.stringify(payload);
  },
});
