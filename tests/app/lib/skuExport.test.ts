import { describe, expect, it } from "vitest";
import {
  SKU_EXPORT_HEADERS,
  buildSkuExportCsv,
  buildSkuExportPreviewRows,
  findDuplicateSkuWarnings,
  type SkuExportVariant,
} from "../../../app/lib/skuExport";

const row = (overrides: Partial<SkuExportVariant> = {}): SkuExportVariant => ({
  productId: "gid://shopify/Product/1",
  handle: "tee",
  title: "Tee",
  variantId: "gid://shopify/ProductVariant/1",
  option1Name: "Size",
  option1Value: "S",
  option2Name: "",
  option2Value: "",
  option3Name: "",
  option3Value: "",
  sku: "TEE-S",
  barcode: "123",
  weight: "200 grams",
  weightUnit: "GRAMS",
  ...overrides,
});

describe("skuExport", () => {
  it("exports identity columns without inventory quantities", () => {
    const csv = buildSkuExportCsv([row()]);
    expect(csv.split("\n")[0]?.split(",")).toEqual([...SKU_EXPORT_HEADERS]);
    expect(csv).not.toContain("On hand");
    expect(csv).toContain("TEE-S");
    expect(csv).toContain("200 grams");
  });

  it("warns on duplicate SKUs and ignores blanks", () => {
    const warnings = findDuplicateSkuWarnings([
      row({ sku: "DUP" }),
      row({ variantId: "v2", sku: "DUP" }),
      row({ variantId: "v3", sku: "" }),
    ]);
    expect(warnings).toHaveLength(2);
    expect(warnings.every((item) => item.reason === "duplicate_sku")).toBe(true);
  });

  it("builds a variant-level preview and flags duplicate SKUs", () => {
    const rows = [
      row({ sku: "DUP" }),
      row({ variantId: "gid://shopify/ProductVariant/2", option1Value: "M", sku: "DUP" }),
    ];
    const preview = buildSkuExportPreviewRows(rows, findDuplicateSkuWarnings(rows));
    expect(preview).toHaveLength(2);
    expect(preview[0]).toMatchObject({
      variantTitle: "S",
      sku: "DUP",
      warned: true,
    });
  });
});
