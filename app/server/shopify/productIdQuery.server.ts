/**
 * 按商品 GID 分页读取 Shopify products 连接。只读，不含 mutation。
 */
import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";

export const PRODUCT_PAGE_SIZE = 100;
export const PRODUCT_IDS_PER_QUERY = 25;

export function toNumericProductId(gid: string): string {
  return gid.trim().replace(/^gid:\/\/shopify\/Product\//, "");
}

export function chunkItems<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export async function fetchProductConnectionByIds<TNode, TOut>(
  admin: ShopifyAdminGraphqlClient,
  productIds: string[],
  options: {
    query: string;
    maxProducts: number;
    mapNode: (node: TNode) => TOut | null;
    idsPerQuery?: number;
    pageSize?: number;
  },
): Promise<{ items: TOut[]; truncated: boolean }> {
  const numericIds = productIds.map(toNumericProductId).filter(Boolean);
  if (numericIds.length === 0) return { items: [], truncated: false };

  const collected: TOut[] = [];
  let truncated = false;
  const idsPerQuery = options.idsPerQuery ?? PRODUCT_IDS_PER_QUERY;
  const pageSize = options.pageSize ?? PRODUCT_PAGE_SIZE;

  for (const group of chunkItems(numericIds, idsPerQuery)) {
    if (truncated) break;
    let after: string | null = null;
    const search = group.map((id) => `id:${id}`).join(" OR ");

    while (!truncated) {
      const response = await admin.graphql(options.query, {
        variables: { first: pageSize, after, query: search },
      });
      if (!response.ok) {
        throw new Error(`Shopify products query failed: HTTP ${response.status}`);
      }
      const json = (await response.json()) as {
        data?: {
          products?: {
            pageInfo: { hasNextPage: boolean; endCursor: string | null };
            edges: Array<{ node: TNode }>;
          };
        };
        errors?: Array<{ message: string }>;
      };
      if (json.errors?.length) {
        throw new Error(
          `Shopify products GraphQL errors: ${json.errors.map((error) => error.message).join("; ")}`,
        );
      }
      const connection = json.data?.products;
      if (!connection) break;
      for (const edge of connection.edges) {
        if (collected.length >= options.maxProducts) {
          truncated = true;
          break;
        }
        const mapped = options.mapNode(edge.node);
        if (mapped) collected.push(mapped);
      }
      if (truncated) break;
      if (!connection.pageInfo.hasNextPage || !connection.pageInfo.endCursor) break;
      after = connection.pageInfo.endCursor;
    }
  }

  return { items: collected, truncated };
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) || 0 }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}
