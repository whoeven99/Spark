import { describe, expect, it } from "vitest";
import {
  INVENTORY_CSV_HEADERS,
  buildInventoryCsv,
  buildInventoryExportPreviewRows,
  mapInventoryCsvHeaders,
  parseInventoryCsvRecords,
  parseNonNegativeInt,
} from "../../../app/lib/inventoryCsv";

describe("mapInventoryCsvHeaders", () => {
  it("maps Shopify inventory CSV headers including On hand (new)", () => {
    const mapped = mapInventoryCsvHeaders([...INVENTORY_CSV_HEADERS]);
    expect(mapped.columns.handle).toBe(0);
    expect(mapped.columns.location).toBe(9);
    expect(mapped.columns.onHandCurrent).toBe(14);
    expect(mapped.columns.onHandNew).toBe(15);
    expect(mapped.unknown).toEqual([]);
  });
});

describe("parseInventoryCsvRecords", () => {
  it("keeps Location case-sensitive and leaves blank On hand (new)", () => {
    const records = parseInventoryCsvRecords(
      ["Handle", "Location", "SKU", "On hand (current)", "On hand (new)"],
      [["tee", "Shop location", "TEE-1", "6", ""]],
    );
    expect(records[0]).toMatchObject({
      handle: "tee",
      location: "Shop location",
      sku: "TEE-1",
      onHandCurrent: "6",
      onHandNew: "",
    });
  });
});

describe("buildInventoryCsv", () => {
  it("exports official columns with On hand (new) empty", () => {
    const csv = buildInventoryCsv([
      {
        handle: "tee",
        title: "Tee",
        option1Name: "Size",
        option1Value: "S",
        option2Name: "",
        option2Value: "",
        option3Name: "",
        option3Value: "",
        sku: "TEE-S",
        location: "Shop location",
        incoming: 0,
        unavailable: 0,
        committed: 2,
        available: 4,
        onHand: 6,
      },
    ]);
    expect(csv).toContain("On hand (new)");
    expect(csv.split("\n")[1]).toMatch(/,6,$/);
  });
});

describe("buildInventoryExportPreviewRows", () => {
  it("keeps one preview row per variant-location with available and on-hand", () => {
    const preview = buildInventoryExportPreviewRows([
      {
        handle: "tee",
        title: "Tee",
        option1Name: "Size",
        option1Value: "S",
        option2Name: "",
        option2Value: "",
        option3Name: "",
        option3Value: "",
        sku: "TEE-S",
        location: "8 Lyndhurst",
        incoming: 0,
        unavailable: 0,
        committed: 2,
        available: 4,
        onHand: 6,
      },
    ]);
    expect(preview).toEqual([
      expect.objectContaining({
        productTitle: "Tee",
        variantTitle: "S",
        sku: "TEE-S",
        location: "8 Lyndhurst",
        available: 4,
        onHand: 6,
      }),
    ]);
  });
});

describe("parseNonNegativeInt", () => {
  it("accepts digits and rejects negatives or blanks", () => {
    expect(parseNonNegativeInt("12")).toBe(12);
    expect(parseNonNegativeInt("1,200")).toBe(1200);
    expect(parseNonNegativeInt("")).toBeNull();
    expect(parseNonNegativeInt("-1")).toBeNull();
    expect(parseNonNegativeInt("1.5")).toBeNull();
  });
});
