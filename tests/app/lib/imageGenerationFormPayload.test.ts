import { describe, expect, it } from "vitest";
import {
  coerceImageGenerationFormPayload,
  imageGenerationFormFromProposal,
  mergeImageGenerationContextProduct,
} from "../../../app/lib/imageGenerationFormPayload";

describe("coerceImageGenerationFormPayload", () => {
  it("keeps description only when product is absent", () => {
    expect(coerceImageGenerationFormPayload({ description: "白色咖啡杯" })).toEqual({
      description: "白色咖啡杯",
    });
  });

  it("includes optional product fields", () => {
    expect(
      coerceImageGenerationFormPayload({
        description: "白底主图",
        productId: "gid://shopify/Product/1",
        productTitle: "马克杯",
      }),
    ).toEqual({
      description: "白底主图",
      productId: "gid://shopify/Product/1",
      productTitle: "马克杯",
    });
  });
});

describe("mergeImageGenerationContextProduct", () => {
  it("prefills the first workspace product when the form has none", () => {
    expect(
      mergeImageGenerationContextProduct(
        { description: "白底" },
        { id: "gid://shopify/Product/1", title: "马克杯" },
      ),
    ).toEqual({
      description: "白底",
      productId: "gid://shopify/Product/1",
      productTitle: "马克杯",
    });
  });

  it("does not overwrite an existing product", () => {
    expect(
      mergeImageGenerationContextProduct(
        { description: "白底", productId: "gid://shopify/Product/9", productTitle: "已选" },
        { id: "gid://shopify/Product/1", title: "马克杯" },
      ),
    ).toEqual({
      description: "白底",
      productId: "gid://shopify/Product/9",
      productTitle: "已选",
    });
  });
});

describe("imageGenerationFormFromProposal", () => {
  it("converts an image_generation proposal", () => {
    expect(
      imageGenerationFormFromProposal({
        skillId: "image_generation",
        params: [{ key: "description", value: "白底马克杯" }],
      }),
    ).toEqual({ description: "白底马克杯" });
  });

  it("returns null for other skills", () => {
    expect(
      imageGenerationFormFromProposal({
        skillId: "batch_product_improve",
        params: [],
      }),
    ).toBeNull();
  });
});
