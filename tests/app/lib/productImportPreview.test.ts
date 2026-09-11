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

  it("flattens issue rows for the problems tab", () => {
    const rows = flattenProductImportIssues([
      { rowNumber: 3, code: "invalid_price", column: "price", value: "abc" },
    ]);
    expect(rows).toEqual([
      expect.objectContaining({
        kind: "issue",
        productTitle: "#3",
        field: "price",
        beforeValue: "abc",
        issue: expect.objectContaining({ code: "invalid_price" }),
      }),
    ]);
  });
});
