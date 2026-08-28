import { describe, expect, it } from "vitest";
import {
  coerceProductQualityFormPayload,
  defaultProductQualityFormPayload,
  isProductQualityFormToolPayload,
  productQualityFormHasScore,
  PRODUCT_QUALITY_FORM_PAYLOAD_KIND,
} from "../../../app/lib/productQualityFormPayload";

const scoredDimensions = {
  title: { score: 7, suggestion: "t" },
  images: { score: 6, suggestion: "i" },
  description: { score: 8, suggestion: "d" },
  variants: { score: 5, suggestion: "v" },
  tags: { score: 4, suggestion: "g" },
};

describe("coerceProductQualityFormPayload", () => {
  it("returns empty productId for invalid input", () => {
    expect(coerceProductQualityFormPayload(null)).toEqual({ productId: "" });
    expect(coerceProductQualityFormPayload("x")).toEqual({ productId: "" });
  });

  it("keeps prefill productId and title without score", () => {
    expect(
      coerceProductQualityFormPayload({ productId: " 123 ", title: " Coat " }),
    ).toEqual({ productId: "123", title: "Coat" });
  });

  it("keeps billedTokens only when positive", () => {
    expect(coerceProductQualityFormPayload({ billedTokens: 1240 }).billedTokens).toBe(1240);
    expect(coerceProductQualityFormPayload({ billedTokens: 0 }).billedTokens).toBeUndefined();
    expect(coerceProductQualityFormPayload({ billedTokens: -3 }).billedTokens).toBeUndefined();
  });

  it("coerces a full score payload", () => {
    const payload = coerceProductQualityFormPayload({
      productId: "gid://shopify/Product/1",
      title: "Winter Coat",
      score: 72,
      dimensions: scoredDimensions,
      overallSuggestions: ["fix tags", 1],
      billedTokens: 1240.4,
    });
    expect(payload.score).toBe(72);
    expect(payload.dimensions).toEqual(scoredDimensions);
    expect(payload.overallSuggestions).toEqual(["fix tags"]);
    expect(payload.billedTokens).toBe(1240);
    expect(productQualityFormHasScore(payload)).toBe(true);
  });

  it("does not treat incomplete dimensions as scored", () => {
    const payload = coerceProductQualityFormPayload({
      productId: "1",
      score: 80,
      dimensions: { title: { score: 8, suggestion: "ok" } },
    });
    expect(payload.dimensions).toBeUndefined();
    expect(productQualityFormHasScore(payload)).toBe(false);
  });
});

describe("productQualityForm helpers", () => {
  it("detects form tool kind", () => {
    expect(isProductQualityFormToolPayload({ _sparkKind: PRODUCT_QUALITY_FORM_PAYLOAD_KIND })).toBe(
      true,
    );
    expect(isProductQualityFormToolPayload({ productId: "1" })).toBe(false);
  });

  it("defaults to empty form", () => {
    expect(defaultProductQualityFormPayload()).toEqual({ productId: "" });
    expect(productQualityFormHasScore(defaultProductQualityFormPayload())).toBe(false);
  });
});
