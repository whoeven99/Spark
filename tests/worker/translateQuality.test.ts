import { describe, expect, it } from "vitest";
import {
  glossaryTargetMatchesLocale,
  hasPromptSentinelLeakage,
  looksLikeEmptySourceHallucination,
  looksLikeWrongScriptLeak,
} from "../../worker/src/services/translateQuality.js";

describe("translateQuality", () => {
  it("detects prompt sentinel leakage", () => {
    expect(hasPromptSentinelLeakage("[number]3[number]")).toBe(true);
    expect(hasPromptSentinelLeakage("⟦3⟧")).toBe(false);
  });

  it("rejects empty-source hallucination", () => {
    expect(looksLikeEmptySourceHallucination("", "S3")).toBe(true);
    expect(looksLikeEmptySourceHallucination("", "")).toBe(false);
  });

  it("flags CJK leak into Arabic", () => {
    const src = "high-quality home textiles";
    expect(looksLikeWrongScriptLeak(src, "منسوجات 高质量", "ar")).toBe(true);
    expect(looksLikeWrongScriptLeak(src, "منسوجات منزلية", "ar")).toBe(false);
  });

  it("filters Chinese glossary targets for Arabic locale", () => {
    expect(glossaryTargetMatchesLocale("高质量", "high quality", "ar")).toBe(false);
    expect(glossaryTargetMatchesLocale("جودة عالية", "high quality", "ar")).toBe(true);
    expect(glossaryTargetMatchesLocale("高质量", "高质量", "zh-CN")).toBe(true);
  });
});
