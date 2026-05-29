import { describe, expect, it } from "vitest";
import {
  buildImageGenerationJobMetadata,
  parseImageGenerationJobMetadata,
} from "../../../../app/server/imageGeneration/imageGenerationJobMetadata.server";

describe("imageGenerationJobMetadata", () => {
  it("round-trips description", () => {
    const raw = buildImageGenerationJobMetadata({
      description: "  夏季跑步鞋  ",
    });
    const parsed = parseImageGenerationJobMetadata(raw);
    expect(parsed).toEqual({
      description: "夏季跑步鞋",
    });
  });

  it("ignores legacy prompt-only metadata", () => {
    expect(parseImageGenerationJobMetadata({ prompt: "hero shot" })).toBeNull();
  });

  it("returns null for invalid metadata", () => {
    expect(parseImageGenerationJobMetadata(null)).toBeNull();
    expect(parseImageGenerationJobMetadata({ foo: 1 })).toBeNull();
  });
});
