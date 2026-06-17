import type {
  RawShopifyProductForCatalog,
  RawVariantForCatalog,
} from "../productFetcher.server";
import { stripHtml } from "../productFetcher.server";

/**
 * Google Merchant Center "Product" resource (Content API for Shopping v2.1).
 * @see https://developers.google.com/shopping-content/reference/rest/v2.1/products
 */
export interface GoogleMerchantProduct {
  offerId: string;
  title: string;
  description: string;
  link: string;
  imageLink: string;
  contentLanguage: string;
  targetCountry: string;
  channel: "online";
  availability: "in stock" | "out of stock" | "preorder";
  condition: "new" | "refurbished" | "used";
  price: { value: string; currency: string };
  salePrice?: { value: string; currency: string };
  brand: string;
  gtin?: string;
  mpn?: string;
  identifierExists?: boolean;
  googleProductCategory?: string;
  productTypes?: string[];
  additionalImageLinks?: string[];
  itemGroupId?: string;
}

export interface MapGoogleContext {
  shopDomain: string;
  contentLanguage: string; // e.g. "en"
  targetCountry: string; // e.g. "US"
  defaultCurrency?: string;
  brand?: string;
  /** 全店统一的 Google 标准类目 ID（来自同步配置）。 */
  googleProductCategory?: string;
}

export interface MappedGoogleEntry {
  productId: string;
  ok: true;
  product: GoogleMerchantProduct;
}

export interface MappedGoogleSkip {
  productId: string;
  ok: false;
  reason: string;
}

export type MappedGoogleResult = MappedGoogleEntry | MappedGoogleSkip;

export type MappedGoogleMultiResult =
  | { productId: string; ok: true; products: GoogleMerchantProduct[] }
  | MappedGoogleSkip;

function resolveLink(product: RawShopifyProductForCatalog, shopDomain: string): string | null {
  return (
    product.onlineStoreUrl ??
    (product.handle ? `https://${shopDomain}/products/${product.handle}` : null)
  );
}

function resolveImage(product: RawShopifyProductForCatalog): string | null {
  return product.featuredImage?.url ?? product.images[0]?.url ?? null;
}

function resolveAvailability(
  variant: RawVariantForCatalog,
): GoogleMerchantProduct["availability"] {
  if (!variant.availableForSale) return "out of stock";
  return variant.inventoryPolicy === "CONTINUE" ? "preorder" : "in stock";
}

/**
 * Resolve price + salePrice for a variant. When a compareAtPrice exists and is
 * higher than the live price, the live price becomes the promotional salePrice
 * and the original price uses compareAtPrice.
 */
function resolvePricing(
  variant: RawVariantForCatalog,
  currency: string,
): { price: { value: string; currency: string }; salePrice?: { value: string; currency: string } } {
  const live = parseFloat(variant.price);
  const compareAt = variant.compareAtPrice ? parseFloat(variant.compareAtPrice) : NaN;
  if (!Number.isNaN(compareAt) && compareAt > live) {
    return {
      price: { value: compareAt.toFixed(2), currency },
      salePrice: { value: live.toFixed(2), currency },
    };
  }
  return { price: { value: live.toFixed(2), currency } };
}

function extractNumericId(gid: string): string {
  const match = gid.match(/(\d+)$/);
  return match ? match[1] : gid;
}

/**
 * Expand a Shopify product into one GoogleMerchantProduct per variant. Variants
 * share an itemGroupId so GMC aggregates them as one listing. Single-variant
 * products produce a single entry without a variant title suffix.
 */
export function mapShopifyVariantsToGoogle(
  product: RawShopifyProductForCatalog,
  context: MapGoogleContext,
): MappedGoogleMultiResult {
  const link = resolveLink(product, context.shopDomain);
  if (!link) {
    return { productId: product.id, ok: false, reason: "missing product link" };
  }
  const imageLink = resolveImage(product);
  if (!imageLink) {
    return { productId: product.id, ok: false, reason: "missing image" };
  }
  if (!product.title) {
    return { productId: product.id, ok: false, reason: "missing title" };
  }
  const currency = product.priceCurrency ?? context.defaultCurrency;
  if (!currency) {
    return { productId: product.id, ok: false, reason: "missing currency" };
  }

  const variants =
    product.variants.length > 0
      ? product.variants
      : // Fallback: synthesize a variant from flat fields when none were fetched.
        [
          {
            id: product.variantId ?? product.id,
            title: "",
            sku: product.sku,
            barcode: product.barcode,
            price: product.priceAmount ?? "0",
            compareAtPrice: null,
            inventoryQuantity: product.inventoryQuantity,
            availableForSale: product.availableForSale ?? false,
            inventoryPolicy: "DENY" as const,
          },
        ];

  const isMulti = variants.length > 1;
  const productNumericId = extractNumericId(product.id);
  const description = stripHtml(product.descriptionHtml).slice(0, 4990) || product.title;
  const additional = product.images
    .map((img) => img.url)
    .filter((url) => url !== imageLink)
    .slice(0, 10);
  const brand = (context.brand || product.vendor || "Shopify Store").slice(0, 70);
  const googleProductCategory = context.googleProductCategory?.trim() || undefined;

  const products: GoogleMerchantProduct[] = variants.map((variant) => {
    const priceValue = parseFloat(variant.price);
    if (Number.isNaN(priceValue) || priceValue === 0) {
      // Variants without a usable price fall back to the product min price.
      variant = { ...variant, price: product.priceAmount ?? variant.price };
    }
    const { price, salePrice } = resolvePricing(variant, currency);
    const gtin = variant.barcode?.trim() || undefined;
    const mpn = variant.sku?.trim() || undefined;
    const variantNumericId = extractNumericId(variant.id);
    const offerId = variant.sku?.trim() || `${productNumericId}-${variantNumericId}`;
    const title =
      isMulti && variant.title
        ? `${product.title} - ${variant.title}`.slice(0, 149)
        : product.title.slice(0, 149);

    return {
      offerId,
      title,
      description,
      link,
      imageLink,
      contentLanguage: context.contentLanguage,
      targetCountry: context.targetCountry,
      channel: "online" as const,
      availability: resolveAvailability(variant),
      condition: "new" as const,
      price,
      salePrice,
      brand,
      gtin,
      mpn,
      identifierExists: Boolean(gtin || mpn),
      googleProductCategory,
      productTypes: product.productType ? [product.productType] : undefined,
      additionalImageLinks: additional.length > 0 ? additional : undefined,
      itemGroupId: isMulti ? productNumericId : undefined,
    };
  });

  return { productId: product.id, ok: true, products };
}

/**
 * Backward-compatible single-product mapper (returns the first variant entry).
 * Prefer {@link mapShopifyVariantsToGoogle} for sync to push all variants.
 */
export function mapShopifyToGoogle(
  product: RawShopifyProductForCatalog,
  context: MapGoogleContext,
): MappedGoogleResult {
  const result = mapShopifyVariantsToGoogle(product, context);
  if (!result.ok) return result;
  const first = result.products[0];
  if (!first) {
    return { productId: product.id, ok: false, reason: "no variants" };
  }
  return { productId: product.id, ok: true, product: first };
}
