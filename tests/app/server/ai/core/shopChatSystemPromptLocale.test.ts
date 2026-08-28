import { describe, expect, it } from "vitest";
import {
  buildFallbackAssistantSystemPrompt,
  buildShopChatAgentSystemPrompt,
} from "../../../../../app/server/ai/core/shopAssistantPrompt";

describe("buildShopChatAgentSystemPrompt", () => {
  it("instructs the model to match the user's language, regardless of UI locale", () => {
    const zh = buildShopChatAgentSystemPrompt("zh-CN");
    const en = buildShopChatAgentSystemPrompt("en");
    expect(zh).toContain("与用户提问相同的语言");
    expect(en).toContain("与用户提问相同的语言");
    expect(zh).not.toContain("Always reply in English");
    expect(en).not.toContain("Always reply in English");
    expect(zh).not.toContain("请始终使用简体中文回复");
  });
});

describe("buildFallbackAssistantSystemPrompt", () => {
  it("also matches the user's language instead of forcing UI locale", () => {
    expect(buildFallbackAssistantSystemPrompt("en")).toContain(
      "与用户提问相同的语言",
    );
    expect(buildFallbackAssistantSystemPrompt("en")).not.toContain(
      "Always reply in English",
    );
  });
});
