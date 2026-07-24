import { describe, expect, it } from "vitest";
import {
  parseInventoryEnrichmentFromGraphql,
  parseShopifyNumericId,
} from "../../../../../app/server/shopify/sync/inventorySyncParse.server";

describe("parseShopifyNumericId", () => {
  it("extracts numeric id from Shopify GID", () => {
    expect(parseShopifyNumericId("gid://shopify/ProductVariant/45990151258135")).toBe(
      "45990151258135",
    );
  });

  it("strips query string suffix from GID segment", () => {
    expect(
      parseShopifyNumericId(
        "gid://shopify/InventoryLevel/523463154?inventory_item_id=30322695",
      ),
    ).toBe("523463154");
  });

  it("returns null for empty input", () => {
    expect(parseShopifyNumericId(null)).toBeNull();
    expect(parseShopifyNumericId(undefined)).toBeNull();
    expect(parseShopifyNumericId("")).toBeNull();
  });
});

describe("parseInventoryEnrichmentFromGraphql", () => {
  it("parses variants.nodes[0] enrichment payload", () => {
    const enrichment = parseInventoryEnrichmentFromGraphql({
      sku: "1",
      variants: {
        nodes: [
          {
            id: "gid://shopify/ProductVariant/87654321",
            title: "Acrylic / Beige / Handheld",
            product: {
              id: "gid://shopify/Product/12345678",
              title: "CARISPIBET Home Sign",
            },
          },
        ],
      },
      inventoryLevel: {
        location: { name: "Main Warehouse" },
        quantities: [
          { name: "available", quantity: 2 },
          { name: "committed", quantity: 2 },
          { name: "on_hand", quantity: 4 },
        ],
      },
    });

    expect(enrichment).toEqual({
      sku: "1",
      variantId: "87654321",
      productId: "12345678",
      productTitle: "CARISPIBET Home Sign",
      variantTitle: "Acrylic / Beige / Handheld",
      locationName: "Main Warehouse",
      quantities: {
        available: 2,
        committed: 2,
        on_hand: 4,
      },
    });
  });

  it("returns null when inventory item is missing", () => {
    expect(parseInventoryEnrichmentFromGraphql(null)).toBeNull();
    expect(parseInventoryEnrichmentFromGraphql(undefined)).toBeNull();
  });

  it("handles missing variant nodes with sku-only enrichment", () => {
    const enrichment = parseInventoryEnrichmentFromGraphql({
      sku: "A2504",
      variants: { nodes: [] },
      inventoryLevel: {
        quantities: [{ name: "available", quantity: 0 }],
      },
    });

    expect(enrichment).toEqual({
      sku: "A2504",
      variantId: null,
      productId: null,
      productTitle: null,
      variantTitle: null,
      locationName: null,
      quantities: { available: 0 },
    });
  });
});
