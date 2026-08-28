import { describe, expect, it } from "vitest";
import {
  buildImagePromptUserMessage,
  normalizeImageDescription,
  validateImageDescription,
} from "../../../../app/server/imageGeneration/generateImagePromptFromDescription.server";

describe("generateImagePromptFromDescription", () => {
  it("normalizes description whitespace", () => {
    expect(normalizeImageDescription("  summer   shoes  ")).toBe("summer shoes");
  });

  it("rejects too short description", () => {
    expect(validateImageDescription("ab")).toMatch(/至少/);
  });

  it("accepts valid description", () => {
    expect(validateImageDescription("白色背景运动鞋主图")).toBeNull();
  });

  it("builds user message without product context", () => {
    expect(buildImagePromptUserMessage({ description: "白底主图" })).toBe(
      "商户画面描述：\n白底主图",
    );
  });

  it("appends product title and description when provided", () => {
    const message = buildImagePromptUserMessage({
      description: "白底主图",
      product: { title: "陶瓷马克杯", text: "哑光白釉，300ml" },
    });
    expect(message).toContain("商户画面描述：\n白底主图");
    expect(message).toContain("参考商品标题：陶瓷马克杯");
    expect(message).toContain("哑光白釉，300ml");
  });
});
