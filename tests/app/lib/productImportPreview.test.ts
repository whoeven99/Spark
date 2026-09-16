import { describe, expect, it } from "vitest";
import type { ProductImportTaskResult } from "../../../app/lib/aiTaskTypes";
import {
  flattenProductImportIssues,
  flattenProductImportPreview,
} from "../../../app/lib/productImportPreview";

const emptyResult = (): ProductImportTaskResult => ({
  fileName: "products.csv",
  operations: ["price", "tags", "delete"],
  issues: [],
  summary: { rows: 2, matched: 2, changed: 2, issues: 0 },
  priceRows: [],
  costRows: [],
  tagRows: [],
  statusRows: [],
  fieldRows: [],
  handleRows: [],
  collectionGroups: [],
  metafieldRows: [],
  duplicateRows: [],
  archiveRows: [],
  deleteRows: [],
  identityRows: [],
});

describe("flattenProductImportPreview", () => {
  it("splits writable changeset rows from skipped rows", () => {
    const result = emptyResult();
    result.priceRows = [
      {
        variantId: "v1",
        productId: "p1",
        productTitle: "Tee",
        variantTitle: "Default",
        sku: "TEE-1",
        beforePrice: "10.00",
        afterPrice: "12.00",
        beforeCompareAt: null,
        afterCompareAt: null,
        priceChanged: true,
        compareAtChanged: false,
        skipped: false,
      },
      {
        variantId: "v2",
        productId: "p1",
        productTitle: "Tee",
        variantTitle: "Large",
        sku: "TEE-2",
        beforePrice: "10.00",
        afterPrice: "10.00",
        beforeCompareAt: null,
        afterCompareAt: null,
        priceChanged: false,
        compareAtChanged: false,
        skipped: true,
        skipReason: "no_change",
      },
    ];
    result.tagRows = [
      {
        productId: "p1",
        productTitle: "Tee",
        beforeTags: ["a"],
        afterTags: ["a", "sale"],
        addedTags: ["sale"],
        removedTags: [],
        skipped: false,
      },
    ];

    const preview = flattenProductImportPreview(result);
    expect(preview.changes).toEqual([
      expect.objectContaining({
        operation: "price",
        field: "Default",
        beforeValue: "10.00",
        afterValue: "12.00",
        kind: "change",
      }),
      expect.objectContaining({
        operation: "tags",
        beforeValue: "a",
        afterValue: "a, sale",
        kind: "change",
      }),
    ]);
    expect(preview.skips).toEqual([
      expect.objectContaining({
        operation: "price",
        skipReason: "no_change",
        kind: "skip",
      }),
    ]);
  });

  it("shows compare-at as its own change row", () => {
    const result = emptyResult();
    result.priceRows = [
      {
        variantId: "v1",
        productId: "p1",
        productTitle: "Tee",
        variantTitle: "Default",
        sku: "TEE-1",
        beforePrice: "10.00",
        afterPrice: "10.00",
        beforeCompareAt: null,
        afterCompareAt: "20.00",
        priceChanged: false,
        compareAtChanged: true,
        skipped: false,
      },
    ];
    const preview = flattenProductImportPreview(result);
    expect(preview.changes).toEqual([
      expect.objectContaining({
        operation: "price",
        field: "compareAt",
        beforeValue: "",
        afterValue: "20.00",
        kind: "change",
      }),
    ]);
    expect(preview.skips).toEqual([]);
  });

  it("flattens issue rows for the problems tab", () => {
    const rows = flattenProductImportIssues([
      { rowNumber: 3, code: "invalid_price", column: "price", value: "abc", productTitle: "Tee" },
    ]);
    expect(rows).toEqual([
      expect.objectContaining({
        kind: "issue",
        productTitle: "Tee",
        field: "price",
        beforeValue: "abc",
        issue: expect.objectContaining({ code: "invalid_price" }),
      }),
    ]);
  });

  it("collapses repeated handle_not_found rows into a range label", () => {
    const rows = flattenProductImportIssues([
      { rowNumber: 14, code: "handle_not_found", column: "handle", value: "tee" },
      { rowNumber: 15, code: "handle_not_found", column: "handle", value: "tee" },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(
      expect.objectContaining({
        productTitle: "#14–15",
        issue: expect.objectContaining({ code: "handle_not_found", rowLabel: "14–15" }),
      }),
    );
  });

  it("lists SKU / barcode / weight changes from identity rows", () => {
    const result = emptyResult();
    result.identityRows = [
      {
        variantId: "v1",
        productId: "p1",
        productTitle: "Tee",
        variantTitle: "Default",
        inventoryItemId: "inv1",
        beforeSku: "TEE-1",
        afterSku: "TEE-NEW",
        skuChanged: true,
        beforeBarcode: "111",
        afterBarcode: "999",
        barcodeChanged: true,
        beforeWeight: "100 grams",
        afterWeight: "250 grams",
        weightChanged: true,
        skipped: false,
      },
    ];
    const preview = flattenProductImportPreview(result);
    expect(preview.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ operation: "sku", afterValue: "TEE-NEW", kind: "change" }),
        expect.objectContaining({ operation: "barcode", afterValue: "999", kind: "change" }),
        expect.objectContaining({ operation: "weight", afterValue: "250 grams", kind: "change" }),
      ]),
    );
  });
});
