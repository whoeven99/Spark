import { describe, expect, it } from "vitest";
import {
  INVENTORY_CSV_HEADERS,
  buildInventoryExportCsv,
  isInventoryAllStatesSheet,
  matchInventoryImportRecords,
  parseInventoryCsvSheet,
} from "../../../app/lib/inventoryCsv";
import type { InventoryLevelSnapshot } from "../../../app/lib/inventoryQtyEdit";

function snapshot(overrides: Partial<InventoryLevelSnapshot> = {}): InventoryLevelSnapshot {
  return {
    variantId: "gid://shopify/ProductVariant/1",
    productId: "gid://shopify/Product/1",
    productTitle: "Tee",
    variantTitle: "S",
    sku: "TEE-S",
    handle: "tee",
    option1: "S",
    option2: "",
    option3: "",
    inventoryItemId: "gid://shopify/InventoryItem/1",
    locationId: "gid://shopify/Location/1",
    locationName: "Main",
    tracked: true,
    isGiftCard: false,
    stocked: true,
    available: 8,
    onHand: 10,
    committed: 2,
    incoming: 0,
    ...overrides,
  };
}

describe("isInventoryAllStatesSheet", () => {
  it("accepts official headers and rejects location-as-column sheets", () => {
    expect(isInventoryAllStatesSheet([...INVENTORY_CSV_HEADERS])).toBe(true);
    expect(isInventoryAllStatesSheet(["Handle", "SKU", "Main warehouse"])).toBe(false);
  });
});

describe("parseInventoryCsvSheet", () => {
  it("reads On hand current/new and rejects wide tables", () => {
    const parsed = parseInventoryCsvSheet(
      [...INVENTORY_CSV_HEADERS],
      [["tee", "Tee", "Size", "S", "", "", "", "", "TEE-S", "", "", "Main", "", "0", "0", "2", "8", "10", "15"]],
    );
    expect(parsed.records[0]).toMatchObject({
      sku: "TEE-S",
      locationName: "Main",
      onHandCurrent: 10,
      onHandNew: 15,
    });
    expect(parseInventoryCsvSheet(["Handle", "SKU", "Available"], [["tee", "TEE-S", "3"]]).issues[0]?.code).toBe(
      "unsupported_format",
    );
  });
});

describe("matchInventoryImportRecords", () => {
  it("plans an on-hand change and skips stale compare values", () => {
    const level = snapshot();
    const fresh = matchInventoryImportRecords({
      records: [
        {
          rowNumber: 2,
          handle: "tee",
          title: "Tee",
          option1: "S",
          option2: "",
          option3: "",
          sku: "TEE-S",
          locationName: "Main",
          onHandCurrent: 10,
          onHandNew: 15,
        },
      ],
      levels: [level],
    });
    expect(fresh.rows[0]).toMatchObject({ skipped: false, onHandBefore: 10, onHandAfter: 15 });

    const stale = matchInventoryImportRecords({
      records: [
        {
          rowNumber: 2,
          handle: "tee",
          title: "Tee",
          option1: "S",
          option2: "",
          option3: "",
          sku: "TEE-S",
          locationName: "Main",
          onHandCurrent: 9,
          onHandNew: 15,
        },
      ],
      levels: [level],
    });
    expect(stale.rows[0]?.skipReason).toBe("stale_on_hand");
  });
});

describe("buildInventoryExportCsv", () => {
  it("emits official All states headers with blank On hand (new)", () => {
    const csv = buildInventoryExportCsv([snapshot()]);
    const [header, row] = csv.trim().split("\n");
    expect(header).toContain("On hand (current)");
    expect(header).toContain("On hand (new)");
    expect(row?.split(",").at(-1)).toBe("");
  });
});
