import { describe, expect, it } from "vitest";
import { analyzeImportSheet } from "../../../app/lib/productImport";
import {
  buildProductImportSheetPreview,
  coerceProductImportSheetPreview,
  countUnusedImportColumns,
  isProductImportSheetPreviewBlocked,
} from "../../../app/lib/productImportSheetPreview";

function preview(
  headers: string[],
  rows: string[][],
  selected?: string[],
  fileName = "products.csv",
) {
  return buildProductImportSheetPreview({
    fileName,
    analysis: analyzeImportSheet(headers, rows, selected),
    selectedOperations: selected,
  });
}

describe("buildProductImportSheetPreview", () => {
  it("summarizes identity columns, sample rows, and does not block a valid sheet", () => {
    const result = preview(
      ["Handle", "Title", "Variant Price", "Google Shopping / Gender"],
      [
        ["tee", "Tee", "12.00", "unisex"],
        ["hat", "Hat", "9.00", ""],
      ],
      ["title", "price"],
    );
    expect(result.rowCount).toBe(2);
    expect(result.blockedReason).toBeNull();
    expect(isProductImportSheetPreviewBlocked(result)).toBe(false);
    expect(result.recognizedHeaders).toEqual(expect.arrayContaining(["Handle", "Title", "Variant Price"]));
    expect(result.unknownColumns).toEqual([]);
    expect(result.ignoredColumns).toEqual(["Google Shopping / Gender"]);
    expect(countUnusedImportColumns(result)).toBe(1);
    expect(result.matchedOperations).toEqual(["title", "price"]);
    expect(result.columns.map((column) => column.key)).toEqual(["handle", "title", "price"]);
    expect(result.sampleRows).toEqual([
      { rowNumber: 2, cells: ["tee", "Tee", "12.00"] },
      { rowNumber: 3, cells: ["hat", "Hat", "9.00"] },
    ]);
  });

  it("treats native Shopify metafield headers as recognized writeable columns", () => {
    const result = preview(
      ["Handle", "Custom Description (product.metafields.custom.custom_description)"],
      [["tee", "linen"]],
    );
    expect(result.detectedOperations).toContain("metafield");
    expect(result.recognizedHeaders).toEqual(
      expect.arrayContaining([
        "Handle",
        "Custom Description (product.metafields.custom.custom_description)",
      ]),
    );
    expect(result.unknownColumns).toEqual([]);
  });

  it("does not flag column_not_selected before the merchant selects operations", () => {
    const result = preview(["Handle", "Title", "Vendor"], [["tee", "Tee", "Acme"]]);
    expect(result.selectedOperations).toEqual([]);
    expect(result.detectedOperations).toEqual(["title", "vendor"]);
    expect(result.issues.some((issue) => issue.code === "column_not_selected")).toBe(false);
    expect(result.ignoredColumns).toEqual([]);
  });

  it("lists ignored native Shopify columns without treating them as issues", () => {
    const result = preview(
      ["Handle", "Vendor", "Product Category", "Gift Card", "Variant Grams"],
      [["tee", "Acme", "Apparel", "FALSE", "100"]],
      ["vendor"],
    );
    expect(result.ignoredColumns).toEqual(["Product Category", "Gift Card", "Variant Grams"]);
    expect(result.issues.some((issue) => issue.column === "Product Category")).toBe(false);
    expect(countUnusedImportColumns(result)).toBe(3);
  });

  it("does not count native unsupported columns as issues to fix", () => {
    const result = preview(
      ["Handle", "Title", "Published", "Variant Inventory Qty", "Image Src"],
      [["tee", "Tee", "TRUE", "1", "https://example.com/a.jpg"]],
      ["title"],
    );
    expect(result.unsupportedColumns.length).toBeGreaterThan(0);
    expect(result.issueCount).toBe(0);
    expect(result.issues).toEqual([]);
    expect(countUnusedImportColumns(result)).toBeGreaterThan(0);
  });

  it("adds Duplicate=TRUE in preview when copy is selected without that header", () => {
    const result = preview(
      ["Handle", "Variant SKU"],
      [
        ["tee", "TEE-1"],
        ["hat", "HAT-1"],
      ],
      ["duplicate"],
    );
    expect(result.issueCount).toBe(0);
    expect(result.matchedOperations).toEqual(["duplicate"]);
    expect(result.columns.map((column) => column.key)).toEqual(["handle", "sku", "duplicate"]);
    expect(result.sampleRows).toEqual([
      { rowNumber: 2, cells: ["tee", "TEE-1", "TRUE"] },
      { rowNumber: 3, cells: ["hat", "HAT-1", "TRUE"] },
    ]);
  });

  it("adds Archive and Delete columns in preview when those actions are selected without headers", () => {
    const result = preview(["Handle"], [["tee"]], ["archive", "delete"]);
    expect(result.issueCount).toBe(0);
    expect(result.matchedOperations).toEqual(["archive", "delete"]);
    expect(result.columns.map((column) => column.key)).toEqual(["handle", "archive", "delete"]);
    expect(result.sampleRows).toEqual([{ rowNumber: 2, cells: ["tee", "TRUE", "TRUE"] }]);
  });

  it("blocks when the sheet has no Handle / SKU / Product ID column", () => {
    const result = preview(["Title", "Variant Price"], [["Tee", "12.00"]], ["title", "price"]);
    expect(result.blockedReason).toBe("missing_identity");
    expect(isProductImportSheetPreviewBlocked(result)).toBe(true);
  });

  it("blocks when the sheet has identity columns but no data rows", () => {
    const result = preview(["Handle", "Title"], [], ["title"]);
    expect(result.rowCount).toBe(0);
    expect(result.blockedReason).toBe("no_usable_rows");
  });

  it("caps sample rows and round-trips through coerce", () => {
    const rows = Array.from({ length: 25 }, (_, index) => [`sku-${index + 1}`, `Item ${index + 1}`]);
    const result = preview(["Variant SKU", "Title"], rows, ["title"]);
    expect(result.rowCount).toBe(25);
    expect(result.sampleRows).toHaveLength(20);
    expect(result.sampleRows[0]?.cells).toEqual(["sku-1", "Item 1"]);
    expect(coerceProductImportSheetPreview(result)).toEqual(result);
  });
});

describe("coerceProductImportSheetPreview", () => {
  it("returns null for malformed payloads", () => {
    expect(coerceProductImportSheetPreview(null)).toBeNull();
    expect(coerceProductImportSheetPreview({ rowCount: 1 })).toBeNull();
  });
});
