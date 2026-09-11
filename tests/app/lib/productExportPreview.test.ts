import { describe, expect, it } from "vitest";
import {
  buildProductExportPreviewRows,
  coerceProductExportPreviewProducts,
} from "../../../app/lib/productExport";

describe("coerceProductExportPreviewProducts", () => {
  it("keeps a unique lightweight product list", () => {
    expect(
      coerceProductExportPreviewProducts([
        { productId: "p1", title: "Tee", handle: "tee" },
        { id: "p1", title: "Tee again" },
        { productId: "p2", productTitle: "Hat" },
        { title: "Missing id" },
      ]),
    ).toEqual([
      { productId: "p1", title: "Tee", handle: "tee" },
      { productId: "p2", title: "Hat", handle: "" },
    ]);
  });
});

describe("buildProductExportPreviewRows", () => {
  it("marks selected products as pending while the export is running", () => {
    const rows = buildProductExportPreviewRows({
      productIds: ["p1", "p2"],
      configProducts: [{ productId: "p1", title: "Tee", handle: "" }],
      resultProducts: [],
      skips: [],
      completed: false,
    });
    expect(rows.map((row) => row.outcome)).toEqual(["pending", "pending"]);
    expect(rows[0]?.title).toBe("Tee");
  });

  it("uses result products and skip reasons after the export finishes", () => {
    const rows = buildProductExportPreviewRows({
      productIds: ["p1", "p2"],
      configProducts: [
        { productId: "p1", title: "Tee", handle: "" },
        { productId: "p2", title: "Hat", handle: "" },
      ],
      resultProducts: [{ productId: "p1", title: "Tee", handle: "tee" }],
      skips: [{ productId: "p2", productTitle: "Hat", reason: "missing_price" }],
      completed: true,
    });
    expect(rows).toEqual([
      expect.objectContaining({
        productId: "p1",
        handle: "tee",
        outcome: "exported",
      }),
      expect.objectContaining({
        productId: "p2",
        outcome: "skipped",
        skipReason: "missing_price",
      }),
    ]);
  });

  it("treats legacy completed exports without products[] as all exported except skips", () => {
    const rows = buildProductExportPreviewRows({
      productIds: ["p1", "p2"],
      configProducts: [],
      resultProducts: [],
      skips: [{ productId: "p2", productTitle: "Hat", reason: "missing_title" }],
      completed: true,
    });
    expect(rows.map((row) => [row.productId, row.outcome])).toEqual([
      ["p1", "exported"],
      ["p2", "skipped"],
    ]);
  });
});
