import { describe, expect, it } from "vitest";
import {
  buildImageGenerationJobMetadata,
  parseImageGenerationJobMetadata,
} from "../../../../app/server/imageGeneration/imageGenerationJobMetadata.server";

describe("imageGenerationJobMetadata", () => {
  it("round-trips description and prompt", () => {
    const raw = buildImageGenerationJobMetadata({
      description: "  夏季跑步鞋  ",
      prompt: "  hero shot  ",
    });
    const parsed = parseImageGenerationJobMetadata(raw);
    expect(parsed).toEqual({
      description: "夏季跑步鞋",
      prompt: "hero shot",
    });
  });

  it("returns null for invalid metadata", () => {
    expect(parseImageGenerationJobMetadata(null)).toBeNull();
    expect(parseImageGenerationJobMetadata({ foo: 1 })).toBeNull();
  });
});
