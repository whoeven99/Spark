import { describe, expect, it } from "vitest";
import {
  classifyImportApplyMessage,
  coerceProductImportApplyErrors,
  enrichImportApplyErrors,
  emptyImportApplyLookups,
} from "../../../app/lib/productImportApplyError";
import { flattenProductImportApplyErrors } from "../../../app/lib/productImportPreview";

describe("classifyImportApplyMessage", () => {
  it("maps compare-at and zero-price Shopify errors", () => {
    expect(classifyImportApplyMessage("The compare-at price must be higher than the price")).toBe(
      "compare_at_below_price",
    );
    expect(classifyImportApplyMessage("Price must be positive")).toBe("price_zero");
    expect(classifyImportApplyMessage("Throttled")).toBe("throttled");
  });

  it("falls back to the raw Shopify message", () => {
    expect(classifyImportApplyMessage("Something unexpected")).toBe("shopify_user_error");
  });
});

describe("enrichImportApplyErrors", () => {
  it("attaches product title and field from the changeset lookup", () => {
    const lookups = emptyImportApplyLookups();
    lookups.byVariantId.set("v1", {
      productTitle: "Tee",
      field: "Default",
      beforeValue: "10.00",
      afterValue: "0.00",
      productId: "p1",
      variantId: "v1",
    });
    const errors = enrichImportApplyErrors(
      "price",
      [{ variantId: "v1", message: "Price must be positive" }],
      lookups,
    );
    expect(errors).toEqual([
      expect.objectContaining({
        operation: "price",
        code: "price_zero",
        productTitle: "Tee",
        field: "Default",
        beforeValue: "10.00",
        afterValue: "0.00",
      }),
    ]);
    expect(flattenProductImportApplyErrors(errors)[0]).toEqual(
      expect.objectContaining({ kind: "failure", afterValue: "0.00" }),
    );
  });
});

describe("coerceProductImportApplyErrors", () => {
  it("keeps legacy { message } rows", () => {
    const errors = coerceProductImportApplyErrors([{ message: "nope", productId: "p1" }]);
    expect(errors[0]).toEqual(
      expect.objectContaining({
        message: "nope",
        productId: "p1",
        code: "shopify_user_error",
        operation: "price",
      }),
    );
  });
});
