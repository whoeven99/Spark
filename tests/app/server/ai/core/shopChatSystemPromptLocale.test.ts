import { describe, expect, it } from "vitest";
import { buildShopChatAgentSystemPrompt } from "../../../../../app/server/ai/core/shopAssistantPrompt";

describe("buildShopChatAgentSystemPrompt", () => {
  it("requires Simplified Chinese replies for zh-CN", () => {
    expect(buildShopChatAgentSystemPrompt("zh-CN")).toContain("简体中文");
  });

  it("requires English replies for en", () => {
    expect(buildShopChatAgentSystemPrompt("en")).toContain("Always reply in English");
  });
});
