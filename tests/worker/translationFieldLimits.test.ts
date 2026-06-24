import { describe, expect, it } from "vitest";
import {
  clampTitleFieldValue,
  enforceFieldTranslationLimits,
  enforceTranslateResultLimits,
  SHOPIFY_TITLE_MAX_CHARS,
} from "../../worker/src/services/translationFieldLimits.js";

describe("translationFieldLimits", () => {
  it("does not change short title", () => {
    expect(enforceFieldTranslationLimits("title", "Short")).toBe("Short");
  });

  it("does not change non-title fields", () => {
    const long = "x".repeat(300);
    expect(enforceFieldTranslationLimits("body_html", long)).toBe(long);
  });

  it("clamps title to 255 chars", () => {
    const long = "a".repeat(300);
    const out = clampTitleFieldValue(long);
    expect(out.length).toBeLessThanOrEqual(SHOPIFY_TITLE_MAX_CHARS);
    expect(out.length).toBe(SHOPIFY_TITLE_MAX_CHARS);
  });

  it("prefers breaking at space near end", () => {
    const word = "palabra ";
    const long = word.repeat(40).trim();
    expect(long.length).toBeGreaterThan(SHOPIFY_TITLE_MAX_CHARS);
    const out = clampTitleFieldValue(long);
    expect(out.length).toBeLessThanOrEqual(SHOPIFY_TITLE_MAX_CHARS);
    expect(out.endsWith(" ")).toBe(false);
  });

  it("enforceTranslateResultLimits clamps title results", () => {
    const out = enforceTranslateResultLimits({
      key: "title",
      translatedValue: "b".repeat(280),
      digest: "d",
      status: "translated",
    });
    expect(out.translatedValue.length).toBeLessThanOrEqual(SHOPIFY_TITLE_MAX_CHARS);
    expect(out.status).toBe("translated");
  });
});
