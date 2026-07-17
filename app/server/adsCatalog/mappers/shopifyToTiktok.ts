import type { RawShopifyProductForCatalog } from "../productFetcher.server";
import { stripHtml } from "../productFetcher.server";

/**
 * TikTok Catalog product payload for JSON upload (ECOM).
 *
 * API: POST /open_api/v1.3/catalog/product/upload/
 * Schema source: Marketing API playground params for `/catalog/product/upload/`.
 *
 * Note: feed CSV 字段名（link / image_link / price）与 JSON upload 不同：
 * - price → price_info.{price,currency}
 * - link → landing_page.landing_page_url
 * - image_link → image_url
 * - condition → product_detail.condition
 *
 * @see https://business-api.tiktok.com/portal/docs?id=1740497429681153
 * @see https://ads.tiktok.com/help/article/catalog-product-parameters
 */
export interface TiktokPriceInfo {
  /** 商品价格（数值，非 "9.99 USD" 拼接串） */
  price: number;
  /** ISO 4217，如 USD */
  currency: string;
  sale_price?: number;
}

export interface TiktokLandingPage {
  landing_page_url: string;
  checkout_url?: string;
}

export interface TiktokProductDetail {
  /**
   * TikTok Catalog JSON upload 枚举（大写），不同于 Meta/Google feed 的小写 condition。
   * 允许值：EXCELLENT | FAIR | GOOD | NEW | OTHER | POOR | REFURBISHED | USED
   */
  condition: "NEW" | "REFURBISHED" | "USED" | "EXCELLENT" | "FAIR" | "GOOD" | "OTHER" | "POOR";
  age_group?: string;
  gender?: string;
  product_category?: string;
}

export interface TiktokCatalogItem {
  sku_id: string;
  title: string;
  description: string;
  /** TikTok Catalog Product Parameters（大写下划线枚举，不同于 Google/Meta 的 "in stock"） */
  availability: "IN_STOCK" | "OUT_OF_STOCK" | "PREORDER";
  /** ECOM Catalog JSON upload 必填 */
  price_info: TiktokPriceInfo;
  /** ECOM Catalog JSON upload 必填（对象，不是 feed 的 link 字符串） */
  landing_page: TiktokLandingPage;
  image_url: string;
  brand: string;
  product_detail: TiktokProductDetail;
  additional_image_urls?: string[];
  /** Google Product Taxonomy 路径；与 product_type 二选一即可消除 TikTok Warning */
  google_product_category?: string;
  /** 商品自有类目路径；TikTok 推荐与 google_product_category 至少填一个 */
  product_type?: string;
  item_group_id?: string;
  global_trade_item_number?: string;
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

  const landingPageUrl =
    product.onlineStoreUrl ??
    (product.handle ? `https://${context.shopDomain}/products/${product.handle}` : null);
  if (!landingPageUrl) {
    return { productId: product.id, ok: false, reason: "missing product link" };
  }

  const imageUrl = product.featuredImage?.url ?? product.images[0]?.url ?? null;
  if (!imageUrl) {
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
    .filter((url): url is string => Boolean(url) && url !== imageUrl)
    .slice(0, 9);

  const skuId = product.sku || extractNumericId(product.id);

  const productDetail: TiktokProductDetail = {
    condition: "NEW",
  };
  if (product.gender) {
    productDetail.gender = product.gender;
  }
  if (product.ageGroup) {
    productDetail.age_group = product.ageGroup;
  }
  const categoryPath = resolveTiktokCategoryPath(product);
  if (categoryPath) {
    productDetail.product_category = categoryPath.slice(0, 250);
  }

  const item: TiktokCatalogItem = {
    sku_id: skuId,
    title: product.title.slice(0, 255),
    description: description.slice(0, 5000),
    availability: inStock ? "IN_STOCK" : "OUT_OF_STOCK",
    price_info: {
      price: Number(Number(priceAmount).toFixed(2)),
      currency: priceCurrency.toUpperCase(),
    },
    landing_page: {
      landing_page_url: landingPageUrl,
    },
    image_url: imageUrl,
    brand: brand.slice(0, 100),
    product_detail: productDetail,
    item_group_id: extractNumericId(product.id),
  };

  if (additionalImages.length > 0) {
    item.additional_image_urls = additionalImages;
  }

  // TikTok 要求 google_product_category / product_type 至少填一个（可选但强烈推荐）。
  // 同时写入两个字段，避免 API 只认其中一侧时仍报 Warning。
  if (categoryPath) {
    item.google_product_category = categoryPath;
    item.product_type = categoryPath;
  }

  if (product.barcode) {
    item.global_trade_item_number = product.barcode;
  }

  return { productId: product.id, ok: true, item };
}

function extractNumericId(gid: string): string {
  const match = /\/(\d+)$/.exec(gid);
  return match ? match[1] : gid;
}

/** 解析用于 TikTok 广告优化的类目路径，优先标准 GPC，再退回店铺类目。 */
function resolveTiktokCategoryPath(product: RawShopifyProductForCatalog): string | null {
  const candidates = [
    product.googleProductCategory,
    product.productType,
    product.shopifyCategory?.fullName,
    product.shopifyCategory?.name,
  ];
  for (const raw of candidates) {
    const value = raw?.trim();
    if (value) return value.slice(0, 250);
  }
  return null;
}
