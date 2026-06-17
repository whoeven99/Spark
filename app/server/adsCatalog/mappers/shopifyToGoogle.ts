import type { RawShopifyProductForCatalog } from "../productFetcher.server";
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
  availability: "in stock" | "out of stock";
  condition: "new" | "refurbished" | "used";
  price: { value: string; currency: string };
  brand: string;
  gtin?: string;
  mpn?: string;
  identifierExists?: boolean;
  productTypes?: string[];
  additionalImageLinks?: string[];
  itemGroupId?: string;
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

export function mapShopifyToGoogle(
  product: RawShopifyProductForCatalog,
  context: {
    shopDomain: string;
    contentLanguage: string; // e.g. "en"
    targetCountry: string;   // e.g. "US"
    defaultCurrency?: string;
    brand?: string;
  },
): MappedGoogleResult {
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
  if (!product.title) {
    return { productId: product.id, ok: false, reason: "missing title" };
  }

  const inStock =
    product.availableForSale === true ||
    (product.inventoryQuantity != null && product.inventoryQuantity > 0);
  const description = stripHtml(product.descriptionHtml).slice(0, 4990) || product.title;
  const additional = product.images
    .map((img) => img.url)
    .filter((url) => url !== imageLink)
    .slice(0, 10);
  const gtin = product.barcode?.trim() || undefined;
  const mpn = product.sku?.trim() || undefined;

  return {
    productId: product.id,
    ok: true,
    product: {
      offerId: product.sku || extractNumericId(product.id),
      title: product.title.slice(0, 149),
      description,
      link,
      imageLink,
      contentLanguage: context.contentLanguage,
      targetCountry: context.targetCountry,
      channel: "online",
      availability: inStock ? "in stock" : "out of stock",
      condition: "new",
      price: { value: Number(priceAmount).toFixed(2), currency: priceCurrency },
      brand: (context.brand || product.vendor || "Shopify Store").slice(0, 70),
      gtin,
      mpn,
      identifierExists: Boolean(gtin || mpn),
      productTypes: product.productType ? [product.productType] : undefined,
      additionalImageLinks: additional.length > 0 ? additional : undefined,
      itemGroupId: extractNumericId(product.id),
    },
  };
}

function extractNumericId(gid: string): string {
  const match = gid.match(/(\d+)$/);
  return match ? match[1] : gid;
}
