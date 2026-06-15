import { ToolMessage } from "@langchain/core/messages";
import { describe, expect, it } from "vitest";
import {
  TRANSLATION_FORM_PAYLOAD_KIND,
  coerceTranslationTaskFormPayload,
  getTargetLocalesFromPayload,
} from "../../../../../../app/lib/translationTaskFormPayload";
import { extractTranslationTaskFormFromMessages } from "../../../../../../app/server/ai/skills/translation/translation.extract";

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
