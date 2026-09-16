import { describe, expect, it } from "vitest";
import { INVENTORY_CSV_HEADERS } from "../../../app/lib/inventoryCsv";
import {
  buildInventoryImportSheetPreview,
  isInventoryImportSheetPreviewBlocked,
} from "../../../app/lib/inventoryImportSheetPreview";

describe("buildInventoryImportSheetPreview", () => {
  it("samples official inventory CSV rows without matching the store", () => {
    const preview = buildInventoryImportSheetPreview({
      fileName: "inventory.csv",
      headers: [...INVENTORY_CSV_HEADERS],
      rows: [
        [
          "tee",
          "Tee",
          "Size",
          "S",
          "",
          "",
          "",
          "",
          "TEE-S",
          "8 Lyndhurst",
          "0",
          "0",
          "0",
          "4",
          "6",
          "10",
        ],
        [
          "tee",
          "Tee",
          "Size",
          "M",
          "",
          "",
          "",
          "",
          "TEE-M",
          "8 Lyndhurst",
          "0",
          "0",
          "0",
          "4",
          "6",
          "",
        ],
      ],
    });
    expect(preview.blockedReason).toBeNull();
    expect(isInventoryImportSheetPreviewBlocked(preview)).toBe(false);
    expect(preview.rowCount).toBe(2);
    expect(preview.filledNewCount).toBe(1);
    expect(preview.locationNames).toEqual(["8 Lyndhurst"]);
    expect(preview.sampleRows[0]?.cells).toContain("10");
  });

  it("blocks a product CSV that is missing inventory columns", () => {
    const preview = buildInventoryImportSheetPreview({
      fileName: "products.csv",
      headers: ["Handle", "Title", "Variant SKU"],
      rows: [["tee", "Tee", "TEE-S"]],
    });
    expect(preview.blockedReason).toBe("wrong_sheet");
    expect(isInventoryImportSheetPreviewBlocked(preview)).toBe(true);
  });
});
