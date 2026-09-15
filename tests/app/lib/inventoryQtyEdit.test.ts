import { describe, expect, it } from "vitest";
import {
  buildInventoryQtySummary,
  computeInventoryQtyChange,
  parseInventoryQtyRule,
  snapshotsForLocation,
  type InventoryLevelSnapshot,
  type InventoryQtyRule,
} from "../../../app/lib/inventoryQtyEdit";

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
    available: 10,
    onHand: 12,
    committed: 2,
    incoming: 0,
    ...overrides,
  };
}

const setRule: InventoryQtyRule = {
  mode: "set",
  locationId: "gid://shopify/Location/1",
  locationName: "Main",
  quantity: 4,
  direction: null,
  amount: null,
};

describe("parseInventoryQtyRule", () => {
  it("requires a location GID", () => {
    expect(() => parseInventoryQtyRule({ quantity: "4" }, "set")).toThrow("请选择库存地点");
  });

  it("parses set / adjust / zero", () => {
    expect(
      parseInventoryQtyRule(
        { locationId: "gid://shopify/Location/1", quantity: "8" },
        "set",
      ).quantity,
    ).toBe(8);
    expect(
      parseInventoryQtyRule(
        { locationId: "gid://shopify/Location/1", direction: "down", amount: "3" },
        "adjust",
      ),
    ).toMatchObject({ direction: "down", amount: 3 });
    expect(
      parseInventoryQtyRule({ locationId: "gid://shopify/Location/1" }, "zero").quantity,
    ).toBe(0);
  });
});

describe("computeInventoryQtyChange", () => {
  it("sets, adjusts and zeros available", () => {
    expect(computeInventoryQtyChange(snapshot(), setRule)).toMatchObject({
      availableAfter: 4,
      delta: -6,
      skipped: false,
    });
    expect(
      computeInventoryQtyChange(snapshot(), {
        ...setRule,
        mode: "adjust",
        quantity: null,
        direction: "up",
        amount: 5,
      }),
    ).toMatchObject({ availableAfter: 15, delta: 5 });
    expect(
      computeInventoryQtyChange(snapshot(), { ...setRule, mode: "zero", quantity: 0 }),
    ).toMatchObject({ availableAfter: 0, delta: -10 });
  });

  it("skips untracked, gift cards, unstocked and negative results", () => {
    expect(computeInventoryQtyChange(snapshot({ tracked: false }), setRule).skipReason).toBe(
      "inventory_untracked",
    );
    expect(computeInventoryQtyChange(snapshot({ isGiftCard: true }), setRule).skipReason).toBe(
      "gift_card",
    );
    expect(computeInventoryQtyChange(snapshot({ stocked: false }), setRule).skipReason).toBe(
      "not_stocked",
    );
    expect(
      computeInventoryQtyChange(snapshot({ available: 2 }), {
        ...setRule,
        mode: "adjust",
        quantity: null,
        direction: "down",
        amount: 5,
      }).skipReason,
    ).toBe("negative_not_allowed");
    expect(computeInventoryQtyChange(snapshot({ available: 4 }), setRule).skipReason).toBe("no_change");
  });
});

describe("snapshotsForLocation", () => {
  it("fills a not-stocked placeholder when the variant has no level at that location", () => {
    const rows = snapshotsForLocation(
      [snapshot({ locationId: "gid://shopify/Location/2", locationName: "Other" })],
      "gid://shopify/Location/1",
      "Main",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ locationId: "gid://shopify/Location/1", stocked: false });
  });
});

describe("buildInventoryQtySummary", () => {
  it("counts changed and skipped rows", () => {
    const rows = [
      computeInventoryQtyChange(snapshot(), setRule),
      computeInventoryQtyChange(snapshot({ tracked: false, variantId: "v2" }), setRule),
    ];
    expect(buildInventoryQtySummary(rows)).toEqual({
      products: 1,
      rows: 2,
      changed: 1,
      skipped: 1,
    });
  });
});
