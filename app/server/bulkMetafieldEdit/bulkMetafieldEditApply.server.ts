/**
 * 批量改商品/变体 Metafield 写回。set 走 metafieldsSet，空值走 metafieldsDelete。
 */
import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";
import {
  BULK_METAFIELD_SET_BATCH_SIZE,
  type BulkMetafieldEditApplyOutcome,
  type BulkMetafieldEditRow,
} from "../../lib/bulkMetafieldEdit";
import { chunkItems, mapWithConcurrency } from "../shopify/productIdQuery.server";

const LOG_PREFIX = "[BulkMetafieldEdit][Apply]";
const MUTATION_CONCURRENCY = 2;

const METAFIELDS_SET = `#graphql
  mutation BulkMetafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id }
      userErrors { field message }
    }
  }
`;

const METAFIELDS_DELETE = `#graphql
  mutation BulkMetafieldsDelete($metafields: [MetafieldIdentifierInput!]!) {
    metafieldsDelete(metafields: $metafields) {
      deletedMetafields { key namespace ownerId }
      userErrors { field message }
    }
  }
`;

export function buildBulkMetafieldEditWritableRows(rows: BulkMetafieldEditRow[]): BulkMetafieldEditRow[] {
  return rows.filter((row) => !row.skipped);
}

async function applySetBatch(
  admin: ShopifyAdminGraphqlClient,
  rows: BulkMetafieldEditRow[],
): Promise<Array<{ ownerId: string; message: string }>> {
  try {
    const response = await admin.graphql(METAFIELDS_SET, {
      variables: {
        metafields: rows.map((row) => ({
          ownerId: row.ownerId,
          namespace: row.namespace,
          key: row.key,
          type: row.type,
          value: row.afterValue,
        })),
      },
    });
    if (!response.ok) return rows.map((row) => ({ ownerId: row.ownerId, message: `HTTP ${response.status}` }));
    const json = (await response.json()) as {
      data?: { metafieldsSet?: { userErrors?: Array<{ message: string }> | null } };
      errors?: Array<{ message: string }>;
    };
    if (json.errors?.length) {
      const message = json.errors.map((error) => error.message).join("; ");
      return rows.map((row) => ({ ownerId: row.ownerId, message }));
    }
    const userErrors = json.data?.metafieldsSet?.userErrors ?? [];
    if (userErrors.length > 0) {
      const message = userErrors.map((error) => error.message).join("; ");
      return rows.map((row) => ({ ownerId: row.ownerId, message }));
    }
    return [];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return rows.map((row) => ({ ownerId: row.ownerId, message }));
  }
}

async function applyDeleteBatch(
  admin: ShopifyAdminGraphqlClient,
  rows: BulkMetafieldEditRow[],
): Promise<Array<{ ownerId: string; message: string }>> {
  try {
    const response = await admin.graphql(METAFIELDS_DELETE, {
      variables: {
        metafields: rows.map((row) => ({
          ownerId: row.ownerId,
          namespace: row.namespace,
          key: row.key,
        })),
      },
    });
    if (!response.ok) return rows.map((row) => ({ ownerId: row.ownerId, message: `HTTP ${response.status}` }));
    const json = (await response.json()) as {
      data?: { metafieldsDelete?: { userErrors?: Array<{ message: string }> | null } };
      errors?: Array<{ message: string }>;
    };
    if (json.errors?.length) {
      const message = json.errors.map((error) => error.message).join("; ");
      return rows.map((row) => ({ ownerId: row.ownerId, message }));
    }
    const userErrors = json.data?.metafieldsDelete?.userErrors ?? [];
    if (userErrors.length > 0) {
      const message = userErrors.map((error) => error.message).join("; ");
      return rows.map((row) => ({ ownerId: row.ownerId, message }));
    }
    return [];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return rows.map((row) => ({ ownerId: row.ownerId, message }));
  }
}

export async function applyBulkMetafieldEdit(args: {
  admin: ShopifyAdminGraphqlClient;
  shop: string;
  rows: BulkMetafieldEditRow[];
}): Promise<BulkMetafieldEditApplyOutcome> {
  const writable = buildBulkMetafieldEditWritableRows(args.rows);
  const setRows = writable.filter((row) => row.action === "set");
  const deleteRows = writable.filter((row) => row.action === "delete");
  const setBatches = chunkItems(setRows, BULK_METAFIELD_SET_BATCH_SIZE);
  const deleteBatches = chunkItems(deleteRows, BULK_METAFIELD_SET_BATCH_SIZE);
  const setOutcomes = await mapWithConcurrency(setBatches, MUTATION_CONCURRENCY, (batch) =>
    applySetBatch(args.admin, batch),
  );
  const deleteOutcomes = await mapWithConcurrency(deleteBatches, MUTATION_CONCURRENCY, (batch) =>
    applyDeleteBatch(args.admin, batch),
  );
  const errors = [...setOutcomes.flat(), ...deleteOutcomes.flat()];
  const succeeded = writable.length - errors.length;
  console.info(
    `${LOG_PREFIX} shop=${args.shop} rows=${writable.length} succeeded=${succeeded} failed=${errors.length}`,
  );
  return {
    at: new Date().toISOString(),
    succeeded: Math.max(0, succeeded),
    failed: errors.length,
    errors: errors.slice(0, 50),
  };
}
