/**
 * 批量合集写回 —— 全仓库唯一调用 collectionUpdate 改合集成员的地方。
 */
import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";
import type {
  BulkCollectionEditAction,
  BulkCollectionEditApplyOutcome,
  BulkCollectionEditRow,
} from "../../lib/bulkCollectionEdit";
import { chunkItems } from "../shopify/productIdQuery.server";
import { fetchCollectionSnapshot } from "../shopify/collectionMembershipReader.server";

const LOG_PREFIX = "[BulkCollectionEdit][Apply]";
const IDS_PER_MUTATION = 50;
const NOT_WRITABLE = "这个合集没有可手动编辑的来源";

const UPDATE_MUTATION = `#graphql
  mutation BulkCollectionEditUpdate($collection: CollectionUpdateInput!) {
    collectionUpdate(collection: $collection) {
      job { id done }
      userErrors { field message }
    }
  }
`;

type ProductSelection = { productId: string };

export function buildBulkCollectionEditWritableRows(
  rows: BulkCollectionEditRow[],
): BulkCollectionEditRow[] {
  return rows.filter((row) => !row.skipped);
}

export function buildBulkCollectionEditUpdateInput(args: {
  collectionId: string;
  sourceId: string;
  action: BulkCollectionEditAction;
  productIds: string[];
}): Record<string, unknown> {
  const selections: ProductSelection[] = args.productIds.map((productId) => ({ productId }));
  const membership =
    args.action === "add"
      ? { inclusion: { selectionsToAdd: selections }, exclusion: { selectionsToRemove: selections } }
      : { inclusion: { selectionsToRemove: selections }, exclusion: { selectionsToAdd: selections } };
  return {
    id: args.collectionId,
    sourcesToUpdate: [{ condition: { id: args.sourceId, ...membership } }],
  };
}

function emptyOutcome(errors: BulkCollectionEditApplyOutcome["errors"]): BulkCollectionEditApplyOutcome {
  return {
    at: new Date().toISOString(),
    succeeded: 0,
    failed: errors.length,
    errors: errors.slice(0, 50),
  };
}

export async function applyBulkCollectionEdit(args: {
  admin: ShopifyAdminGraphqlClient;
  shop: string;
  collectionId: string;
  action: BulkCollectionEditAction;
  rows: BulkCollectionEditRow[];
}): Promise<BulkCollectionEditApplyOutcome> {
  const productIds = buildBulkCollectionEditWritableRows(args.rows).map((row) => row.productId);
  if (productIds.length === 0) return emptyOutcome([]);

  const collection = await fetchCollectionSnapshot(args.admin, args.collectionId);
  if (!collection?.sourceId) {
    return emptyOutcome(productIds.map((productId) => ({ productId, message: NOT_WRITABLE })));
  }

  const errors: BulkCollectionEditApplyOutcome["errors"] = [];
  let pendingJob = false;
  for (const batch of chunkItems(productIds, IDS_PER_MUTATION)) {
    const batchResult = await mutateMembershipBatch({
      admin: args.admin,
      collectionId: args.collectionId,
      sourceId: collection.sourceId,
      action: args.action,
      productIds: batch,
    });
    errors.push(...batchResult.errors);
    if (batchResult.pendingJob) pendingJob = true;
  }

  const succeeded = Math.max(0, productIds.length - errors.length);
  console.info(
    `${LOG_PREFIX} shop=${args.shop} action=${args.action} succeeded=${succeeded} failed=${errors.length} pendingJob=${pendingJob}`,
  );
  return {
    at: new Date().toISOString(),
    succeeded,
    failed: errors.length,
    ...(pendingJob ? { pendingJob: true } : {}),
    errors: errors.slice(0, 50),
  };
}

async function mutateMembershipBatch(args: {
  admin: ShopifyAdminGraphqlClient;
  collectionId: string;
  sourceId: string;
  action: BulkCollectionEditAction;
  productIds: string[];
}): Promise<{ errors: BulkCollectionEditApplyOutcome["errors"]; pendingJob: boolean }> {
  const fail = (message: string) => ({
    errors: args.productIds.map((productId) => ({ productId, message })),
    pendingJob: false,
  });
  try {
    const response = await args.admin.graphql(UPDATE_MUTATION, {
      variables: {
        collection: buildBulkCollectionEditUpdateInput(args),
      },
    });
    if (!response.ok) return fail(`HTTP ${response.status}`);
    const json = (await response.json()) as {
      data?: {
        collectionUpdate?: {
          job?: { id?: string; done?: boolean } | null;
          userErrors?: Array<{ message: string }> | null;
        };
      };
      errors?: Array<{ message: string }>;
    };
    if (json.errors?.length) {
      return fail(json.errors.map((error) => error.message).join("; "));
    }
    const payload = json.data?.collectionUpdate;
    const userErrors = payload?.userErrors ?? [];
    if (userErrors.length > 0) {
      return fail(userErrors.map((error) => error.message).join("; "));
    }
    return {
      errors: [],
      pendingJob: Boolean(payload?.job) && payload?.job?.done !== true,
    };
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
}
