/**
 * 读取商品/变体 Metafield definition，供导入校验类型。只读。
 */
import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";
import type { BulkMetafieldDefinition, BulkMetafieldOwner } from "../../lib/bulkMetafieldEdit";

const DEFINITIONS_QUERY = `#graphql
  query ImportMetafieldDefinitions($ownerType: MetafieldOwnerType!, $first: Int!, $after: String) {
    metafieldDefinitions(ownerType: $ownerType, first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes { namespace key type { name } }
    }
  }
`;

type DefinitionNode = {
  namespace?: string | null;
  key?: string | null;
  type?: { name?: string | null } | null;
};

async function fetchDefinitionsForOwner(
  admin: ShopifyAdminGraphqlClient,
  ownerType: "PRODUCT" | "PRODUCTVARIANT",
  owner: BulkMetafieldOwner,
): Promise<BulkMetafieldDefinition[]> {
  const collected: BulkMetafieldDefinition[] = [];
  let after: string | null = null;
  for (let page = 0; page < 5; page += 1) {
    const response = await admin.graphql(DEFINITIONS_QUERY, {
      variables: { ownerType, first: 100, after },
    });
    if (!response.ok) throw new Error(`Shopify metafieldDefinitions failed: HTTP ${response.status}`);
    const json = (await response.json()) as {
      data?: {
        metafieldDefinitions?: {
          pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
          nodes?: DefinitionNode[] | null;
        };
      };
      errors?: Array<{ message: string }>;
    };
    if (json.errors?.length) {
      throw new Error(json.errors.map((error) => error.message).join("; "));
    }
    for (const node of json.data?.metafieldDefinitions?.nodes ?? []) {
      const namespace = node.namespace?.trim();
      const key = node.key?.trim();
      const type = node.type?.name?.trim();
      if (!namespace || !key || !type) continue;
      collected.push({ owner, namespace, key, type });
    }
    if (!json.data?.metafieldDefinitions?.pageInfo?.hasNextPage) break;
    after = json.data.metafieldDefinitions.pageInfo.endCursor ?? null;
    if (!after) break;
  }
  return collected;
}

export function indexMetafieldDefinitions(
  definitions: BulkMetafieldDefinition[],
): Map<string, BulkMetafieldDefinition> {
  const map = new Map<string, BulkMetafieldDefinition>();
  for (const definition of definitions) {
    map.set(`${definition.owner}:${definition.namespace}.${definition.key}`.toLowerCase(), definition);
  }
  return map;
}

export async function fetchImportMetafieldDefinitions(
  admin: ShopifyAdminGraphqlClient,
): Promise<BulkMetafieldDefinition[]> {
  const [product, variant] = await Promise.all([
    fetchDefinitionsForOwner(admin, "PRODUCT", "product"),
    fetchDefinitionsForOwner(admin, "PRODUCTVARIANT", "variant"),
  ]);
  return [...product, ...variant];
}
