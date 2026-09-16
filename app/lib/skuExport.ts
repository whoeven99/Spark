/**
 * 导出 SKU 瘦表：变体身份对照，不含价格/图片/库存数量。纯算。
 */
import { toCsv } from "./csv";

export const SKU_EXPORT_SKILL_ID = "sku_export";
export const SKU_EXPORT_MAX_PRODUCTS = 200;
export const SKU_EXPORT_MAX_VARIANTS = 2000;

export const SKU_EXPORT_HEADERS = [
  "Handle",
  "Title",
  "Variant ID",
  "Option1 Name",
  "Option1 Value",
  "Option2 Name",
  "Option2 Value",
  "Option3 Name",
  "Option3 Value",
  "SKU",
  "Barcode",
  "Weight",
  "Weight Unit",
] as const;

export type SkuExportVariant = {
  productId: string;
  handle: string;
  title: string;
  variantId: string;
  option1Name: string;
  option1Value: string;
  option2Name: string;
  option2Value: string;
  option3Name: string;
  option3Value: string;
  sku: string;
  barcode: string;
  weight: string;
  weightUnit: string;
};

export type SkuExportSkip = {
  productId: string;
  productTitle: string;
  reason: "duplicate_sku";
  sku: string;
};

export function buildSkuExportCsv(rows: SkuExportVariant[]): string {
  return toCsv(
    SKU_EXPORT_HEADERS,
    rows.map((row) => [
      row.handle,
      row.title,
      row.variantId,
      row.option1Name,
      row.option1Value,
      row.option2Name,
      row.option2Value,
      row.option3Name,
      row.option3Value,
      row.sku,
      row.barcode,
      row.weight,
      row.weightUnit,
    ]),
  );
}

export function findDuplicateSkuWarnings(rows: SkuExportVariant[]): SkuExportSkip[] {
  const bySku = new Map<string, SkuExportVariant[]>();
  for (const row of rows) {
    const key = row.sku.trim().toLowerCase();
    if (!key) continue;
    const list = bySku.get(key) ?? [];
    list.push(row);
    bySku.set(key, list);
  }
  const skips: SkuExportSkip[] = [];
  for (const [sku, list] of bySku) {
    if (list.length < 2) continue;
    for (const row of list) {
      skips.push({
        productId: row.productId,
        productTitle: row.title,
        reason: "duplicate_sku",
        sku,
      });
    }
  }
  return skips;
}

export function buildSkuExportSkipCsv(rows: SkuExportSkip[]): string {
  return toCsv(
    ["Product ID", "Title", "SKU", "Reason"],
    rows.map((row) => [row.productId, row.productTitle, row.sku, row.reason]),
  );
}
