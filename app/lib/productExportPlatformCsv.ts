/**
 * Amazon / Temu / TikTok Shop 核心字段起步表。纯算，不含 IO。
 * 不是各站按叶子类目下发的官方模板。
 */
import { toCsv } from "./csv";
import type {
  ProductExportPreviewProduct,
  ProductExportShopifyProduct,
  ProductExportShopifyVariant,
  ProductExportSkip,
} from "./productExport";

export type ProductExportPlatformMapperResult = {
  csv: string;
  skips: ProductExportSkip[];
  warnings: ProductExportSkip[];
  exportedProducts: ProductExportPreviewProduct[];
};

type PlatformCollect = {
  skip: ProductExportSkip | null;
  variants: ProductExportShopifyVariant[];
  warnings: ProductExportSkip[];
};

const COLOR_OPTION = /^(colou?r|颜色|色彩)$/i;
const SIZE_OPTION = /^(size|尺码|尺寸|大小)$/i;

function productKey(product: ProductExportShopifyProduct): string {
  return product.id?.trim() || product.handle.trim() || product.title.trim();
}

function parentSkuOf(product: ProductExportShopifyProduct): string {
  if (product.handle.trim()) return product.handle.trim();
  const match = (product.id ?? "").match(/(\d+)\s*$/);
  return match?.[1] ?? productKey(product);
}

export function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export function guessGtinType(barcode: string): string {
  const digits = barcode.replace(/\D/g, "");
  if (digits.length === 12) return "UPC";
  if (digits.length === 13) return "EAN";
  if (digits.length === 14) return "GTIN";
  return "";
}

export function gramsToKg(grams: string): string {
  const value = Number(grams);
  if (!Number.isFinite(value) || value <= 0) return "";
  return String(Number((value / 1000).toFixed(3)));
}

function optionValueByTest(
  variant: ProductExportShopifyVariant,
  test: RegExp,
): string {
  const pairs: Array<[string, string]> = [
    [variant.option1Name, variant.option1Value],
    [variant.option2Name, variant.option2Value],
    [variant.option3Name, variant.option3Value],
  ];
  const matched = pairs.find(([name]) => test.test(name.trim()));
  return matched?.[1].trim() ?? "";
}

function variationTheme(variant: ProductExportShopifyVariant): string {
  const parts: string[] = [];
  for (const name of [variant.option1Name, variant.option2Name, variant.option3Name]) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    if (COLOR_OPTION.test(trimmed)) parts.push("Color");
    else if (SIZE_OPTION.test(trimmed)) parts.push("Size");
    else parts.push(trimmed.replace(/\s+/g, ""));
  }
  return parts.join("-");
}

function extraImageUrls(product: ProductExportShopifyProduct, max: number): string[] {
  return product.images.slice(1, max + 1).map((image) => image.src);
}

function padImages(urls: string[], count: number): string[] {
  return Array.from({ length: count }, (_, index) => urls[index] ?? "");
}

function previewOf(product: ProductExportShopifyProduct): ProductExportPreviewProduct {
  return {
    productId: productKey(product),
    title: product.title,
    handle: product.handle,
  };
}

function selectExportableVariants(
  product: ProductExportShopifyProduct,
): { skip: ProductExportSkip | null; variants: ProductExportShopifyVariant[]; skippedCount: number } {
  const productId = productKey(product);
  const productTitle = product.title.trim();
  if (!productTitle) {
    return {
      skip: { productId, productTitle: product.handle || productId, reason: "missing_title" },
      variants: [],
      skippedCount: 0,
    };
  }
  if (product.variants.length === 0) {
    return {
      skip: { productId, productTitle, reason: "missing_sku" },
      variants: [],
      skippedCount: 0,
    };
  }
  const variants: ProductExportShopifyVariant[] = [];
  let missingSku = 0;
  let missingPrice = 0;
  for (const variant of product.variants) {
    if (!variant.sku.trim()) {
      missingSku += 1;
      continue;
    }
    if (!variant.price.trim()) {
      missingPrice += 1;
      continue;
    }
    variants.push(variant);
  }
  if (variants.length === 0) {
    return {
      skip: { productId, productTitle, reason: missingSku > 0 ? "missing_sku" : "missing_price" },
      variants: [],
      skippedCount: product.variants.length,
    };
  }
  return { skip: null, variants, skippedCount: missingSku + missingPrice };
}

function starterFieldWarnings(
  product: ProductExportShopifyProduct,
  variants: ProductExportShopifyVariant[],
  skippedCount: number,
  includeCategory: boolean,
): ProductExportSkip[] {
  const productId = productKey(product);
  const productTitle = product.title.trim();
  const pushIf = (condition: boolean, reason: string, list: ProductExportSkip[]) => {
    if (condition) list.push({ productId, productTitle, reason });
  };
  const warnings: ProductExportSkip[] = [];
  pushIf(skippedCount > 0, "partial_variants_skipped", warnings);
  pushIf(!product.vendor.trim(), "missing_brand", warnings);
  pushIf(product.images.length === 0, "missing_image", warnings);
  pushIf(!variants.some((variant) => variant.barcode.trim()), "missing_gtin", warnings);
  const ships = variants.some((variant) => variant.requiresShipping);
  const hasWeight = variants.some((variant) => Number(variant.grams) > 0);
  pushIf(ships && !hasWeight, "missing_weight", warnings);
  pushIf(!variants.some((variant) => variant.inventoryQty.trim() !== ""), "missing_quantity", warnings);
  if (includeCategory) {
    pushIf(!product.productCategory.trim() && !product.productType.trim(), "missing_category", warnings);
  }
  return warnings;
}

function collectPlatformProduct(
  product: ProductExportShopifyProduct,
  includeCategory: boolean,
): PlatformCollect {
  const selected = selectExportableVariants(product);
  if (selected.skip) return { skip: selected.skip, variants: [], warnings: [] };
  return {
    skip: null,
    variants: selected.variants,
    warnings: starterFieldWarnings(product, selected.variants, selected.skippedCount, includeCategory),
  };
}

function mapPlatformProducts(
  products: ProductExportShopifyProduct[],
  includeCategory: boolean,
  buildRows: (product: ProductExportShopifyProduct, variants: ProductExportShopifyVariant[]) => string[][],
  headers: readonly string[],
): ProductExportPlatformMapperResult {
  const rows: string[][] = [];
  const skips: ProductExportSkip[] = [];
  const warnings: ProductExportSkip[] = [];
  const exportedProducts: ProductExportPreviewProduct[] = [];
  for (const product of products) {
    const collected = collectPlatformProduct(product, includeCategory);
    if (collected.skip) {
      skips.push(collected.skip);
      continue;
    }
    rows.push(...buildRows(product, collected.variants));
    warnings.push(...collected.warnings);
    exportedProducts.push(previewOf(product));
  }
  return { csv: toCsv(headers, rows), skips, warnings, exportedProducts };
}

const AMAZON_CSV_HEADERS = [
  "item_sku",
  "parent_sku",
  "parent_child",
  "relationship_type",
  "variation_theme",
  "item_name",
  "brand_name",
  "product_description",
  "standard_price",
  "quantity",
  "main_image_url",
  "other_image_url1",
  "other_image_url2",
  "other_image_url3",
  "other_image_url4",
  "other_image_url5",
  "other_image_url6",
  "other_image_url7",
  "other_image_url8",
  "external_product_id",
  "external_product_id_type",
  "item_weight",
  "item_weight_unit",
  "color_name",
  "size_name",
  "update_delete",
] as const;

function amazonCells(input: {
  sku: string;
  parentSku: string;
  parentChild: string;
  relationship: string;
  theme: string;
  title: string;
  brand: string;
  description: string;
  price: string;
  quantity: string;
  mainImage: string;
  extraImages: string[];
  gtin: string;
  gtinType: string;
  weight: string;
  color: string;
  size: string;
}): string[] {
  return [
    input.sku,
    input.parentSku,
    input.parentChild,
    input.relationship,
    input.theme,
    input.title,
    input.brand,
    input.description,
    input.price,
    input.quantity,
    input.mainImage,
    ...padImages(input.extraImages, 8),
    input.gtin,
    input.gtinType,
    input.weight,
    input.weight ? "kg" : "",
    input.color,
    input.size,
    "Update",
  ];
}

function childTitle(product: ProductExportShopifyProduct, variant: ProductExportShopifyVariant): string {
  const options = [variant.option1Value, variant.option2Value, variant.option3Value]
    .map((value) => value.trim())
    .filter(Boolean);
  return options.length > 0 ? `${product.title} ${options.join(" ")}` : product.title;
}

type AmazonRowContext = {
  product: ProductExportShopifyProduct;
  parentSku: string;
  theme: string;
  description: string;
  extraImages: string[];
  multi: boolean;
};

function amazonParentRow(ctx: AmazonRowContext): string[] {
  return amazonCells({
    sku: ctx.parentSku,
    parentSku: "",
    parentChild: "Parent",
    relationship: "",
    theme: ctx.theme,
    title: ctx.product.title,
    brand: ctx.product.vendor,
    description: ctx.description,
    price: "",
    quantity: "",
    mainImage: ctx.product.images[0]?.src ?? "",
    extraImages: ctx.extraImages,
    gtin: "",
    gtinType: "",
    weight: "",
    color: "",
    size: "",
  });
}

function amazonChildRow(ctx: AmazonRowContext, variant: ProductExportShopifyVariant): string[] {
  const barcode = variant.barcode.trim();
  return amazonCells({
    sku: variant.sku,
    parentSku: ctx.multi ? ctx.parentSku : "",
    parentChild: ctx.multi ? "Child" : "",
    relationship: ctx.multi ? "Variation" : "",
    theme: ctx.multi ? ctx.theme : "",
    title: childTitle(ctx.product, variant),
    brand: ctx.product.vendor,
    description: ctx.description,
    price: variant.price,
    quantity: variant.inventoryQty,
    mainImage: variant.variantImageSrc || ctx.product.images[0]?.src || "",
    extraImages: ctx.extraImages,
    gtin: barcode,
    gtinType: guessGtinType(barcode),
    weight: gramsToKg(variant.grams),
    color: optionValueByTest(variant, COLOR_OPTION),
    size: optionValueByTest(variant, SIZE_OPTION),
  });
}

function amazonRows(product: ProductExportShopifyProduct, variants: ProductExportShopifyVariant[]): string[][] {
  const ctx: AmazonRowContext = {
    product,
    parentSku: parentSkuOf(product),
    description: stripHtmlToText(product.bodyHtml) || product.title,
    extraImages: extraImageUrls(product, 8),
    theme: variationTheme(variants[0]!),
    multi: variants.length > 1,
  };
  const rows: string[][] = [];
  if (ctx.multi) rows.push(amazonParentRow(ctx));
  for (const variant of variants) rows.push(amazonChildRow(ctx, variant));
  return rows;
}

export function buildAmazonProductCsv(products: ProductExportShopifyProduct[]): ProductExportPlatformMapperResult {
  return mapPlatformProducts(products, false, amazonRows, AMAZON_CSV_HEADERS);
}

const TEMU_CSV_HEADERS = [
  "product_name",
  "product_description",
  "product_code",
  "sku",
  "list_price",
  "quantity",
  "images",
  "brand",
  "spec_name_1",
  "spec_value_1",
  "spec_name_2",
  "spec_value_2",
  "spec_name_3",
  "spec_value_3",
  "weight",
  "weight_unit",
  "category",
] as const;

function temuRows(product: ProductExportShopifyProduct, variants: ProductExportShopifyVariant[]): string[][] {
  const description = stripHtmlToText(product.bodyHtml) || product.title;
  const images = product.images.map((image) => image.src).join(";");
  const category = product.productCategory.trim() || product.productType.trim();
  const productCode = parentSkuOf(product);
  return variants.map((variant) => {
    const weight = gramsToKg(variant.grams);
    return [
      product.title,
      description,
      productCode,
      variant.sku,
      variant.price,
      variant.inventoryQty,
      images,
      product.vendor,
      variant.option1Name,
      variant.option1Value,
      variant.option2Name,
      variant.option2Value,
      variant.option3Name,
      variant.option3Value,
      weight,
      weight ? "kg" : "",
      category,
    ];
  });
}

export function buildTemuProductCsv(products: ProductExportShopifyProduct[]): ProductExportPlatformMapperResult {
  return mapPlatformProducts(products, true, temuRows, TEMU_CSV_HEADERS);
}

const TIKTOK_SHOP_CSV_HEADERS = [
  "product_name",
  "product_description",
  "main_image",
  "image_2",
  "image_3",
  "image_4",
  "image_5",
  "image_6",
  "image_7",
  "image_8",
  "image_9",
  "sku",
  "retail_price",
  "quantity",
  "weight",
  "weight_unit",
  "variation_1_name",
  "variation_1_value",
  "variation_2_name",
  "variation_2_value",
  "variation_3_name",
  "variation_3_value",
] as const;

function tiktokShopRows(
  product: ProductExportShopifyProduct,
  variants: ProductExportShopifyVariant[],
): string[][] {
  const description = stripHtmlToText(product.bodyHtml) || product.title;
  const extraImages = padImages(extraImageUrls(product, 8), 8);
  return variants.map((variant) => {
    const weight = gramsToKg(variant.grams);
    return [
      product.title,
      description,
      variant.variantImageSrc || product.images[0]?.src || "",
      ...extraImages,
      variant.sku,
      variant.price,
      variant.inventoryQty,
      weight,
      weight ? "kg" : "",
      variant.option1Name,
      variant.option1Value,
      variant.option2Name,
      variant.option2Value,
      variant.option3Name,
      variant.option3Value,
    ];
  });
}

export function buildTiktokShopProductCsv(
  products: ProductExportShopifyProduct[],
): ProductExportPlatformMapperResult {
  return mapPlatformProducts(products, false, tiktokShopRows, TIKTOK_SHOP_CSV_HEADERS);
}
