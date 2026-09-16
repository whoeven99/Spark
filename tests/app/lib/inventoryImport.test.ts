import { describe, expect, it } from "vitest";
import { parseInventoryCsvRecords } from "../../../app/lib/inventoryCsv";
import {
  planInventoryImport,
  type InventoryImportLocationRef,
  type InventoryImportProductSnapshot,
} from "../../../app/lib/inventoryImport";

const locations: InventoryImportLocationRef[] = [
  { id: "gid://shopify/Location/1", name: "Shop location", writable: true },
  { id: "gid://shopify/Location/2", name: "3PL", writable: false },
];

const product = (
  overrides: Partial<InventoryImportProductSnapshot> = {},
): InventoryImportProductSnapshot => ({
  productId: "gid://shopify/Product/1",
  productTitle: "Tee",
  handle: "tee",
  variants: [
    {
      variantId: "gid://shopify/ProductVariant/1",
      title: "S",
      sku: "TEE-S",
      inventoryItemId: "gid://shopify/InventoryItem/1",
      tracked: true,
      option1Name: "Size",
      option1: "S",
      option2Name: "",
      option2: "",
      option3Name: "",
      option3: "",
      levels: [
        {
          locationId: "gid://shopify/Location/1",
          locationName: "Shop location",
          writable: true,
          stocked: true,
          available: 4,
          onHand: 6,
          committed: 2,
          incoming: 0,
          unavailable: 0,
        },
      ],
    },
  ],
  ...overrides,
});

function plan(headers: string[], rows: string[][], products = [product()]) {
  const records = parseInventoryCsvRecords(headers, rows);
  return planInventoryImport({
    records,
    products,
    locations,
    hasLocationColumn: headers.some((header) => header.toLowerCase() === "location"),
    hasOnHandNewColumn: headers.some((header) => /on hand \(new\)/i.test(header)),
  });
}

describe("planInventoryImport", () => {
  it("matches Handle + Location + Option and writes On hand (new)", () => {
    const result = plan(
      ["Handle", "Option1 Value", "Location", "On hand (new)"],
      [["tee", "S", "Shop location", "10"]],
    );
    expect(result.issues).toEqual([]);
    expect(result.rows[0]).toMatchObject({
      afterOnHand: 10,
      beforeOnHand: 6,
      availableEstimate: 8,
      skipped: false,
    });
  });

  it("skips blank On hand (new) and does not treat SKU as a write column", () => {
    const result = plan(
      ["Handle", "SKU", "Location", "On hand (current)", "On hand (new)"],
      [["tee", "NEW-SKU", "Shop location", "6", ""]],
    );
    expect(result.rows[0]?.skipReason).toBe("empty_new");
    expect(result.issues).toEqual([]);
  });

  it("flags stale On hand (current) and on-hand below committed", () => {
    const stale = plan(
      ["Handle", "Location", "On hand (current)", "On hand (new)"],
      [["tee", "Shop location", "99", "10"]],
    );
    expect(stale.issues.map((issue) => issue.code)).toEqual(["stale_on_hand"]);

    const below = plan(
      ["Handle", "Location", "On hand (new)"],
      [["tee", "Shop location", "1"]],
    );
    expect(below.issues.map((issue) => issue.code)).toEqual(["on_hand_below_committed"]);
  });

  it("rejects a fulfillment-service location and the product CSV sheet", () => {
    const fulfillment = plan(
      ["Handle", "Location", "On hand (new)"],
      [["tee", "3PL", "10"]],
    );
    expect(fulfillment.issues.map((issue) => issue.code)).toEqual(["location_not_writable"]);

    const wrongSheet = planInventoryImport({
      records: [],
      products: [product()],
      locations,
      hasLocationColumn: false,
      hasOnHandNewColumn: true,
    });
    expect(wrongSheet.issues.map((issue) => issue.code)).toEqual(["wrong_sheet"]);
  });
});
