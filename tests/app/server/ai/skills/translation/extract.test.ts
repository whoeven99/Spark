import { ToolMessage } from "@langchain/core/messages";
import { describe, expect, it } from "vitest";
import {
  TRANSLATION_FORM_PAYLOAD_KIND,
  coerceTranslationTaskFormPayload,
  getTargetLocalesFromPayload,
} from "../../../../../../app/lib/translationTaskFormPayload";
import {
  extractTranslationTaskFormFromMessages,
  shouldInjectTranslationTaskFormFallback,
} from "../../../../../../app/server/ai/skills/translation/extract";

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

describe("coerceTranslationTaskFormPayload targetLocales", () => {
  it("prefers targetLocales array over single targetLocale", () => {
    const p = coerceTranslationTaskFormPayload({
      targetLocale: "en",
      targetLocales: ["fr", "ja"],
    });
    expect(getTargetLocalesFromPayload(p)).toEqual(["fr", "ja"]);
    expect(p.targetLocale).toBe("fr");
  });

  it("falls back to single targetLocale", () => {
    const p = coerceTranslationTaskFormPayload({ targetLocale: "de" });
    expect(getTargetLocalesFromPayload(p)).toEqual(["de"]);
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

  it("returns true when user asks for translation card explicitly", () => {
    expect(
      shouldInjectTranslationTaskFormFallback(
        "翻译卡片",
        "好的，请提供以下信息来创建翻译任务：",
      ),
    ).toBe(true);
  });

  it("returns false when assistant does not mention card-like UI", () => {
    expect(
      shouldInjectTranslationTaskFormFallback("翻译任务", "翻译一般是指把内容从一种语言转成另一种语言。"),
    ).toBe(false);
  });
});
