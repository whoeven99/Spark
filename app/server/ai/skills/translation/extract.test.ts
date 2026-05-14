import { ToolMessage } from "@langchain/core/messages";
import { describe, expect, it } from "vitest";
import { TRANSLATION_FORM_PAYLOAD_KIND } from "../../../../lib/translationTaskFormPayload";
import {
  extractTranslationTaskFormFromMessages,
  shouldInjectTranslationTaskFormFallback,
} from "./extract";

describe("extractTranslationTaskFormFromMessages", () => {
  it("parses ToolMessage with string JSON content", () => {
    const payload = {
      _sparkKind: TRANSLATION_FORM_PAYLOAD_KIND,
      sourceLocale: "zh-CN",
      targetLocale: "en",
      limitPerType: 10,
      resourceTypes: ["PRODUCT"],
    };
    const messages = [
      new ToolMessage({
        content: JSON.stringify(payload),
        tool_call_id: "call_1",
        name: "open_translation_task_form",
      }),
    ];
    const r = extractTranslationTaskFormFromMessages(messages);
    expect(r?.targetLocale).toBe("en");
    expect(r?.limitPerType).toBe(10);
    expect(r?.resourceTypes).toEqual(["PRODUCT"]);
  });

  it("parses ToolMessage with array text blocks (LangChain multimodal content)", () => {
    const payload = {
      _sparkKind: TRANSLATION_FORM_PAYLOAD_KIND,
      sourceLocale: "zh-CN",
      targetLocale: "",
      limitPerType: 20,
      resourceTypes: ["PRODUCT", "COLLECTION"],
    };
    const json = JSON.stringify(payload);
    const messages = [
      new ToolMessage({
        content: [{ type: "text", text: json }],
        tool_call_id: "call_2",
        name: "open_translation_task_form",
      }),
    ];
    const r = extractTranslationTaskFormFromMessages(messages);
    expect(r?.sourceLocale).toBe("zh-CN");
    expect(r?.resourceTypes).toEqual(["PRODUCT", "COLLECTION"]);
  });
});

describe("shouldInjectTranslationTaskFormFallback", () => {
  it("returns true when user and assistant both signal card flow", () => {
    expect(
      shouldInjectTranslationTaskFormFallback("翻译任务", "好的，已为你打开翻译任务创建卡片。"),
    ).toBe(true);
    expect(
      shouldInjectTranslationTaskFormFallback("打开卡片", "翻译任务卡片已经为你打开了"),
    ).toBe(true);
  });

  it("returns false when assistant does not mention card-like UI", () => {
    expect(
      shouldInjectTranslationTaskFormFallback("翻译任务", "翻译一般是指把内容从一种语言转成另一种语言。"),
    ).toBe(false);
  });
});
