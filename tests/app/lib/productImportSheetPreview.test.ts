import { describe, expect, it } from "vitest";
import { analyzeImportSheet } from "../../../app/lib/productImport";
import {
  buildProductImportSheetPreview,
  coerceProductImportSheetPreview,
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
    expect(result.unknownColumns).toEqual(["Google Shopping / Gender"]);
    expect(result.matchedOperations).toEqual(["title", "price"]);
    expect(result.columns.map((column) => column.key)).toEqual(["handle", "title", "price"]);
    expect(result.sampleRows).toEqual([
      { rowNumber: 2, cells: ["tee", "Tee", "12.00"] },
      { rowNumber: 3, cells: ["hat", "Hat", "9.00"] },
    ]);
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
