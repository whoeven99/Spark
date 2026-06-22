import type { RawShopifyProductForCatalog } from "../productFetcher.server";
import { stripHtml } from "../productFetcher.server";

/**
 * TikTok for Business Catalog product item payload.
 * @see https://business-api.tiktok.com/portal/docs?id=1740568340498434
 */
export interface TiktokCatalogItem {
  item_id: string;
  title: string;
  description: string;
  availability: "IN_STOCK" | "OUT_OF_STOCK" | "PREORDER";
  price: string;
  currency: string;
  link: string;
  image_urls: string[];
  brand?: string;
  condition: "NEW" | "REFURBISHED" | "USED";
  additional_image_urls?: string[];
  google_product_category?: string;
  custom_number_0?: number;
}

export interface MappedTiktokEntry {
  productId: string;
  ok: true;
  item: TiktokCatalogItem;
}

export interface MappedTiktokSkip {
  productId: string;
  ok: false;
  reason: string;
}

export type MappedTiktokResult = MappedTiktokEntry | MappedTiktokSkip;

export function mapShopifyToTiktok(
  product: RawShopifyProductForCatalog,
  context: { shopDomain: string; defaultCurrency?: string; brand?: string },
): MappedTiktokResult {
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

  const inStock =
    product.availableForSale === true ||
    (product.inventoryQuantity != null && product.inventoryQuantity > 0);

  const description = stripHtml(product.descriptionHtml).slice(0, 4990) || product.title;

  const additionalImages = product.images
    .map((img) => img.url)
    .filter((url): url is string => Boolean(url) && url !== imageLink)
    .slice(0, 9);

  const itemId = product.sku || extractNumericId(product.id);

  const item: TiktokCatalogItem = {
    item_id: itemId,
    title: product.title.slice(0, 255),
    description: description.slice(0, 5000),
    availability: inStock ? "IN_STOCK" : "OUT_OF_STOCK",
    price: Number(priceAmount).toFixed(2),
    currency: priceCurrency.toUpperCase(),
    link,
    image_urls: [imageLink],
    condition: "NEW",
  };

  if (additionalImages.length > 0) {
    item.additional_image_urls = additionalImages;
  }

  const brand = product.vendor || context.brand;
  if (brand) item.brand = brand.slice(0, 100);

  if (product.googleProductCategory) {
    item.google_product_category = product.googleProductCategory;
  }

  if (product.inventoryQuantity != null && product.inventoryQuantity >= 0) {
    item.custom_number_0 = product.inventoryQuantity;
  }

  return { productId: product.id, ok: true, item };
}

function extractNumericId(gid: string): string {
  const match = /\/(\d+)$/.exec(gid);
  return match ? match[1] : gid;
}
