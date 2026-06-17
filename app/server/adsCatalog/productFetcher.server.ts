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
          variants(first: 1) {
            edges {
              node {
                id
                sku
                barcode
                price
                inventoryQuantity
                availableForSale
              }
            }
          }
        }
      }
    }
  }
`;

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
  variantId: string | null;
  sku: string | null;
  barcode: string | null;
  inventoryQuantity: number | null;
  availableForSale: boolean | null;
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
    variants?: {
      edges?: Array<{
        node: {
          id: string;
          sku?: string | null;
          barcode?: string | null;
          price?: string | null;
          inventoryQuantity?: number | null;
          availableForSale?: boolean | null;
        };
      }>;
    };
  };
}

function mapEdge(edge: RawEdge): RawShopifyProductForCatalog {
  const node = edge.node;
  const firstVariant = node.variants?.edges?.[0]?.node ?? null;
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
  };
}

export interface FetchProductsOptions {
  productIds?: string[] | null;
  query?: string;
  pageSize?: number;
  maxProducts?: number;
}

/**
 * Pull Shopify products for catalog feed generation. Returns up to
 * `maxProducts` items (default 250) using GraphQL pagination. When
 * `productIds` is provided, only those products are returned (one
 * request per chunk of 25 IDs).
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
    query: options.query ?? "status:active",
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
