import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";

const PRODUCTS_QUERY = `#graphql
  query AdsCatalogProducts($first: Int!, $after: String, $query: String) {
    products(first: $first, after: $after, query: $query) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          title
          handle
          descriptionHtml
          productType
          vendor
          tags
          status
          onlineStoreUrl
          featuredImage { url altText }
          images(first: 10) { edges { node { url altText } } }
          priceRangeV2 {
            minVariantPrice { amount currencyCode }
          }
          category {
            id
            name
            fullName
          }
          variants(first: 100) {
            edges {
              node {
                id
                title
                sku
                barcode
                price
                compareAtPrice
              inventoryQuantity
              availableForSale
              inventoryPolicy
              selectedOptions {
                name
                value
              }
              }
            }
          }
        }
      }
    }
  }
`;

export type InventoryPolicy = "DENY" | "CONTINUE";

export interface RawVariantForCatalog {
  id: string;
  title: string;
  sku: string | null;
  barcode: string | null;
  price: string;
  compareAtPrice: string | null;
  inventoryQuantity: number | null;
  availableForSale: boolean;
  inventoryPolicy: InventoryPolicy;
  /** 从变体选项 "Color" / "Colour" / "颜色" 提取，供 GMC [color] 属性使用。 */
  color: string | null;
  /** 从变体选项 "Size" / "尺码" / "尺寸" 提取，供 GMC [size] 属性使用。 */
  size: string | null;
}

export interface RawShopifyProductForCatalog {
  id: string;
  title: string;
  handle: string;
  descriptionHtml: string | null;
  productType: string | null;
  vendor: string | null;
  tags: string[];
  status: string;
  onlineStoreUrl: string | null;
  featuredImage: { url: string; altText: string | null } | null;
  images: Array<{ url: string; altText: string | null }>;
  priceAmount: string | null;
  priceCurrency: string | null;
  // Primary-variant flat fields (kept for backward compatibility with the
  // Facebook mapper which only needs a single representative variant).
  variantId: string | null;
  sku: string | null;
  barcode: string | null;
  inventoryQuantity: number | null;
  availableForSale: boolean | null;
  // Extended fields used by the Google mapper / validator.
  variantCount: number;
  variants: RawVariantForCatalog[];
  shopifyCategory?: { id: string; name: string; fullName: string } | null;
  // Filled in by the sync context (全店统一设置)，校验器据此判断是否缺少标准类目。
  googleProductCategory?: string | null;
  /**
   * 从商品 tags 中提取的 GMC gender 值（male / female / unisex）。
   * 支持 "gender:male" 或裸标签 "male" / "female" / "unisex" 两种写法。
   */
  gender: string | null;
  /**
   * 从商品 tags 中提取的 GMC age_group 值（newborn / infant / toddler / kids / adult）。
   * 支持 "age_group:adult" 或裸标签两种写法。
   */
  ageGroup: string | null;
}

interface RawVariantNode {
  id: string;
  title?: string | null;
  sku?: string | null;
  barcode?: string | null;
  price?: string | null;
  compareAtPrice?: string | null;
  inventoryQuantity?: number | null;
  availableForSale?: boolean | null;
  inventoryPolicy?: string | null;
  selectedOptions?: Array<{ name: string; value: string }> | null;
}

interface RawEdge {
  node: {
    id: string;
    title?: string;
    handle?: string;
    descriptionHtml?: string;
    productType?: string;
    vendor?: string;
    tags?: string[];
    status?: string;
    onlineStoreUrl?: string | null;
    featuredImage?: { url: string; altText: string | null } | null;
    images?: { edges?: Array<{ node: { url: string; altText: string | null } }> };
    priceRangeV2?: { minVariantPrice?: { amount: string; currencyCode: string } };
    category?: { id: string; name: string; fullName: string } | null;
    variants?: { edges?: Array<{ node: RawVariantNode }> };
  };
}

function normalizeInventoryPolicy(value: string | null | undefined): InventoryPolicy {
  return value === "CONTINUE" ? "CONTINUE" : "DENY";
}

/**
 * 从 selectedOptions 中按候选名称列表（不区分大小写）取出第一个匹配的选项值。
 * 用于提取颜色（Color/颜色）和尺码（Size/尺码）。
 */
function extractOptionValue(
  options: Array<{ name: string; value: string }> | null | undefined,
  candidateNames: string[],
): string | null {
  if (!options?.length) return null;
  const lowerNames = candidateNames.map((n) => n.toLowerCase());
  const match = options.find((o) => lowerNames.includes(o.name.toLowerCase()));
  return match?.value ?? null;
}

const COLOR_OPTION_NAMES = ["color", "colour", "颜色", "色", "颜色/color"];
const SIZE_OPTION_NAMES = ["size", "尺码", "尺寸", "尺量", "型号", "size/尺码"];

/** 从商品 tags 提取 GMC gender 合法值，支持 "gender:male" 和裸标签两种写法。 */
function extractGenderFromTags(tags: string[]): string | null {
  const valid = new Set(["male", "female", "unisex"]);
  for (const tag of tags) {
    const lower = tag.toLowerCase().trim();
    const prefixed = lower.match(/^gender:(male|female|unisex)$/);
    if (prefixed) return prefixed[1];
    if (valid.has(lower)) return lower;
  }
  return null;
}

/** 从商品 tags 提取 GMC age_group 合法值，支持 "age_group:adult" 和裸标签两种写法。 */
function extractAgeGroupFromTags(tags: string[]): string | null {
  const valid = new Set(["newborn", "infant", "toddler", "kids", "adult"]);
  for (const tag of tags) {
    const lower = tag.toLowerCase().trim();
    const prefixed = lower.match(/^age_group:(newborn|infant|toddler|kids|adult)$/);
    if (prefixed) return prefixed[1];
    if (valid.has(lower)) return lower;
  }
  return null;
}

function mapVariant(node: RawVariantNode): RawVariantForCatalog {
  const opts = node.selectedOptions ?? null;
  return {
    id: node.id,
    title: node.title ?? "",
    sku: node.sku ?? null,
    barcode: node.barcode ?? null,
    price: node.price ?? "0",
    compareAtPrice: node.compareAtPrice ?? null,
    inventoryQuantity: node.inventoryQuantity ?? null,
    availableForSale: node.availableForSale ?? false,
    inventoryPolicy: normalizeInventoryPolicy(node.inventoryPolicy),
    color: extractOptionValue(opts, COLOR_OPTION_NAMES),
    size: extractOptionValue(opts, SIZE_OPTION_NAMES),
  };
}

function mapEdge(edge: RawEdge): RawShopifyProductForCatalog {
  const node = edge.node;
  const variantNodes = node.variants?.edges?.map((e) => e.node) ?? [];
  const variants = variantNodes.map(mapVariant);
  const firstVariant = variants[0] ?? null;
  const minPrice = node.priceRangeV2?.minVariantPrice ?? null;
  const imgEdges = node.images?.edges ?? [];
  return {
    id: node.id,
    title: node.title ?? "",
    handle: node.handle ?? "",
    descriptionHtml: node.descriptionHtml ?? null,
    productType: node.productType ?? null,
    vendor: node.vendor ?? null,
    tags: Array.isArray(node.tags) ? node.tags : [],
    status: node.status ?? "ACTIVE",
    onlineStoreUrl: node.onlineStoreUrl ?? null,
    featuredImage: node.featuredImage ?? null,
    images: imgEdges.map((e) => ({ url: e.node.url, altText: e.node.altText ?? null })),
    priceAmount: minPrice?.amount ?? firstVariant?.price ?? null,
    priceCurrency: minPrice?.currencyCode ?? null,
    variantId: firstVariant?.id ?? null,
    sku: firstVariant?.sku ?? null,
    barcode: firstVariant?.barcode ?? null,
    inventoryQuantity: firstVariant?.inventoryQuantity ?? null,
    availableForSale: firstVariant?.availableForSale ?? null,
    variantCount: variants.length,
    variants,
    shopifyCategory: node.category ?? null,
    gender: extractGenderFromTags(Array.isArray(node.tags) ? node.tags : []),
    ageGroup: extractAgeGroupFromTags(Array.isArray(node.tags) ? node.tags : []),
  };
}

export interface FetchProductsOptions {
  productIds?: string[] | null;
  tags?: string[];
  productTypes?: string[];
  vendors?: string[];
  collectionIds?: string[];
  inStockOnly?: boolean;
  query?: string;
  pageSize?: number;
  maxProducts?: number;
}

function escapeQueryValue(value: string): string {
  // Shopify search syntax: wrap values containing spaces/special chars in
  // single quotes and escape embedded quotes.
  const trimmed = value.trim();
  if (!trimmed) return "";
  const escaped = trimmed.replace(/'/g, "\\'");
  return /[\s:()"']/.test(trimmed) ? `'${escaped}'` : escaped;
}

function buildOrGroup(field: string, values: string[] | undefined): string | null {
  const cleaned = (values ?? []).map((v) => v.trim()).filter(Boolean);
  if (cleaned.length === 0) return null;
  const parts = cleaned.map((v) => `${field}:${escapeQueryValue(v)}`);
  return parts.length === 1 ? parts[0] : `(${parts.join(" OR ")})`;
}

/**
 * Assemble a Shopify product search query string from filter options.
 * Collection filtering is intentionally NOT handled here (collections are not
 * directly searchable via the products query and require a separate lookup).
 */
export function buildShopifyQuery(options: FetchProductsOptions): string {
  const clauses: string[] = ["status:active"];

  const tagGroup = buildOrGroup("tag", options.tags);
  if (tagGroup) clauses.push(tagGroup);

  const typeGroup = buildOrGroup("product_type", options.productTypes);
  if (typeGroup) clauses.push(typeGroup);

  const vendorGroup = buildOrGroup("vendor", options.vendors);
  if (vendorGroup) clauses.push(vendorGroup);

  if (options.inStockOnly) {
    clauses.push("inventory_total:>0");
  }

  if (options.query && options.query.trim()) {
    clauses.push(`(${options.query.trim()})`);
  }

  return clauses.join(" AND ");
}

/**
 * Pull Shopify products for catalog feed generation. Returns up to
 * `maxProducts` items (default 250) using GraphQL pagination. When
 * `productIds` is provided, only those products are returned. Otherwise the
 * filter options are compiled into a Shopify search query.
 */
export async function fetchProductsForCatalog(
  admin: ShopifyAdminGraphqlClient,
  options: FetchProductsOptions = {},
): Promise<RawShopifyProductForCatalog[]> {
  const pageSize = Math.min(Math.max(options.pageSize ?? 50, 1), 100);
  const maxProducts = Math.max(options.maxProducts ?? 250, 1);

  if (options.productIds && options.productIds.length > 0) {
    const queryParts = options.productIds
      .map((id) => id.trim())
      .filter(Boolean)
      .map((id) => `id:${id.replace(/^gid:\/\/shopify\/Product\//, "")}`);
    if (queryParts.length === 0) return [];
    return runPaged(admin, {
      first: Math.min(queryParts.length, pageSize),
      query: queryParts.join(" OR "),
      maxProducts: Math.min(maxProducts, queryParts.length),
    });
  }

  return runPaged(admin, {
    first: pageSize,
    query: buildShopifyQuery(options),
    maxProducts,
  });
}

async function runPaged(
  admin: ShopifyAdminGraphqlClient,
  params: { first: number; query: string; maxProducts: number },
): Promise<RawShopifyProductForCatalog[]> {
  const out: RawShopifyProductForCatalog[] = [];
  let after: string | null = null;

  while (out.length < params.maxProducts) {
    const remaining = params.maxProducts - out.length;
    const first = Math.min(params.first, remaining);
    const response = await admin.graphql(PRODUCTS_QUERY, {
      variables: { first, after, query: params.query },
    });
    if (!response.ok) {
      throw new Error(`Shopify products query failed: HTTP ${response.status}`);
    }
    const json = (await response.json()) as {
      data?: {
        products?: {
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
          edges: RawEdge[];
        };
      };
      errors?: Array<{ message: string }>;
    };
    if (json.errors?.length) {
      throw new Error(
        `Shopify products GraphQL errors: ${json.errors.map((e) => e.message).join("; ")}`,
      );
    }
    const products = json.data?.products;
    if (!products) break;
    for (const edge of products.edges) {
      out.push(mapEdge(edge));
      if (out.length >= params.maxProducts) break;
    }
    if (!products.pageInfo.hasNextPage || !products.pageInfo.endCursor) break;
    after = products.pageInfo.endCursor;
  }

  return out;
}

export function stripHtml(html: string | null): string {
  if (!html) return "";
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
