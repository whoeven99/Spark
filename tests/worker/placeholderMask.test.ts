import { describe, expect, it } from "vitest";
import {
  maskPlaceholders,
  protectedLiteralsPreserved,
  restoreMaskedPlaceholders,
} from "../../worker/src/services/placeholderMask.js";

describe("placeholderMask", () => {
  it("masks and restores root-relative paths", () => {
    const src = "如 /blogs/news/my-first-article，方便浏览。";
    const { masked, tokens } = maskPlaceholders(src);
    expect(masked).toContain("⟦0⟧");
    expect(tokens[0]).toBe("/blogs/news/my-first-article");
    const restored = restoreMaskedPlaceholders(`مثل ⟦0⟧، للتصفح.`, tokens);
    expect(restored).toContain("/blogs/news/my-first-article");
  });

  it("does not inject path token when LLM hallucinates unrelated S3", () => {
    const tokens = ["a", "b", "c", "/cdn/image.png"];
    const out = restoreMaskedPlaceholders("Some Arabic S3 text", tokens);
    expect(out).toBe("Some Arabic S3 text");
    expect(out).not.toContain("/cdn/image.png");
  });

  it("does not treat light/dark as a site path", () => {
    const { masked, tokens } = maskPlaceholders("Custom colours for light/dark pieces");
    expect(tokens).toHaveLength(0);
    expect(masked).toContain("light/dark");
  });

  it("protectedLiteralsPreserved fails when path missing", () => {
    const { tokens } = maskPlaceholders("visit /blogs/news/foo today");
    expect(protectedLiteralsPreserved(tokens, "visit today")).toBe(false);
    expect(protectedLiteralsPreserved(tokens, "visit /blogs/news/foo today")).toBe(true);
  });
});
