import type { RawShopifyProductForCatalog } from "../productFetcher.server";
import { stripHtml } from "../productFetcher.server";

/**
 * TikTok Catalog feed CSV row（product/file 文件上传）。
 * 字段名与枚举对齐 `tiktok_catalogues_template.csv`，不同于 JSON product/upload。
 */
export interface TiktokFeedCsvRow {
  sku_id: string;
  title: string;
  description: string;
  availability: "In stock" | "Out of stock" | "Preorder";
  condition: "New" | "Refurbished" | "Used";
  /** 例：`19.99 USD` */
  price: string;
  link: string;
  image_link: string;
  brand: string;
  additional_image_link?: string;
  item_group_id?: string;
  google_product_category?: string;
  product_type?: string;
  gtin?: string;
}

export interface MappedTiktokFeedEntry {
  productId: string;
  ok: true;
  row: TiktokFeedCsvRow;
}

export interface MappedTiktokFeedSkip {
  productId: string;
  ok: false;
  reason: string;
}

export type MappedTiktokFeedResult = MappedTiktokFeedEntry | MappedTiktokFeedSkip;

const FEED_CSV_HEADERS = [
  "sku_id",
  "title",
  "description",
  "availability",
  "condition",
  "price",
  "link",
  "image_link",
  "brand",
  "additional_image_link",
  "item_group_id",
  "google_product_category",
  "product_type",
  "gtin",
] as const;

export function mapShopifyToTiktokFeedCsv(
  product: RawShopifyProductForCatalog,
  context: { shopDomain: string; defaultCurrency?: string; brand?: string },
): MappedTiktokFeedResult {
  if (!product.title) {
    return { productId: product.id, ok: false, reason: "missing title" };
  }

  const link =
    product.onlineStoreUrl ??
    (product.handle ? `https://${context.shopDomain}/products/${product.handle}` : null);
  if (!link) {
    return { productId: product.id, ok: false, reason: "missing product link" };
  }

  const imageLink = product.featuredImage?.url ?? product.images[0]?.url ?? null;
  if (!imageLink) {
    return { productId: product.id, ok: false, reason: "missing image" };
  }

  const priceAmount = product.priceAmount;
  const priceCurrency = product.priceCurrency ?? context.defaultCurrency;
  if (!priceAmount || !priceCurrency) {
    return { productId: product.id, ok: false, reason: "missing price" };
  }

  const brand = (product.vendor || context.brand || "").trim();
  if (!brand) {
    return { productId: product.id, ok: false, reason: "missing brand" };
  }

  const inStock =
    product.availableForSale === true ||
    (product.inventoryQuantity != null && product.inventoryQuantity > 0);

  const description = stripHtml(product.descriptionHtml).slice(0, 9990) || product.title;
  const additionalImages = product.images
    .map((img) => img.url)
    .filter((url): url is string => Boolean(url) && url !== imageLink)
    .slice(0, 10);
  const categoryPath = resolveTiktokCategoryPath(product);
  const price = `${Number(Number(priceAmount).toFixed(2))} ${priceCurrency.toUpperCase()}`;

  const row: TiktokFeedCsvRow = {
    sku_id: product.sku || extractNumericId(product.id),
    title: product.title.slice(0, 500),
    description: description.slice(0, 10000),
    availability: inStock ? "In stock" : "Out of stock",
    condition: "New",
    price,
    link,
    image_link: imageLink,
    brand: brand.slice(0, 150),
    item_group_id: extractNumericId(product.id),
  };

  if (additionalImages.length > 0) {
    row.additional_image_link = additionalImages.join(",");
  }
  if (categoryPath) {
    row.google_product_category = categoryPath;
    row.product_type = categoryPath;
  }
  if (product.barcode) {
    row.gtin = product.barcode;
  }

  return { productId: product.id, ok: true, row };
}

/** 生成 UTF-8 CSV 文本（含表头），正确转义逗号/引号/换行。 */
export function buildTiktokFeedCsv(rows: TiktokFeedCsvRow[]): string {
  const lines = [FEED_CSV_HEADERS.join(",")];
  for (const row of rows) {
    const cells = FEED_CSV_HEADERS.map((header) => escapeCsvCell(row[header] ?? ""));
    lines.push(cells.join(","));
  }
  return `${lines.join("\n")}\n`;
}

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function extractNumericId(gid: string): string {
  const match = /\/(\d+)$/.exec(gid);
  return match ? match[1] : gid;
}

function resolveTiktokCategoryPath(product: RawShopifyProductForCatalog): string | null {
  const candidates = [
    product.googleProductCategory,
    product.productType,
    product.shopifyCategory?.fullName,
    product.shopifyCategory?.name,
    product.vendor,
  ];
  for (const raw of candidates) {
    const value = raw?.trim();
    if (value) return value.slice(0, 250);
  }
  return null;
}
