/**
 * 批量合集写回 —— 全仓库唯一调用 collectionAddProducts / collectionRemoveProducts 的地方。
 */
import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";
import type {
  BulkCollectionEditAction,
  BulkCollectionEditApplyOutcome,
  BulkCollectionEditRow,
} from "../../lib/bulkCollectionEdit";
import { chunkItems } from "../shopify/productIdQuery.server";

const LOG_PREFIX = "[BulkCollectionEdit][Apply]";
const IDS_PER_MUTATION = 50;

const ADD_MUTATION = `#graphql
  mutation BulkCollectionEditAdd($id: ID!, $productIds: [ID!]!) {
    collectionAddProducts(id: $id, productIds: $productIds) {
      userErrors { field message }
    }
  }
`;

const REMOVE_MUTATION = `#graphql
  mutation BulkCollectionEditRemove($id: ID!, $productIds: [ID!]!) {
    collectionRemoveProducts(id: $id, productIds: $productIds) {
      job { id done }
      userErrors { field message }
    }
  }
`;

export function buildBulkCollectionEditWritableRows(
  rows: BulkCollectionEditRow[],
): BulkCollectionEditRow[] {
  return rows.filter((row) => !row.skipped);
}

export async function applyBulkCollectionEdit(args: {
  admin: ShopifyAdminGraphqlClient;
  shop: string;
  collectionId: string;
  action: BulkCollectionEditAction;
  rows: BulkCollectionEditRow[];
}): Promise<BulkCollectionEditApplyOutcome> {
  const writableRows = buildBulkCollectionEditWritableRows(args.rows);
  const productIds = writableRows.map((row) => row.productId);
  const errors: Array<{ productId: string; message: string }> = [];
  let pendingJob = false;

  for (const batch of chunkItems(productIds, IDS_PER_MUTATION)) {
    const mutation = args.action === "add" ? ADD_MUTATION : REMOVE_MUTATION;
    try {
      const response = await args.admin.graphql(mutation, {
        variables: { id: args.collectionId, productIds: batch },
      });
      if (!response.ok) {
        for (const productId of batch) {
          errors.push({ productId, message: `HTTP ${response.status}` });
        }
        continue;
      }
      const json = (await response.json()) as {
        data?: {
          collectionAddProducts?: { userErrors?: Array<{ message: string }> | null };
          collectionRemoveProducts?: {
            job?: { id?: string; done?: boolean } | null;
            userErrors?: Array<{ message: string }> | null;
          };
        };
        errors?: Array<{ message: string }>;
      };
      if (json.errors?.length) {
        const message = json.errors.map((error) => error.message).join("; ");
        for (const productId of batch) errors.push({ productId, message });
        continue;
      }
      const payload =
        args.action === "add" ? json.data?.collectionAddProducts : json.data?.collectionRemoveProducts;
      const userErrors = payload?.userErrors ?? [];
      if (userErrors.length > 0) {
        const message = userErrors.map((error) => error.message).join("; ");
        for (const productId of batch) errors.push({ productId, message });
        continue;
      }
      if (
        args.action === "remove" &&
        json.data?.collectionRemoveProducts?.job &&
        json.data.collectionRemoveProducts.job.done !== true
      ) {
        pendingJob = true;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      for (const productId of batch) errors.push({ productId, message });
    }
  }

  const succeeded = writableRows.length - errors.length;
  console.info(
    `${LOG_PREFIX} shop=${args.shop} action=${args.action} succeeded=${succeeded} failed=${errors.length} pendingJob=${pendingJob}`,
  );
  return {
    at: new Date().toISOString(),
    succeeded: Math.max(0, succeeded),
    failed: errors.length,
    ...(pendingJob ? { pendingJob: true } : {}),
    errors: errors.slice(0, 50),
  };
}
