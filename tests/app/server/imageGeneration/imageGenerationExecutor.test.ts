import { describe, expect, it } from "vitest";
import {
  normalizeImageGenerationPrompt,
  validateImageGenerationPrompt,
} from "../../../../app/server/imageGeneration/imageGenerationExecutor.server";

describe("imageGenerationExecutor", () => {
  it("normalizes whitespace in prompt", () => {
    expect(normalizeImageGenerationPrompt("  hello   world  ")).toBe("hello world");
  });

  it("rejects too short prompt", () => {
    expect(validateImageGenerationPrompt("ab")).toMatch(/至少/);
  });

  it("accepts valid prompt", () => {
    expect(validateImageGenerationPrompt("白色背景上的运动鞋")).toBeNull();
  });
});
