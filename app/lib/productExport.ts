/**
 * 已选商品导出 — Shopify CSV / TikTok feed CSV。纯算，不含 IO。
 */
import { toCsv } from "./csv";

export const PRODUCT_EXPORT_MAX_PRODUCTS = 200;

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

export type ProductExportShopifyVariant = {
  sku: string;
  barcode: string;
  price: string;
  compareAtPrice: string;
  option1Name: string;
  option1Value: string;
  option2Name: string;
  option2Value: string;
  option3Name: string;
  option3Value: string;
};

export type ProductExportShopifyProduct = {
  handle: string;
  title: string;
  bodyHtml: string;
  vendor: string;
  productType: string;
  tags: string;
  published: boolean;
  status: string;
  seoTitle: string;
  seoDescription: string;
  imageSrc: string;
  variants: ProductExportShopifyVariant[];
};

const SHOPIFY_CSV_HEADERS = [
  "Handle",
  "Title",
  "Body (HTML)",
  "Vendor",
  "Type",
  "Tags",
  "Published",
  "Option1 Name",
  "Option1 Value",
  "Option2 Name",
  "Option2 Value",
  "Option3 Name",
  "Option3 Value",
  "Variant SKU",
  "Variant Price",
  "Variant Compare At Price",
  "Variant Barcode",
  "Image Src",
  "SEO Title",
  "SEO Description",
  "Status",
] as const;

function variantCells(variant: ProductExportShopifyVariant | undefined): string[] {
  if (!variant) {
    return ["", "", "", "", "", "", "", "", "", ""];
  }
  return [
    variant.option1Name,
    variant.option1Value,
    variant.option2Name,
    variant.option2Value,
    variant.option3Name,
    variant.option3Value,
    variant.sku,
    variant.price,
    variant.compareAtPrice,
    variant.barcode,
  ];
}

export function buildShopifyProductCsv(products: ProductExportShopifyProduct[]): string {
  const rows: string[][] = [];
  for (const product of products) {
    const variants = product.variants.length > 0 ? product.variants : [undefined];
    variants.forEach((variant, index) => {
      const isFirst = index === 0;
      rows.push([
        product.handle,
        isFirst ? product.title : "",
        isFirst ? product.bodyHtml : "",
        isFirst ? product.vendor : "",
        isFirst ? product.productType : "",
        isFirst ? product.tags : "",
        isFirst ? (product.published ? "TRUE" : "FALSE") : "",
        ...variantCells(variant),
        isFirst ? product.imageSrc : "",
        isFirst ? product.seoTitle : "",
        isFirst ? product.seoDescription : "",
        isFirst ? product.status.toLowerCase() : "",
      ]);
    });
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
