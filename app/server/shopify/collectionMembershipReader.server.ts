/**
 * 手动合集列表、合集详情、商品是否已在合集内。只读。
 */
import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";
import type { BulkCollectionEditProductInput } from "../../lib/bulkCollectionEdit";
import { chunkItems, fetchProductConnectionByIds, toNumericProductId } from "./productIdQuery.server";

const MANUAL_COLLECTIONS_QUERY = `#graphql
  query BulkCollectionEditList($first: Int!, $after: String) {
    collections(first: $first, query: "collection_type:custom", sortKey: TITLE, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes { id title }
    }
  }
`;

const MANUAL_COLLECTIONS_PAGE_SIZE = 100;
const MANUAL_COLLECTIONS_MAX = 500;

const COLLECTION_QUERY = `#graphql
  query BulkCollectionEditCollection($id: ID!) {
    collection(id: $id) {
      id
      title
      ruleSet { appliedDisjunctively }
    }
  }
`;

const PRODUCTS_QUERY = `#graphql
  query BulkCollectionEditProducts($first: Int!, $after: String, $query: String!) {
    products(first: $first, after: $after, query: $query) {
      pageInfo { hasNextPage endCursor }
      edges {
        node { id title status }
      }
    }
  }
`;

const MEMBERSHIP_QUERY = `#graphql
  query BulkCollectionEditMembership($id: ID!, $query: String!) {
    collection(id: $id) {
      products(first: 250, query: $query) {
        nodes { id }
      }
    }
  }
`;

export type ManualCollectionOption = { value: string; label: string };

export type ShopifyCollectionSnapshot = {
  id: string;
  title: string;
  smart: boolean;
};

type CollectionNode = {
  id?: string | null;
  title?: string | null;
  ruleSet?: { appliedDisjunctively?: boolean | null } | null;
};

export async function listManualCollections(
  admin: ShopifyAdminGraphqlClient,
  first = MANUAL_COLLECTIONS_PAGE_SIZE,
): Promise<ManualCollectionOption[]> {
  const out: ManualCollectionOption[] = [];
  let after: string | null = null;
  while (out.length < MANUAL_COLLECTIONS_MAX) {
    const pageSize = Math.min(first, MANUAL_COLLECTIONS_MAX - out.length);
    const response = await admin.graphql(MANUAL_COLLECTIONS_QUERY, {
      variables: { first: pageSize, after },
    });
    if (!response.ok) throw new Error(`Shopify collections query failed: HTTP ${response.status}`);
    const json = (await response.json()) as {
      data?: {
        collections?: {
          pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
          nodes?: Array<{ id?: string; title?: string }>;
        };
      };
      errors?: Array<{ message: string }>;
    };
    if (json.errors?.length) {
      throw new Error(json.errors.map((error) => error.message).join("; "));
    }
    for (const node of json.data?.collections?.nodes ?? []) {
      const value = node.id?.trim() ?? "";
      if (!value) continue;
      out.push({
        value,
        label: node.title?.trim() || value,
      });
    }
    const pageInfo = json.data?.collections?.pageInfo;
    if (!pageInfo?.hasNextPage || !pageInfo.endCursor) break;
    after = pageInfo.endCursor;
  }
  return out;
}

export async function fetchCollectionSnapshot(
  admin: ShopifyAdminGraphqlClient,
  collectionId: string,
): Promise<ShopifyCollectionSnapshot | null> {
  const response = await admin.graphql(COLLECTION_QUERY, { variables: { id: collectionId } });
  if (!response.ok) throw new Error(`Shopify collection query failed: HTTP ${response.status}`);
  const json = (await response.json()) as {
    data?: { collection?: CollectionNode | null };
    errors?: Array<{ message: string }>;
  };
  if (json.errors?.length) {
    throw new Error(json.errors.map((error) => error.message).join("; "));
  }
  const node = json.data?.collection;
  if (!node?.id) return null;
  return {
    id: node.id,
    title: node.title?.trim() || node.id,
    smart: Boolean(node.ruleSet),
  };
}

async function fetchMembershipIds(
  admin: ShopifyAdminGraphqlClient,
  collectionId: string,
  productIds: string[],
): Promise<Set<string>> {
  const inCollection = new Set<string>();
  for (const group of chunkItems(productIds.map(toNumericProductId).filter(Boolean), 25)) {
    const query = group.map((id) => `id:${id}`).join(" OR ");
    const response = await admin.graphql(MEMBERSHIP_QUERY, {
      variables: { id: collectionId, query },
    });
    if (!response.ok) throw new Error(`Shopify collection products query failed: HTTP ${response.status}`);
    const json = (await response.json()) as {
      data?: { collection?: { products?: { nodes?: Array<{ id?: string }> } } };
      errors?: Array<{ message: string }>;
    };
    if (json.errors?.length) {
      throw new Error(json.errors.map((error) => error.message).join("; "));
    }
    for (const node of json.data?.collection?.products?.nodes ?? []) {
      if (node.id) inCollection.add(node.id);
    }
  }
  return inCollection;
}

export async function fetchCollectionMembershipByProductIds(
  admin: ShopifyAdminGraphqlClient,
  collectionId: string,
  productIds: string[],
  options: { maxProducts: number },
): Promise<{ products: BulkCollectionEditProductInput[]; truncated: boolean }> {
  const { items, truncated } = await fetchProductConnectionByIds(
    admin,
    productIds,
    {
      query: PRODUCTS_QUERY,
      maxProducts: options.maxProducts,
      mapNode: (node: { id?: string | null; title?: string | null; status?: string | null }) => {
        const productId = node.id?.trim();
        if (!productId) return null;
        return {
          productId,
          productTitle: node.title?.trim() || productId,
          status: node.status?.trim() ?? "",
          inCollection: false,
        };
      },
    },
  );
  const membership = await fetchMembershipIds(
    admin,
    collectionId,
    items.map((item) => item.productId),
  );
  return {
    products: items.map((item) => ({
      ...item,
      inCollection: membership.has(item.productId),
    })),
    truncated,
  };
}
