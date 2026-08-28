import type { TFunction } from "i18next";
import type { ShopifyObjectItem, ShopifyObjectKind } from "./shopifyObjectTypes";

const PICKER = "workspace.shell.contextPicker";

export function shopifyObjectStatusText(item: ShopifyObjectItem, t: TFunction): string {
  return t(`${PICKER}.status.${item.statusLabel}`, { defaultValue: item.statusLabel });
}

export function shopifyObjectTitle(
  item: ShopifyObjectItem,
  kind: ShopifyObjectKind,
  t: TFunction,
): string {
  if (item.title.trim()) return item.title;
  return kind === "product" ? t(`${PICKER}.untitledProduct`) : t(`${PICKER}.untitledArticle`);
}

export function shopifyObjectMetaText(item: ShopifyObjectItem, t: TFunction): string {
  if (typeof item.inventory === "number") {
    const price = item.meta.trim() || t(`${PICKER}.priceUnknown`);
    return t(`${PICKER}.productMeta`, { price, count: item.inventory });
  }
  return item.meta;
}

export function translatePickerError(errorText: string | null, t: TFunction): string | null {
  if (!errorText) return null;
  if (errorText === "NETWORK") return t(`${PICKER}.networkError`);
  if (errorText.startsWith("HTTP:")) {
    return t(`${PICKER}.requestFailed`, { status: errorText.slice(5) });
  }
  return t(`${PICKER}.loadFailed`);
}
