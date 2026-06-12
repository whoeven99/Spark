import type { ToolDefinition } from "../../core/toolRegistry.server";
import { coercePictureTranslateFormPayload } from "../../../../lib/pictureTranslateFormPayload";
import {
  OPEN_PICTURE_TRANSLATE_FORM_TOOL_NAME,
  pictureTranslateFormTool,
} from "./pictureTranslate.form.tool";
import { resolvePictureTranslateCardPayload } from "./pictureTranslate.extract";

export const pictureTranslateFormToolDefinition: ToolDefinition = {
  name: "pictureTranslateForm",
  displayName: "整图翻译卡片",
  category: "商品优化",
  stage: "propose",
  description: "在聊天内打开整图翻译配置卡片，供用户选图并确认语言后提交",
  uiPayloadKey: "pictureTranslateCard",
  systemPromptExtension:
    "当用户要翻译图片、商品图、截图中的文字时，必须调用 open_picture_translate_form 打开可编辑卡片，并从对话尽量预填 imageUrl、sourceLanguage、targetLanguage。调用后说明用户可在卡片内完成配置并提交。禁止在未成功调用 open_picture_translate_form 时声称「已打开卡片」或仅用文字描述表单；必须先发起工具调用。若用户已提供可访问的 HTTPS 图片 URL 与目标语言且要求立即翻译，可调用 picture_translate 直接执行。",
  createTool: () => pictureTranslateFormTool,
  onStreamEvent: (ev, enqueue, streamContext) => {
    if (
      ev.event === "on_tool_start" &&
      ev.name === OPEN_PICTURE_TRANSLATE_FORM_TOOL_NAME
    ) {
      streamContext.emittedFlags.add("pictureTranslateForm");
      enqueue({
        type: "tool_call",
        name: ev.name,
        args: coercePictureTranslateFormPayload(ev.input),
      });
    }
  },
  extractUIPayload: (messages) => resolvePictureTranslateCardPayload(messages),
};
