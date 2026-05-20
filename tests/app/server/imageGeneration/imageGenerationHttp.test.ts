import { describe, expect, it } from "vitest";
import { parseImageGenerationBody } from "../../../../app/server/imageGeneration/imageGenerationHttp.server";

describe("parseImageGenerationBody", () => {
  it("accepts description only", () => {
    const result = parseImageGenerationBody({ description: "夏季跑步鞋主图" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.description).toBe("夏季跑步鞋主图");
      expect(result.data.prompt).toBeUndefined();
    }
  });

  it("accepts prompt only", () => {
    const result = parseImageGenerationBody({ prompt: "product hero shot on grass" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.prompt).toBe("product hero shot on grass");
    }
  });

  it("accepts both description and prompt", () => {
    const result = parseImageGenerationBody({
      description: "夏季跑步鞋",
      prompt: "summer running shoes hero",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects empty body", () => {
    const result = parseImageGenerationBody({});
    expect(result.ok).toBe(false);
  });
});
