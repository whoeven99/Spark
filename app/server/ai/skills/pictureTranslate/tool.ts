import { DynamicStructuredTool } from "@langchain/core/tools";
import type { AgentContext, ToolDefinition } from "../../core/toolRegistry.server";
import {
  PICTURE_TRANSLATE_TOOL_NAME,
  PICTURE_TRANSLATE_TOOL_LOG_PREFIX,
} from "./constants";
import { pictureTranslateToolSchema, resolvePictureTranslateInput } from "./schema";
import { safeExecutePictureTranslateTool } from "./service";
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
  description: "翻译图片中的文本并保持布局",
  uiPayloadKey: "attachments",
  systemPromptExtension:
    "当用户明确要求翻译图片、截图、商品图中的文字，或要求保持原图排版进行 OCR+翻译时，优先调用工具 picture_translate。不要把它用于普通文本翻译、PDF 翻译或纯文本处理。若用户未提供图片 URL 或图片 base64，先请其提供后再调用工具。工具成功后，请不要输出“点击查看翻译后的图片”之类的 Markdown 链接，译图会由前端在聊天消息内直接渲染；只需简洁说明图片翻译已完成，并说明图片文字已转换为目标语言且保持原有布局。",
  createTool: (context) => createPictureTranslateTool(context),
  extractUIPayload: (messages) =>
    extractChatImageAttachmentsFromMessages(messages),
};
