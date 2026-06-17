import type { RawShopifyProductForCatalog } from "../productFetcher.server";
import { stripHtml } from "../productFetcher.server";

/**
 * Facebook Catalog "items_batch" item payload.
 * @see https://developers.facebook.com/docs/marketing-api/catalog/reference/
 */
export interface FacebookCatalogItem {
  id: string;
  title: string;
  description: string;
  availability: "in stock" | "out of stock";
  condition: "new" | "refurbished" | "used";
  price: string; // "12.99 USD"
  link: string;
  image_link: string;
  brand: string;
  additional_image_link?: string;
  google_product_category?: string;
  inventory?: number;
  custom_label_0?: string;
  item_group_id?: string;
}

export interface MappedFacebookEntry {
  productId: string;
  ok: true;
  item: FacebookCatalogItem;
}

export interface MappedFacebookSkip {
  productId: string;
  ok: false;
  reason: string;
}

export type MappedFacebookResult = MappedFacebookEntry | MappedFacebookSkip;

const DEFAULT_BRAND = "Shopify Store";

export function mapShopifyToFacebook(
  product: RawShopifyProductForCatalog,
  context: { shopDomain: string; defaultCurrency?: string; brand?: string },
): MappedFacebookResult {
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
  const additionalImage = product.images.find((img) => img.url !== imageLink)?.url;

  return {
    productId: product.id,
    ok: true,
    item: {
      id: product.sku || extractNumericId(product.id),
      title: product.title.slice(0, 199),
      description,
      availability: inStock ? "in stock" : "out of stock",
      condition: "new",
      price: `${Number(priceAmount).toFixed(2)} ${priceCurrency}`,
      link,
      image_link: imageLink,
      brand: (context.brand || product.vendor || DEFAULT_BRAND).slice(0, 99),
      additional_image_link: additionalImage,
      google_product_category: product.productType ?? undefined,
      inventory:
        product.inventoryQuantity != null && product.inventoryQuantity >= 0
          ? product.inventoryQuantity
          : undefined,
      item_group_id: extractNumericId(product.id),
    },
  };
}

function extractNumericId(gid: string): string {
  const match = gid.match(/(\d+)$/);
  return match ? match[1] : gid;
}
