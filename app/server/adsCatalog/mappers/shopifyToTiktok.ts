import type { RawShopifyProductForCatalog } from "../productFetcher.server";
import { stripHtml } from "../productFetcher.server";

/**
 * TikTok Catalog product payload (JSON upload schema).
 * Field names follow Catalog Product Parameters:
 * https://ads.tiktok.com/help/article/catalog-product-parameters
 * API: POST /open_api/v1.3/catalog/product/upload/
 * @see https://business-api.tiktok.com/portal/docs?id=1740568340498434
 */
export interface TiktokCatalogItem {
  sku_id: string;
  title: string;
  description: string;
  availability: "in stock" | "out of stock" | "preorder";
  condition: "new" | "refurbished" | "used";
  /** e.g. "9.99 USD" */
  price: string;
  link: string;
  image_link: string;
  brand: string;
  additional_image_link?: string;
  google_product_category?: string;
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

  const brand = (product.vendor || context.brand || "").trim();
  if (!brand) {
    return { productId: product.id, ok: false, reason: "missing brand" };
  }

  const inStock =
    product.availableForSale === true ||
    (product.inventoryQuantity != null && product.inventoryQuantity > 0);

  const description = stripHtml(product.descriptionHtml).slice(0, 4990) || product.title;

  const additionalImages = product.images
    .map((img) => img.url)
    .filter((url): url is string => Boolean(url) && url !== imageLink)
    .slice(0, 9);

  const skuId = product.sku || extractNumericId(product.id);

  const item: TiktokCatalogItem = {
    sku_id: skuId,
    title: product.title.slice(0, 255),
    description: description.slice(0, 5000),
    availability: inStock ? "in stock" : "out of stock",
    condition: "new",
    price: `${Number(priceAmount).toFixed(2)} ${priceCurrency.toUpperCase()}`,
    link,
    image_link: imageLink,
    brand: brand.slice(0, 100),
  };

  if (additionalImages.length > 0) {
    item.additional_image_link = additionalImages.join(",");
  }

  if (product.googleProductCategory) {
    item.google_product_category = product.googleProductCategory;
  }

  return { productId: product.id, ok: true, item };
}

function extractNumericId(gid: string): string {
  const match = /\/(\d+)$/.exec(gid);
  return match ? match[1] : gid;
}
