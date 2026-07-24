import { DynamicStructuredTool } from "@langchain/core/tools";
import type { AgentContext, ToolDefinition } from "../../core/toolRegistry.server";
import {
  PICTURE_TRANSLATE_TOOL_NAME,
  PICTURE_TRANSLATE_TOOL_LOG_PREFIX,
} from "./pictureTranslate.constants";
import { pictureTranslateToolSchema, resolvePictureTranslateInput } from "./pictureTranslate.schema";
import { safeExecutePictureTranslateTool } from "./pictureTranslate.service";
import { extractChatImageAttachmentsFromMessages } from "../shared/imageAttachmentsExtract";

function safeUrlHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "invalid-url";
  }
}

export function createPictureTranslateTool(context: AgentContext): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: PICTURE_TRANSLATE_TOOL_NAME,
    description:
      "Translate text inside images while preserving image layout. Use this tool when the user asks to translate text in images, screenshots, product images, OCR plus translation, or preserving the original image layout. Do not use this tool for normal text translation, PDF translation, or plain text processing.",
    schema: pictureTranslateToolSchema,
    func: async (input) => {
      const requestId = crypto.randomUUID();
      const resolvedInput = resolvePictureTranslateInput(input);
      const shop = context.shop?.trim() || "unknown-shop";
      const result = await safeExecutePictureTranslateTool({
        requestId,
        shop,
        input: resolvedInput,
      });
      console.info(
        `${PICTURE_TRANSLATE_TOOL_LOG_PREFIX} done requestId=${requestId} toolName=${PICTURE_TRANSLATE_TOOL_NAME} success=${String(
          result.success,
        )}${result.success ? ` translatedImageHost=${safeUrlHost(result.translatedImage)}` : ` error=${result.error}`}`,
      );
      return JSON.stringify(result);
    },
  });
}

export const pictureTranslateToolDefinition: ToolDefinition = {
  name: "pictureTranslate",
  displayName: "整图翻译",
  category: "商品优化",
  stage: "execute",
  description: "识别图片中的文字并翻译，返回翻译后图片，保持原图布局",
  uiPayloadKey: "attachments",
  systemPromptExtension:
    "当用户已提供可访问的 HTTPS 图片 URL 或图片 base64，且目标语言明确、要求立即翻译时，调用 picture_translate。若用户尚未选图或需在卡片里确认语言，应调用 open_picture_translate_form 而非本工具。不要用于普通文本翻译、PDF 或纯文本。成功后不要输出 Markdown 图片链接，译图由前端直接渲染；只需简洁说明翻译已完成。",
  createTool: (context) => createPictureTranslateTool(context),
  extractUIPayload: (messages) =>
    extractChatImageAttachmentsFromMessages(messages),
};
