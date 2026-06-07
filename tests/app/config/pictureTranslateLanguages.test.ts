import { describe, it, expect } from "vitest";
import { selectModelTypeForLanguagePair } from "../../../app/config/pictureTranslateLanguages";

describe("selectModelTypeForLanguagePair", () => {
  it("returns 2 (volc) for auto source with volc-supported target", () => {
    expect(selectModelTypeForLanguagePair("auto", "zh")).toBe(2);
    expect(selectModelTypeForLanguagePair("auto", "en")).toBe(2);
    expect(selectModelTypeForLanguagePair("auto", "ja")).toBe(2);
  });

  it("returns 2 (volc) for volc language pairs", () => {
    expect(selectModelTypeForLanguagePair("en", "zh")).toBe(2);
    expect(selectModelTypeForLanguagePair("ja", "en")).toBe(2);
    expect(selectModelTypeForLanguagePair("zh", "ja")).toBe(2);
  });

  it("returns 1 (aidge) for aidge-only language pairs", () => {
    expect(selectModelTypeForLanguagePair("en", "ar")).toBe(1);
    expect(selectModelTypeForLanguagePair("zh", "kk")).toBe(1);
  });

  it("returns 2 as fallback for unsupported pairs", () => {
    expect(selectModelTypeForLanguagePair("xx", "yy")).toBe(2);
  });

  it("handles zh-tw normalization", () => {
    expect(selectModelTypeForLanguagePair("en", "zh-tw")).toBe(2);
    expect(selectModelTypeForLanguagePair("zh-tw", "en")).toBe(2);
  });

  it("handles empty source as auto", () => {
    expect(selectModelTypeForLanguagePair("", "zh")).toBe(2);
  });
});
