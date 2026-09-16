import { describe, expect, it } from "vitest";
import {
  buildVariantIdentityMutationInput,
  computeVariantIdentityChange,
  parseWeightUnit,
  type VariantIdentityInput,
} from "../../../app/lib/bulkVariantIdentityEdit";

const variant = (overrides: Partial<VariantIdentityInput> = {}): VariantIdentityInput => ({
  variantId: "gid://shopify/ProductVariant/1",
  productId: "gid://shopify/Product/1",
  productTitle: "Tee",
  variantTitle: "S",
  sku: "TEE-S",
  barcode: "123",
  inventoryItemId: "gid://shopify/InventoryItem/1",
  weightValue: 200,
  weightUnit: "GRAMS",
  ...overrides,
});

describe("computeVariantIdentityChange", () => {
  it("changes SKU, barcode, and grams independently", () => {
    const row = computeVariantIdentityChange(variant(), {
      sku: "TEE-NEW",
      barcode: "999",
      weightValue: 250,
      weightUnit: "GRAMS",
    });
    expect(row.skipped).toBe(false);
    expect(row.skuChanged).toBe(true);
    expect(row.barcodeChanged).toBe(true);
    expect(row.weightChanged).toBe(true);
    expect(row.afterWeight).toBe("250 grams");
  });

  it("skips identical values and missing inventory items for SKU/weight", () => {
    expect(computeVariantIdentityChange(variant(), { sku: "TEE-S" }).skipReason).toBe("no_change");
    expect(
      computeVariantIdentityChange(variant({ inventoryItemId: null }), { sku: "TEE-NEW" }).skipReason,
    ).toBe("missing_inventory_item");
  });

  it("writes barcode on the variant and SKU/weight on inventoryItem", () => {
    const row = computeVariantIdentityChange(variant(), {
      sku: "TEE-NEW",
      barcode: "999",
      weightValue: 1,
      weightUnit: "KILOGRAMS",
    });
    expect(buildVariantIdentityMutationInput(row)).toEqual({
      id: "gid://shopify/ProductVariant/1",
      barcode: "999",
      inventoryItem: {
        sku: "TEE-NEW",
        measurement: { weight: { value: 1, unit: "KILOGRAMS" } },
      },
    });
  });
});

describe("parseWeightUnit", () => {
  it("accepts Shopify and short aliases", () => {
    expect(parseWeightUnit("GRAMS")).toBe("GRAMS");
    expect(parseWeightUnit("kg")).toBe("KILOGRAMS");
    expect(parseWeightUnit("lb")).toBe("POUNDS");
    expect(parseWeightUnit("nope")).toBeNull();
  });
});
