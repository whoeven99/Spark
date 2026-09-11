/**
 * 已选商品导出 — Shopify CSV / TikTok feed CSV。纯算，不含 IO。
 */
import { toCsv } from "./csv";

export const PRODUCT_EXPORT_MAX_PRODUCTS = 200;

/** 原生商品 CSV 最多 250 张图；查询 cost 按 `first` 计，读侧必须把 products.pageSize 压到 2。 */
export const PRODUCT_EXPORT_MAX_IMAGES = 250;
export const PRODUCT_EXPORT_MAX_VARIANTS = 100;
export const PRODUCT_EXPORT_GRAPHQL_PAGE_SIZE = 2;

export const PRODUCT_EXPORT_FORMATS = ["shopify_csv", "tiktok_csv"] as const;
export type ProductExportFormat = (typeof PRODUCT_EXPORT_FORMATS)[number];

export type ProductExportRule = {
  format: ProductExportFormat;
};

export class ProductExportRuleError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ProductExportRuleError";
    this.code = code;
  }
}

export function parseProductExportRule(params: Record<string, string>): ProductExportRule {
  const format = (params.exportFormat ?? params.format ?? "shopify_csv").trim();
  if (!(PRODUCT_EXPORT_FORMATS as readonly string[]).includes(format)) {
    throw new ProductExportRuleError(
      "invalid_format",
      "请选择导出格式：Shopify CSV 或 TikTok Feed CSV",
    );
  }
  return { format: format as ProductExportFormat };
}

export type ProductExportShopifyImage = {
  src: string;
  altText: string;
};

export type ProductExportShopifyVariant = {
  sku: string;
  barcode: string;
  price: string;
  compareAtPrice: string;
  option1Name: string;
  option1Value: string;
  option1LinkedTo: string;
  option2Name: string;
  option2Value: string;
  option2LinkedTo: string;
  option3Name: string;
  option3Value: string;
  option3LinkedTo: string;
  grams: string;
  inventoryTracker: string;
  inventoryQty: string;
  inventoryPolicy: string;
  fulfillmentService: string;
  requiresShipping: boolean;
  taxable: boolean;
  variantImageSrc: string;
  weightUnit: string;
  taxCode: string;
  cost: string;
};

export type ProductExportShopifyProduct = {
  handle: string;
  title: string;
  bodyHtml: string;
  vendor: string;
  productCategory: string;
  productType: string;
  tags: string;
  published: boolean;
  giftCard: boolean;
  status: string;
  seoTitle: string;
  seoDescription: string;
  images: ProductExportShopifyImage[];
  variants: ProductExportShopifyVariant[];
};

/** 与 Shopify Admin 原生商品 CSV 表头一致（不含 Markets / Google Shopping / Metafield 动态列）。 */
export const SHOPIFY_CSV_HEADERS = [
  "Handle",
  "Title",
  "Body (HTML)",
  "Vendor",
  "Product Category",
  "Type",
  "Tags",
  "Published",
  "Option1 Name",
  "Option1 Value",
  "Option1 Linked To",
  "Option2 Name",
  "Option2 Value",
  "Option2 Linked To",
  "Option3 Name",
  "Option3 Value",
  "Option3 Linked To",
  "Variant SKU",
  "Variant Grams",
  "Variant Inventory Tracker",
  "Variant Inventory Qty",
  "Variant Inventory Policy",
  "Variant Fulfillment Service",
  "Variant Price",
  "Variant Compare At Price",
  "Variant Requires Shipping",
  "Variant Taxable",
  "Variant Barcode",
  "Image Src",
  "Image Position",
  "Image Alt Text",
  "Gift Card",
  "SEO Title",
  "SEO Description",
  "Variant Image",
  "Variant Weight Unit",
  "Variant Tax Code",
  "Cost per item",
  "Status",
] as const;

export function shopifyWeightToGrams(value: number, unit: string): string {
  const normalized = unit.trim().toUpperCase();
  const grams =
    normalized === "KILOGRAMS" || normalized === "KG"
      ? value * 1000
      : normalized === "POUNDS" || normalized === "LB"
        ? value * 453.59237
        : normalized === "OUNCES" || normalized === "OZ"
          ? value * 28.349523125
          : value;
  return String(Math.round(grams));
}

export function shopifyWeightUnitCsv(unit: string): string {
  switch (unit.trim().toUpperCase()) {
    case "KILOGRAMS":
    case "KG":
      return "kg";
    case "POUNDS":
    case "LB":
      return "lb";
    case "OUNCES":
    case "OZ":
      return "oz";
    case "GRAMS":
    case "G":
      return "g";
    default:
      return "kg";
  }
}

export function optionLinkedToCsv(namespace?: string | null, key?: string | null): string {
  const ns = namespace?.trim() ?? "";
  const optionKey = key?.trim() ?? "";
  if (!ns || !optionKey) return "";
  return `product.metafields.${ns}.${optionKey}`;
}

function csvBool(value: boolean): string {
  return value ? "TRUE" : "FALSE";
}

function shopifyProductCsvCells(input: {
  handle: string;
  product?: ProductExportShopifyProduct;
  variant?: ProductExportShopifyVariant;
  imageSrc?: string;
  imagePosition?: string;
  imageAltText?: string;
}): string[] {
  const product = input.product;
  const variant = input.variant;
  return [
    input.handle,
    product?.title ?? "",
    product?.bodyHtml ?? "",
    product?.vendor ?? "",
    product?.productCategory ?? "",
    product?.productType ?? "",
    product?.tags ?? "",
    product ? csvBool(product.published) : "",
    variant?.option1Name ?? "",
    variant?.option1Value ?? "",
    variant?.option1LinkedTo ?? "",
    variant?.option2Name ?? "",
    variant?.option2Value ?? "",
    variant?.option2LinkedTo ?? "",
    variant?.option3Name ?? "",
    variant?.option3Value ?? "",
    variant?.option3LinkedTo ?? "",
    variant?.sku ?? "",
    variant?.grams ?? "",
    variant?.inventoryTracker ?? "",
    variant?.inventoryQty ?? "",
    variant?.inventoryPolicy ?? "",
    variant?.fulfillmentService ?? "",
    variant?.price ?? "",
    variant?.compareAtPrice ?? "",
    variant ? csvBool(variant.requiresShipping) : "",
    variant ? csvBool(variant.taxable) : "",
    variant?.barcode ?? "",
    input.imageSrc ?? "",
    input.imagePosition ?? "",
    input.imageAltText ?? "",
    product ? csvBool(product.giftCard) : "",
    product?.seoTitle ?? "",
    product?.seoDescription ?? "",
    variant?.variantImageSrc ?? "",
    variant?.weightUnit ?? "",
    variant?.taxCode ?? "",
    variant?.cost ?? "",
    product ? product.status.toLowerCase() : "",
  ];
}

function buildShopifyProductRows(product: ProductExportShopifyProduct): string[][] {
  const variants = product.variants.length > 0 ? product.variants : [undefined];
  const rows: string[][] = [];
  variants.forEach((variant, index) => {
    const image = index === 0 ? product.images[0] : undefined;
    rows.push(
      shopifyProductCsvCells({
        handle: product.handle,
        product: index === 0 ? product : undefined,
        variant,
        imageSrc: image?.src,
        imagePosition: image ? "1" : undefined,
        imageAltText: image?.altText,
      }),
    );
  });
  for (let index = 1; index < product.images.length; index += 1) {
    const image = product.images[index];
    rows.push(
      shopifyProductCsvCells({
        handle: product.handle,
        imageSrc: image.src,
        imagePosition: String(index + 1),
        imageAltText: image.altText,
      }),
    );
  }
  return rows;
}

export function buildShopifyProductCsv(products: ProductExportShopifyProduct[]): string {
  const rows: string[][] = [];
  for (const product of products) {
    rows.push(...buildShopifyProductRows(product));
  }
  return toCsv(SHOPIFY_CSV_HEADERS, rows);
}

export type ProductExportSkip = {
  productId: string;
  productTitle: string;
  reason: string;
};

export type ProductExportSummary = {
  products: number;
  exported: number;
  skipped: number;
  format: ProductExportFormat;
};

export const PRODUCT_EXPORT_SKIP_REASON_CODES = [
  "missing_title",
  "missing_link",
  "missing_image",
  "missing_price",
  "missing_brand",
] as const;

const TIKTOK_SKIP_REASON_TO_CODE: Record<string, string> = {
  "missing title": "missing_title",
  "missing product link": "missing_link",
  "missing image": "missing_image",
  "missing price": "missing_price",
  "missing brand": "missing_brand",
};

/** 把 TikTok mapper 英文原因收成稳定码，已是码则原样返回。 */
export function normalizeProductExportSkipReason(reason: string): string {
  const trimmed = reason.trim();
  if (!trimmed) return trimmed;
  if ((PRODUCT_EXPORT_SKIP_REASON_CODES as readonly string[]).includes(trimmed)) return trimmed;
  return TIKTOK_SKIP_REASON_TO_CODE[trimmed] ?? trimmed;
}

export function buildProductExportSkipCsv(
  skips: ProductExportSkip[],
  reasonLabel: (reason: string) => string = (reason) => reason,
): string {
  return toCsv(
    ["product_title", "product_id", "reason"] as const,
    skips.map((row) => [row.productTitle, row.productId, reasonLabel(row.reason)]),
  );
}
