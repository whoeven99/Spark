import type { ProductQualityDimension, ProductQualityScoreData } from "../../lib/productQualityScoreTypes";

/** 参与 Vision 评分的最大图片数（控制延迟与 token）。 */
export const PRODUCT_QUALITY_VISION_IMAGE_LIMIT = 6;

/**
 * 综合分（满分 100）= (标题×25 + 图片×25 + 描述×30 + Variant×10 + 标签×10) / 10
 */
export function recomputeProductQualityOverallScore(
  dimensions: ProductQualityScoreData["dimensions"],
): number {
  const raw =
    (dimensions.title.score * 25 +
      dimensions.images.score * 25 +
      dimensions.description.score * 30 +
      dimensions.variants.score * 10 +
      dimensions.tags.score * 10) /
    10;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

/** Vision 不可用时的数量启发式（与原 system prompt 口径一致）。 */
export function scoreImagesByCount(imageCount: number): ProductQualityDimension {
  if (imageCount <= 0) {
    return { score: 0, suggestion: "尚未上传商品图，请至少添加 5 张主图与细节图。" };
  }
  if (imageCount >= 5) {
    return {
      score: 10,
      suggestion: "主图数量充足；建议再检查清晰度、白底一致性与场景多样性。",
    };
  }
  if (imageCount >= 3) {
    return {
      score: 7,
      suggestion: `当前 ${imageCount} 张图，建议补足到至少 5 张（含细节/场景）。`,
    };
  }
  return {
    score: 4,
    suggestion: `当前仅 ${imageCount} 张图，建议尽快补到 5 张以上。`,
  };
}

export function parseVisionImageScoreJson(
  rawText: string,
): ProductQualityDimension | null {
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]) as {
      score?: unknown;
      suggestion?: unknown;
    };
    const scoreNum = Number(parsed.score);
    if (!Number.isFinite(scoreNum)) return null;
    const score = Math.max(0, Math.min(10, Math.round(scoreNum)));
    const suggestion =
      typeof parsed.suggestion === "string" && parsed.suggestion.trim()
        ? parsed.suggestion.trim()
        : "建议优化主图清晰度、构图与图组完整性。";
    return { score, suggestion };
  } catch {
    return null;
  }
}
