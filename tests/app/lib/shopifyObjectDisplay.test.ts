import { describe, expect, it } from "vitest";
import { describeObjectQueryI18n } from "../../../app/lib/objectQuerySpec";
import {
  contextResourceMetaText,
  contextResourceTitle,
  shopifyObjectMetaText,
  shopifyObjectStatusText,
  shopifyObjectTitle,
} from "../../../app/lib/shopifyObjectDisplay";
import type { ShopifyObjectItem } from "../../../app/lib/shopifyObjectTypes";
import type { TFunction } from "i18next";

function fakeT(catalog: Record<string, string>): TFunction {
  const t = ((key: string, options?: Record<string, unknown>) => {
    let value = catalog[key] ?? key;
    if (options) {
      for (const [name, raw] of Object.entries(options)) {
        if (name === "defaultValue") continue;
        value = value.replaceAll(`{{${name}}}`, String(raw));
      }
    }
    return value;
  }) as TFunction;
  return t;
}

describe("describeObjectQueryI18n", () => {
  it("translates product filters with the locale catalog", () => {
    const t = fakeT({
      "workspace.shell.contextPicker.kindProduct": "products",
      "workspace.shell.contextPicker.status.active": "Active",
      "workspace.shell.contextPicker.queryStatus": "Status {{status}}",
      "workspace.shell.contextPicker.queryInventory": "Inventory ≤ {{count}}",
      "workspace.shell.contextPicker.queryJoin": "; ",
    });

    expect(
      describeObjectQueryI18n({ kind: "product", status: "active", maxInventory: 10 }, t),
    ).toBe("Status Active; Inventory ≤ 10");
  });
});

describe("shopifyObjectDisplay", () => {
  const t = fakeT({
    "workspace.shell.contextPicker.status.active": "Active",
    "workspace.shell.contextPicker.untitledProduct": "Untitled product",
    "workspace.shell.contextPicker.priceUnknown": "Price unavailable",
    "workspace.shell.contextPicker.productMeta": "{{price}} · Inventory {{count}}",
  });

  const item: ShopifyObjectItem = {
    id: "gid://shopify/Product/1",
    title: "",
    subtitle: "shop / active",
    meta: "20.0 EUR",
    imageUrl: null,
    statusLabel: "active",
    statusTone: "positive",
    inventory: 4,
  };

  it("formats status, title fallback, and inventory meta", () => {
    expect(shopifyObjectStatusText(item, t)).toBe("Active");
    expect(shopifyObjectTitle(item, "product", t)).toBe("Untitled product");
    expect(shopifyObjectMetaText(item, t)).toBe("20.0 EUR · Inventory 4");
  });
});

describe("contextResourceDisplay", () => {
  const t = fakeT({
    "workspace.shell.contextPicker.untitledOrder": "Untitled order",
    "workspace.shell.contextPicker.orderMeta": "{{price}} · Created {{date}}",
    "workspace.shell.contextPicker.orderCreatedAt": "Created {{date}}",
    "workspace.shell.contextPicker.noMoreInfo": "No more details",
    "workspace.shell.contextPicker.productMeta": "{{price}} · Inventory {{count}}",
    "workspace.shell.contextPicker.priceUnknown": "Price unavailable",
    "workspace.shell.contextPicker.articlePublishedAt": "Published {{date}}",
  });

  it("formats order created-at with locale, not server Chinese", () => {
    expect(
      contextResourceMetaText(
        {
          id: "gid://shopify/Order/1",
          type: "order",
          title: "#1122",
          subtitle: "REFUNDED / UNFULFILLED",
          meta: "46.92 EUR",
          status: "REFUNDED",
          imageUrl: null,
          promptSummary: {
            id: "gid://shopify/Order/1",
            name: "#1122",
            createdAt: "2026-08-10T12:00:00Z",
            customerName: null,
            totalPrice: "46.92",
            currencyCode: "EUR",
            financialStatus: "REFUNDED",
            fulfillmentStatus: "UNFULFILLED",
            tags: [],
            lineItemsSummary: [],
          },
        },
        t,
      ),
    ).toBe("46.92 EUR · Created 2026-08-10");
  });

  it("falls back to untitled order", () => {
    expect(
      contextResourceTitle(
        {
          id: "gid://shopify/Order/1",
          type: "order",
          title: "  ",
          subtitle: "",
          meta: "",
          status: null,
          imageUrl: null,
          promptSummary: {
            id: "gid://shopify/Order/1",
            name: "",
            createdAt: null,
            customerName: null,
            totalPrice: null,
            currencyCode: null,
            financialStatus: null,
            fulfillmentStatus: null,
            tags: [],
            lineItemsSummary: [],
          },
        },
        t,
      ),
    ).toBe("Untitled order");
  });
});
