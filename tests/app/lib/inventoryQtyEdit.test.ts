import { describe, expect, it } from "vitest";
import {
  InventoryQtyEditRuleError,
  buildInventoryQtyEditSummary,
  computeInventoryQtyChange,
  parseInventoryQtyEditRule,
  type InventoryQtyEditRule,
  type InventoryQtyLevelInput,
} from "../../../app/lib/inventoryQtyEdit";

const rule = (overrides: Partial<InventoryQtyEditRule> = {}): InventoryQtyEditRule => ({
  mode: "set",
  value: 10,
  locationId: "gid://shopify/Location/1",
  locationName: "Shop location",
  allWritableLocations: false,
  ...overrides,
});

const level = (overrides: Partial<InventoryQtyLevelInput> = {}): InventoryQtyLevelInput => ({
  variantId: "gid://shopify/ProductVariant/1",
  productId: "gid://shopify/Product/1",
  productTitle: "Mug",
  variantTitle: "Default",
  sku: "MUG-1",
  inventoryItemId: "gid://shopify/InventoryItem/1",
  tracked: true,
  locationId: "gid://shopify/Location/1",
  locationName: "Shop location",
  writable: true,
  stocked: true,
  available: 4,
  onHand: 6,
  committed: 2,
  ...overrides,
});

describe("parseInventoryQtyEditRule", () => {
  it("parses set / adjust / clear", () => {
    expect(
      parseInventoryQtyEditRule({
        mode: "set",
        qtyValue: "8",
        location: "gid://shopify/Location/1",
        locationName: "Shop location",
      }),
    ).toMatchObject({ mode: "set", value: 8 });
    expect(
      parseInventoryQtyEditRule({
        mode: "adjust",
        qtyValue: "-2",
        locationId: "gid://shopify/Location/1",
      }),
    ).toMatchObject({ mode: "adjust", value: -2 });
    expect(
      parseInventoryQtyEditRule({
        mode: "clear",
        clearAck: "true",
        location: "gid://shopify/Location/1",
      }),
    ).toMatchObject({ mode: "clear", value: 0 });
  });

  it("requires a location unless all writable warehouses are selected", () => {
    expect(() => parseInventoryQtyEditRule({ mode: "set", qtyValue: "1" })).toThrow(
      InventoryQtyEditRuleError,
    );
    expect(
      parseInventoryQtyEditRule({
        mode: "set",
        qtyValue: "1",
        allWritableLocations: "true",
      }).allWritableLocations,
    ).toBe(true);
  });

  it("rejects clear without acknowledgement and negative set", () => {
    expect(() =>
      parseInventoryQtyEditRule({
        mode: "clear",
        location: "gid://shopify/Location/1",
      }),
    ).toThrow(/清零/);
    expect(() =>
      parseInventoryQtyEditRule({
        mode: "set",
        qtyValue: "-1",
        location: "gid://shopify/Location/1",
      }),
    ).toThrow(InventoryQtyEditRuleError);
  });
});

describe("computeInventoryQtyChange", () => {
  it("sets available without touching on-hand", () => {
    const row = computeInventoryQtyChange(level(), rule({ value: 10 }));
    expect(row.skipped).toBe(false);
    expect(row.afterAvailable).toBe(10);
    expect(row.beforeAvailable).toBe(4);
  });

  it("clears available to 0 even when committed units remain on hand", () => {
    const row = computeInventoryQtyChange(level({ available: 4, onHand: 6, committed: 2 }), rule({ mode: "clear", value: 0 }));
    expect(row.skipped).toBe(false);
    expect(row.afterAvailable).toBe(0);
  });

  it("skips untracked, read-only, unstocked, no-change, and negative results", () => {
    expect(computeInventoryQtyChange(level({ tracked: false }), rule()).skipReason).toBe("untracked");
    expect(computeInventoryQtyChange(level({ writable: false }), rule()).skipReason).toBe(
      "location_not_writable",
    );
    expect(computeInventoryQtyChange(level({ stocked: false }), rule()).skipReason).toBe("not_stocked");
    expect(computeInventoryQtyChange(level({ available: 10 }), rule({ value: 10 })).skipReason).toBe(
      "no_change",
    );
    expect(
      computeInventoryQtyChange(level({ available: 1 }), rule({ mode: "adjust", value: -3 })).skipReason,
    ).toBe("would_go_negative");
  });
});

describe("buildInventoryQtyEditSummary", () => {
  it("counts changed vs skipped", () => {
    const rows = [
      computeInventoryQtyChange(level(), rule({ value: 9 })),
      computeInventoryQtyChange(level({ tracked: false }), rule({ value: 9 })),
    ];
    expect(buildInventoryQtyEditSummary(rows)).toEqual({
      products: 1,
      variants: 2,
      changed: 1,
      skipped: 1,
    });
  });
});
