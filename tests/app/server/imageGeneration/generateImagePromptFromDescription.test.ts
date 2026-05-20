import { describe, expect, it } from "vitest";
import {
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
});
