import { describe, expect, it } from "vitest";
import {
  buildProductDescriptionContext,
  formatVariantSummary,
} from "../../../../app/server/productImprove/productContextFetcher.server";
import { buildDescriptionUserPrompt } from "../../../../app/server/productImprove/prompts/generateDescriptionPrompt";

describe("formatVariantSummary", () => {
  it("joins option values and SKU", () => {
    expect(
      formatVariantSummary([
        {
          title: "Blue / M",
          sku: "SWIM-1",
          selectedOptions: [
            { name: "Color", value: "Blue" },
            { name: "Size", value: "M" },
          ],
        },
      ]),
    ).toBe("Blue / M / SKU SWIM-1 / Color:Blue, Size:M");
  });
});

describe("buildDescriptionUserPrompt", () => {
  it("binds vendor, type and variants so copy cannot be generic", () => {
    const prompt = buildDescriptionUserPrompt(
      buildProductDescriptionContext({
        id: "gid://shopify/Product/1",
        title: "Racing Swim Cap",
        descriptionHtml: "<p>Silicone cap</p>",
        vendor: "AquaCo",
        productType: "Swimwear",
        tags: ["racing"],
        variants: { nodes: [{ title: "Default", sku: "CAP-1" }] },
      }),
      "en",
    );
    expect(prompt).toContain("AquaCo");
    expect(prompt).toContain("Swimwear");
    expect(prompt).toContain("CAP-1");
    expect(prompt).toContain("禁止写成可套用到其它商品的通用文案");
  });
});
