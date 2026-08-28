import type { TFunction } from "i18next";
import type { ContextResourceItem } from "./contextResourceTypes";
import type { ShopifyObjectItem, ShopifyObjectKind } from "./shopifyObjectTypes";

const PICKER = "workspace.shell.contextPicker";

function formatIsoDate(value: string): string {
  const isoDate = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoDate) return isoDate[1];
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

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

export function contextResourceTitle(item: ContextResourceItem, t: TFunction): string {
  if (item.title.trim()) return item.title;
  if (item.type === "order") return t(`${PICKER}.untitledOrder`);
  if (item.type === "article") return t(`${PICKER}.untitledArticle`);
  return t(`${PICKER}.untitledProduct`);
}

export function contextResourceMetaText(item: ContextResourceItem, t: TFunction): string {
  if (item.type === "order") {
    const { totalPrice, currencyCode, createdAt } = item.promptSummary;
    const price = totalPrice && currencyCode ? `${totalPrice} ${currencyCode}` : null;
    const date = createdAt ? formatIsoDate(createdAt) : null;
    if (price && date) return t(`${PICKER}.orderMeta`, { price, date });
    if (date) return t(`${PICKER}.orderCreatedAt`, { date });
    if (price) return price;
    return t(`${PICKER}.noMoreInfo`);
  }
  if (item.type === "product") {
    const inventory = item.promptSummary.totalInventory;
    const price = item.promptSummary.priceRange?.trim() || item.meta.trim();
    if (typeof inventory === "number") {
      return t(`${PICKER}.productMeta`, {
        price: price || t(`${PICKER}.priceUnknown`),
        count: inventory,
      });
    }
    return price || t(`${PICKER}.noMoreInfo`);
  }
  const publishedAt = item.promptSummary.publishedAt;
  const date = publishedAt ? formatIsoDate(publishedAt) : null;
  if (date) return t(`${PICKER}.articlePublishedAt`, { date });
  return item.meta.trim() || t(`${PICKER}.noMoreInfo`);
}
