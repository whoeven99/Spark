/**
 * 按 Handle / SKU / 商品 ID 读取导入所需快照。只读。
 */
import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";
import { chunkItems } from "../shopify/productIdQuery.server";
import {
  normalizeGid,
  type ProductImportProductSnapshot,
  type ProductImportVariantSnapshot,
} from "../../lib/productImportPlan";

const PRODUCTS_QUERY = `#graphql
  query ProductImportProducts($first: Int!, $after: String, $query: String!) {
    products(first: $first, after: $after, query: $query) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          title
          handle
          vendor
          productType
          status
          tags
          totalInventory
          tracksInventory
          publishedAt
          seo { title description }
          variants(first: 100) {
            nodes { id title sku price compareAtPrice }
          }
        }
      }
    }
  }
`;

type VariantNode = {
  id?: string | null;
  title?: string | null;
  sku?: string | null;
  price?: string | null;
  compareAtPrice?: string | null;
};

type ProductNode = {
  id?: string | null;
  title?: string | null;
  handle?: string | null;
  vendor?: string | null;
  productType?: string | null;
  status?: string | null;
  tags?: string[] | null;
  totalInventory?: number | null;
  tracksInventory?: boolean | null;
  publishedAt?: string | null;
  seo?: { title?: string | null; description?: string | null } | null;
  variants?: { nodes?: VariantNode[] | null } | null;
};

function mapVariant(node: VariantNode): ProductImportVariantSnapshot | null {
  const variantId = node.id?.trim();
  if (!variantId) return null;
  return {
    variantId,
    title: node.title?.trim() || "",
    sku: node.sku?.trim() || null,
    price: node.price ?? null,
    compareAtPrice: node.compareAtPrice ?? null,
  };
}

function mapProduct(node: ProductNode): ProductImportProductSnapshot | null {
  const productId = node.id?.trim();
  if (!productId) return null;
  return {
    productId,
    productTitle: node.title?.trim() || productId,
    handle: node.handle?.trim() || "",
    vendor: node.vendor?.trim() ?? "",
    productType: node.productType?.trim() ?? "",
    seoTitle: node.seo?.title?.trim() ?? "",
    seoDescription: node.seo?.description?.trim() ?? "",
    tags: Array.isArray(node.tags) ? node.tags : [],
    status: node.status?.trim() || "",
    totalInventory: typeof node.totalInventory === "number" ? node.totalInventory : 0,
    tracksInventory: node.tracksInventory === true,
    publishedAt: node.publishedAt ?? null,
    variants: (node.variants?.nodes ?? []).map(mapVariant).filter((item): item is ProductImportVariantSnapshot => Boolean(item)),
  };
}

function quoteTerm(value: string): string {
  return `"${value.replace(/"/g, "")}"`;
}

async function queryProducts(
  admin: ShopifyAdminGraphqlClient,
  clauses: string[],
): Promise<ProductImportProductSnapshot[]> {
  const collected: ProductImportProductSnapshot[] = [];
  const seen = new Set<string>();
  for (const group of chunkItems(clauses, 20)) {
    let after: string | null = null;
    const search = group.join(" OR ");
    for (;;) {
      const response = await admin.graphql(PRODUCTS_QUERY, {
        variables: { first: 50, after, query: search },
      });
      if (!response.ok) throw new Error(`Shopify products query failed: HTTP ${response.status}`);
      const json = (await response.json()) as {
        data?: {
          products?: {
            pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
            edges?: Array<{ node: ProductNode }>;
          };
        };
        errors?: Array<{ message: string }>;
      };
      if (json.errors?.length) {
        throw new Error(json.errors.map((error) => error.message).join("; "));
      }
      for (const edge of json.data?.products?.edges ?? []) {
        const mapped = mapProduct(edge.node);
        if (!mapped || seen.has(mapped.productId)) continue;
        seen.add(mapped.productId);
        collected.push(mapped);
      }
      if (!json.data?.products?.pageInfo?.hasNextPage || !json.data.products.pageInfo.endCursor) break;
      after = json.data.products.pageInfo.endCursor;
    }
  }
  return collected;
}

export async function fetchProductsForImport(
  admin: ShopifyAdminGraphqlClient,
  args: { handles: string[]; skus: string[]; productIds: string[] },
): Promise<ProductImportProductSnapshot[]> {
  const clauses: string[] = [];
  for (const handle of args.handles) {
    if (handle) clauses.push(`handle:${quoteTerm(handle)}`);
  }
  for (const sku of args.skus) {
    if (sku) clauses.push(`sku:${quoteTerm(sku)}`);
  }
  for (const productId of args.productIds) {
    const gid = normalizeGid(productId);
    const numeric = gid.replace(/^gid:\/\/shopify\/Product\//, "");
    if (numeric) clauses.push(`id:${numeric}`);
  }
  if (clauses.length === 0) return [];
  return queryProducts(admin, clauses);
}

export function indexImportCatalog(products: ProductImportProductSnapshot[]) {
  const byHandle = new Map<string, ProductImportProductSnapshot>();
  const byId = new Map<string, ProductImportProductSnapshot>();
  const bySku = new Map<string, ProductImportProductSnapshot[]>();
  for (const product of products) {
    byId.set(product.productId, product);
    if (product.handle) byHandle.set(product.handle.toLowerCase(), product);
    for (const variant of product.variants) {
      const sku = variant.sku?.trim().toLowerCase();
      if (!sku) continue;
      const list = bySku.get(sku) ?? [];
      list.push(product);
      bySku.set(sku, list);
    }
  }
  return { byHandle, byId, bySku };
}
