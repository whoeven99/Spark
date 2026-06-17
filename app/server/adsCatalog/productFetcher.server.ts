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
                inventoryItem {
                  inventoryPolicy
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
  inventoryItem?: { inventoryPolicy?: string | null } | null;
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

function mapVariant(node: RawVariantNode): RawVariantForCatalog {
  return {
    id: node.id,
    title: node.title ?? "",
    sku: node.sku ?? null,
    barcode: node.barcode ?? null,
    price: node.price ?? "0",
    compareAtPrice: node.compareAtPrice ?? null,
    inventoryQuantity: node.inventoryQuantity ?? null,
    availableForSale: node.availableForSale ?? false,
    inventoryPolicy: normalizeInventoryPolicy(node.inventoryItem?.inventoryPolicy),
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
