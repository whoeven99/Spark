import { describe, expect, it } from "vitest";
import { enrichSessionSnapshotFromShopInfo } from "../../../../app/server/notifications/enrichSessionSnapshotFromShopInfo.server";

const SHOP = "demo.myshopify.com";

describe("enrichSessionSnapshotFromShopInfo", () => {
  it("fills email and name from shopInfo when snapshot is null", () => {
    const result = enrichSessionSnapshotFromShopInfo(null, {
      contactEmail: "store@example.com",
      ownerName: "Jane Shop",
    }, SHOP);

    expect(result).toEqual({
      shop: SHOP,
      email: "store@example.com",
      firstName: "Jane",
      lastName: "Shop",
    });
  });

  it("prefers contactEmail over shop email", () => {
    const result = enrichSessionSnapshotFromShopInfo(
      null,
      { contactEmail: "contact@shop.com", email: "other@shop.com" },
      SHOP,
    );

    expect(result?.email).toBe("contact@shop.com");
  });

  it("does not override existing session email", () => {
    const result = enrichSessionSnapshotFromShopInfo(
      { shop: SHOP, email: "staff@example.com", firstName: "Staff" },
      { contactEmail: "store@example.com", ownerName: "Store Owner" },
      SHOP,
    );

    expect(result).toEqual({
      shop: SHOP,
      email: "staff@example.com",
      firstName: "Staff",
    });
  });

  it("fills firstName from ownerName when missing", () => {
    const result = enrichSessionSnapshotFromShopInfo(
      { shop: SHOP, email: "store@example.com" },
      { ownerName: "Bob Builder" },
      SHOP,
    );

    expect(result).toEqual({
      shop: SHOP,
      email: "store@example.com",
      firstName: "Bob",
      lastName: "Builder",
    });
  });

  it("returns null when snapshot and shopInfo are both empty", () => {
    expect(enrichSessionSnapshotFromShopInfo(null, null, SHOP)).toBeNull();
  });
});
