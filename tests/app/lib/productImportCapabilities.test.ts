import { describe, expect, it } from "vitest";
import { computeVariantCostChange } from "../../../app/lib/bulkCostEdit";
import { computeProductHandleChange, isValidProductHandle, normalizeProductHandle } from "../../../app/lib/bulkHandleEdit";
import {
  computeMetafieldChange,
  normalizeMetafieldValue,
  parseImportMetafieldHeader,
} from "../../../app/lib/bulkMetafieldEdit";
import { computeProductDelete } from "../../../app/lib/bulkProductDelete";

describe("bulkCostEdit", () => {
  it("sets a new unit cost", () => {
    const row = computeVariantCostChange(
      {
        variantId: "v1",
        productId: "p1",
        productTitle: "Tee",
        variantTitle: "Default",
        sku: "TEE-1",
        inventoryItemId: "inv1",
        cost: "4.00",
      },
      "5.50",
    );
    expect(row.skipped).toBe(false);
    expect(row.afterCost).toBe("5.50");
  });

  it("skips when inventory item is missing", () => {
    const row = computeVariantCostChange(
      {
        variantId: "v1",
        productId: "p1",
        productTitle: "Tee",
        variantTitle: "Default",
        sku: "TEE-1",
        inventoryItemId: null,
        cost: null,
      },
      "5.50",
    );
    expect(row.skipReason).toBe("missing_inventory_item");
  });
});

describe("bulkHandleEdit", () => {
  it("normalizes and validates handles", () => {
    expect(normalizeProductHandle("Black Sunglasses")).toBe("black-sunglasses");
    expect(isValidProductHandle("black-sunglasses")).toBe(true);
    expect(isValidProductHandle("Bad Handle")).toBe(false);
  });

  it("detects a taken handle", () => {
    const row = computeProductHandleChange(
      { productId: "p1", productTitle: "Tee", handle: "tee" },
      "taken",
      "p2",
    );
    expect(row.skipReason).toBe("handle_taken");
  });
});

describe("bulkMetafieldEdit", () => {
  it("parses Shopify-style metafield headers", () => {
    expect(parseImportMetafieldHeader("Metafield: custom.fabric [single_line_text_field]")).toEqual(
      expect.objectContaining({
        owner: "product",
        namespace: "custom",
        key: "fabric",
        type: "single_line_text_field",
      }),
    );
    expect(parseImportMetafieldHeader("Variant Metafield: custom.size")).toEqual(
      expect.objectContaining({ owner: "variant", namespace: "custom", key: "size" }),
    );
    expect(
      parseImportMetafieldHeader("汉字无法报错测试 (product.metafields.custom.chineseword)"),
    ).toEqual(
      expect.objectContaining({
        owner: "product",
        namespace: "custom",
        key: "chineseword",
      }),
    );
    expect(parseImportMetafieldHeader("Size (variant.metafields.custom.size)")).toEqual(
      expect.objectContaining({ owner: "variant", namespace: "custom", key: "size" }),
    );
  });

  it("normalizes boolean and rejects bad JSON", () => {
    expect(normalizeMetafieldValue("boolean", "是")).toEqual({ ok: true, value: "true" });
    expect(normalizeMetafieldValue("json", "{bad")).toEqual({ ok: false });
  });

  it("strips an Excel text prefix from integers", () => {
    expect(normalizeMetafieldValue("number_integer", "'3")).toEqual({ ok: true, value: "3" });
  });

  it("parses list.single_line_text_field from CSV or JSON", () => {
    expect(normalizeMetafieldValue("list.single_line_text_field", "红, 蓝")).toEqual({
      ok: true,
      value: '["红","蓝"]',
    });
    expect(normalizeMetafieldValue("list.single_line_text_field", '["红","蓝"]')).toEqual({
      ok: true,
      value: '["红","蓝"]',
    });
  });

  it("treats an unchanged text list as no_change", () => {
    const row = computeMetafieldChange({
      ownerId: "p1",
      owner: "product",
      productId: "p1",
      productTitle: "Tee",
      namespace: "custom",
      key: "chineseword",
      type: "list.single_line_text_field",
      beforeValue: '["红", "蓝"]',
      rawValue: "红, 蓝",
      hasDefinition: true,
    });
    expect(row.skipReason).toBe("no_change");
  });

  it("deletes when the new value is empty", () => {
    const row = computeMetafieldChange({
      ownerId: "p1",
      owner: "product",
      productId: "p1",
      productTitle: "Tee",
      namespace: "custom",
      key: "fabric",
      type: "single_line_text_field",
      beforeValue: "cotton",
      rawValue: "",
      hasDefinition: true,
    });
    expect(row.action).toBe("delete");
    expect(row.skipped).toBe(false);
  });
});

describe("bulkProductDelete", () => {
  it("marks the product for deletion", () => {
    const row = computeProductDelete({
      productId: "p1",
      productTitle: "Tee",
      handle: "tee",
    });
    expect(row.skipped).toBe(false);
  });
});
