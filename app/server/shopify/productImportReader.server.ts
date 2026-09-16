/**
 * 按 Handle / SKU / 商品 ID 读取导入所需快照。只读。
 */
import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";
import { chunkItems } from "../shopify/productIdQuery.server";
import type { BulkMetafieldValue } from "../../lib/bulkMetafieldEdit";
import {
  normalizeGid,
  type ProductImportProductSnapshot,
  type ProductImportVariantSnapshot,
} from "../../lib/productImportPlan";
import { parseWeightUnit } from "../../lib/bulkVariantIdentityEdit";
import { normalizeImportSku } from "../../lib/productImport";

const METAFIELD_PAGE_SIZE = 250;
const METAFIELD_PAGE_CAP = 8;
const PRODUCTS_PAGE_SIZE = 50;
const PRODUCTS_WITH_METAFIELDS_PAGE_SIZE = 25;

const PRODUCTS_QUERY = `#graphql
  query ProductImportProducts($first: Int!, $after: String, $query: String!) {
    products(first: $first, after: $after, query: $query) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          title
          handle
          descriptionHtml
          vendor
          productType
          status
          tags
          totalInventory
          tracksInventory
          publishedAt
          seo { title description }
          variants(first: 100) {
            nodes {
              id
              title
              sku
              barcode
              price
              compareAtPrice
              selectedOptions { name value }
              inventoryItem { id unitCost { amount } measurement { weight { value unit } } }
            }
          }
        }
      }
    }
  }
`;

const PRODUCTS_WITH_METAFIELDS_QUERY = `#graphql
  query ProductImportProductsWithMetafields($first: Int!, $after: String, $query: String!) {
    products(first: $first, after: $after, query: $query) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          title
          handle
          descriptionHtml
          vendor
          productType
          status
          tags
          totalInventory
          tracksInventory
          publishedAt
          seo { title description }
          metafields(first: 250) {
            pageInfo { hasNextPage endCursor }
            nodes { namespace key type value }
          }
          variants(first: 100) {
            nodes {
              id
              title
              sku
              barcode
              price
              compareAtPrice
              selectedOptions { name value }
              inventoryItem { id unitCost { amount } measurement { weight { value unit } } }
              metafields(first: 20) {
                pageInfo { hasNextPage endCursor }
                nodes { namespace key type value }
              }
            }
          }
        }
      }
    }
  }
`;

const OWNER_METAFIELDS_QUERY = `#graphql
  query ProductImportOwnerMetafields($id: ID!, $first: Int!, $after: String) {
    node(id: $id) {
      ... on Product {
        metafields(first: $first, after: $after) {
          pageInfo { hasNextPage endCursor }
          nodes { namespace key type value }
        }
      }
      ... on ProductVariant {
        metafields(first: $first, after: $after) {
          pageInfo { hasNextPage endCursor }
          nodes { namespace key type value }
        }
      }
    }
  }
`;

type MetafieldNode = {
  namespace?: string | null;
  key?: string | null;
  type?: string | null;
  value?: string | null;
};

type MetafieldConnection = {
  pageInfo?: { hasNextPage?: boolean; endCursor?: string | null } | null;
  nodes?: MetafieldNode[] | null;
};

type VariantNode = {
  id?: string | null;
  title?: string | null;
  sku?: string | null;
  barcode?: string | null;
  price?: string | null;
  compareAtPrice?: string | null;
  selectedOptions?: Array<{ name?: string | null; value?: string | null }> | null;
  inventoryItem?: {
    id?: string | null;
    unitCost?: { amount?: string | null } | null;
    measurement?: { weight?: { value?: number | null; unit?: string | null } | null } | null;
  } | null;
  metafields?: MetafieldConnection | null;
};

type ProductNode = {
  id?: string | null;
  title?: string | null;
  handle?: string | null;
  descriptionHtml?: string | null;
  vendor?: string | null;
  productType?: string | null;
  status?: string | null;
  tags?: string[] | null;
  totalInventory?: number | null;
  tracksInventory?: boolean | null;
  publishedAt?: string | null;
  seo?: { title?: string | null; description?: string | null } | null;
  metafields?: MetafieldConnection | null;
  variants?: { nodes?: VariantNode[] | null } | null;
};

function mapMetafields(nodes: MetafieldNode[] | null | undefined): BulkMetafieldValue[] {
  const out: BulkMetafieldValue[] = [];
  for (const node of nodes ?? []) {
    const namespace = node.namespace?.trim();
    const key = node.key?.trim();
    if (!namespace || !key) continue;
    out.push({
      namespace,
      key,
      type: node.type?.trim() || "",
      value: node.value ?? "",
    });
  }
  return out;
}

function mapVariant(node: VariantNode): ProductImportVariantSnapshot | null {
  const variantId = node.id?.trim();
  if (!variantId) return null;
  return {
    variantId,
    title: node.title?.trim() || "",
    sku: node.sku?.trim() || null,
    barcode: node.barcode?.trim() || null,
    price: node.price ?? null,
    compareAtPrice: node.compareAtPrice ?? null,
    inventoryItemId: node.inventoryItem?.id?.trim() || null,
    cost: node.inventoryItem?.unitCost?.amount ?? null,
    weightValue:
      typeof node.inventoryItem?.measurement?.weight?.value === "number"
        ? node.inventoryItem.measurement.weight.value
        : null,
    weightUnit: parseWeightUnit(node.inventoryItem?.measurement?.weight?.unit ?? ""),
    metafields: mapMetafields(node.metafields?.nodes),
    selectedOptions: (node.selectedOptions ?? [])
      .map((option) => ({
        name: option.name?.trim() || "",
        value: option.value?.trim() || "",
      }))
      .filter((option) => option.value),
  };
}

function mapProduct(node: ProductNode): ProductImportProductSnapshot | null {
  const productId = node.id?.trim();
  if (!productId) return null;
  return {
    productId,
    productTitle: node.title?.trim() || productId,
    handle: node.handle?.trim() || "",
    descriptionHtml: node.descriptionHtml ?? "",
    vendor: node.vendor?.trim() ?? "",
    productType: node.productType?.trim() ?? "",
    seoTitle: node.seo?.title?.trim() ?? "",
    seoDescription: node.seo?.description?.trim() ?? "",
    tags: Array.isArray(node.tags) ? node.tags : [],
    status: node.status?.trim() || "",
    totalInventory: typeof node.totalInventory === "number" ? node.totalInventory : 0,
    tracksInventory: node.tracksInventory === true,
    publishedAt: node.publishedAt ?? null,
    metafields: mapMetafields(node.metafields?.nodes),
    variants: (node.variants?.nodes ?? [])
      .map(mapVariant)
      .filter((item): item is ProductImportVariantSnapshot => Boolean(item)),
  };
}

function quoteTerm(value: string): string {
  return `"${value.replace(/"/g, "")}"`;
}

function nextMetafieldCursor(
  pageInfo?: { hasNextPage?: boolean; endCursor?: string | null } | null,
): string | null {
  if (!pageInfo?.hasNextPage) return null;
  return pageInfo.endCursor?.trim() || null;
}

function metafieldKey(item: BulkMetafieldValue): string {
  return `${item.namespace}.${item.key}`.toLowerCase();
}

async function fetchOwnerMetafieldPage(
  admin: ShopifyAdminGraphqlClient,
  ownerId: string,
  after: string,
): Promise<MetafieldConnection> {
  const response = await admin.graphql(OWNER_METAFIELDS_QUERY, {
    variables: { id: ownerId, first: METAFIELD_PAGE_SIZE, after },
  });
  if (!response.ok) throw new Error(`Shopify metafields query failed: HTTP ${response.status}`);
  const json = (await response.json()) as {
    data?: { node?: { metafields?: MetafieldConnection | null } | null };
    errors?: Array<{ message: string }>;
  };
  if (json.errors?.length) {
    throw new Error(json.errors.map((error) => error.message).join("; "));
  }
  return json.data?.node?.metafields ?? {};
}

async function completeMetafields(
  admin: ShopifyAdminGraphqlClient,
  ownerId: string,
  connection: MetafieldConnection | null | undefined,
): Promise<BulkMetafieldValue[]> {
  const collected = mapMetafields(connection?.nodes);
  const seen = new Set(collected.map(metafieldKey));
  let after = nextMetafieldCursor(connection?.pageInfo);
  for (let page = 0; after && page < METAFIELD_PAGE_CAP; page += 1) {
    const nextPage = await fetchOwnerMetafieldPage(admin, ownerId, after);
    for (const item of mapMetafields(nextPage.nodes)) {
      const key = metafieldKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      collected.push(item);
    }
    after = nextMetafieldCursor(nextPage.pageInfo);
  }
  return collected;
}

async function hydrateProductMetafields(
  admin: ShopifyAdminGraphqlClient,
  node: ProductNode,
  product: ProductImportProductSnapshot,
): Promise<ProductImportProductSnapshot> {
  product.metafields = await completeMetafields(admin, product.productId, node.metafields);
  const variantNodes = node.variants?.nodes ?? [];
  for (const variant of product.variants) {
    const variantNode = variantNodes.find((item) => item.id === variant.variantId);
    variant.metafields = await completeMetafields(admin, variant.variantId, variantNode?.metafields);
  }
  return product;
}

async function queryProducts(
  admin: ShopifyAdminGraphqlClient,
  clauses: string[],
  query: string,
  options: { includeMetafields: boolean },
): Promise<ProductImportProductSnapshot[]> {
  const collected: ProductImportProductSnapshot[] = [];
  const seen = new Set<string>();
  const first = options.includeMetafields ? PRODUCTS_WITH_METAFIELDS_PAGE_SIZE : PRODUCTS_PAGE_SIZE;
  for (const group of chunkItems(clauses, 20)) {
    let after: string | null = null;
    const search = group.join(" OR ");
    for (;;) {
      const response = await admin.graphql(query, {
        variables: { first, after, query: search },
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
        collected.push(
          options.includeMetafields
            ? await hydrateProductMetafields(admin, edge.node, mapped)
            : mapped,
        );
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
  options: { includeMetafields?: boolean } = {},
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
  const includeMetafields = options.includeMetafields === true;
  return queryProducts(
    admin,
    clauses,
    includeMetafields ? PRODUCTS_WITH_METAFIELDS_QUERY : PRODUCTS_QUERY,
    { includeMetafields },
  );
}

export function indexImportCatalog(products: ProductImportProductSnapshot[]) {
  const byHandle = new Map<string, ProductImportProductSnapshot>();
  const byId = new Map<string, ProductImportProductSnapshot>();
  const bySku = new Map<string, ProductImportProductSnapshot[]>();
  for (const product of products) {
    byId.set(product.productId, product);
    if (product.handle) byHandle.set(product.handle.toLowerCase(), product);
    for (const variant of product.variants) {
      const sku = normalizeImportSku(variant.sku ?? "").toLowerCase();
      if (!sku) continue;
      const list = bySku.get(sku) ?? [];
      if (!list.some((item) => item.productId === product.productId)) list.push(product);
      bySku.set(sku, list);
    }
  }
  return { byHandle, byId, bySku };
}
