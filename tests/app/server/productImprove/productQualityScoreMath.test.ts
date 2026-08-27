import { describe, expect, it } from "vitest";
import {
  parseVisionImageScoreJson,
  recomputeProductQualityOverallScore,
  scoreImagesByCount,
} from "../../../../app/server/productImprove/productQualityScoreMath.server";

describe("productQualityScoreMath", () => {
  it("recomputes overall score from dimension weights", () => {
    const score = recomputeProductQualityOverallScore({
      title: { score: 10, suggestion: "" },
      images: { score: 10, suggestion: "" },
      description: { score: 10, suggestion: "" },
      variants: { score: 10, suggestion: "" },
      tags: { score: 10, suggestion: "" },
    });
    expect(score).toBe(100);
  });

  it("applies image count fallback rubric", () => {
    expect(scoreImagesByCount(0).score).toBe(0);
    expect(scoreImagesByCount(1).score).toBe(4);
    expect(scoreImagesByCount(3).score).toBe(7);
    expect(scoreImagesByCount(5).score).toBe(10);
  });

  it("parses vision image score json", () => {
    const parsed = parseVisionImageScoreJson(
      '前置文字 {"score": 8, "suggestion": "补细节图"} 后置',
    );
    expect(parsed).toEqual({ score: 8, suggestion: "补细节图" });
  });

  it("clamps invalid vision scores", () => {
    expect(parseVisionImageScoreJson('{"score": 15, "suggestion": "x"}')?.score).toBe(10);
    expect(parseVisionImageScoreJson('{"score": -2, "suggestion": "x"}')?.score).toBe(0);
    expect(parseVisionImageScoreJson("not json")).toBeNull();
  });
});
