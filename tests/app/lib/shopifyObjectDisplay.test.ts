import { describe, expect, it } from "vitest";
import { describeObjectQueryI18n } from "../../../app/lib/objectQuerySpec";
import {
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
