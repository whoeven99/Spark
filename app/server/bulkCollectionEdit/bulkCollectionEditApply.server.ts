/**
 * 批量入 / 出 Collection 写回执行器 —— 全仓库唯一会修改合集手动成员的地方。
 *
 * 只由 `/api/bulk-collection-edit` 在用户看过变更清单并二次确认后调用；
 * Agent 回合内（chat-stream / Skill / dry-run）都不允许走到这里。
 *
 * 为什么用两个已 deprecated 的 mutation：
 * 2026-07 的 `collectionAddProducts` / `collectionRemoveProducts` 都指向
 * `collectionUpdate` 的 `sources → inclusion.selectionsToAdd/Remove`，但
 * `CollectionUpdateSourceTargetInput` 只有 `condition` / `subCollections` 两个分支，
 * 都要求先有一个 source id。普通手动合集没有条件来源，走新路等于给它凭空造一个规则来源，
 * 语义完全不同。等 Shopify 给手动成员补上非 source 的入口再迁移。
 *
 * 两个 mutation 的行为差异很大，写回策略也因此不同：
 *   - 加入：同步返回，但**全有或全无**——批次里只要有一个商品已在合集里，整批都不会加。
 *     所以批次失败后退化成逐个重试，把真正的坏行隔离出来，其余商品照常写入。
 *   - 移出：返回异步 Job，不代表已完成。提交后有界轮询；预算内没跑完就如实标记
 *     pendingJob，不谎报「已完成」。它不校验商品是否真的在合集里，
 *     所以批次失败通常是合集级问题，逐个重试没有意义。
 */
import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";
import type {
  BulkCollectionEditAction,
  BulkCollectionEditApplyOutcome,
  BulkCollectionEditRow,
} from "../../lib/bulkCollectionEdit";

const LOG_PREFIX = "[BulkCollectionEdit][Apply]";
/** 文档给的上限是 250，留出余量并让失败批次的逐个重试代价可控。 */
const BATCH_SIZE = 100;
const JOB_POLL_ATTEMPTS = 6;
const JOB_POLL_BASE_MS = 500;

const COLLECTION_ADD_PRODUCTS = `#graphql
  mutation BulkCollectionEditAdd($id: ID!, $productIds: [ID!]!) {
    collectionAddProducts(id: $id, productIds: $productIds) {
      collection { id }
      userErrors { field message }
    }
  }
`;

const COLLECTION_REMOVE_PRODUCTS = `#graphql
  mutation BulkCollectionEditRemove($id: ID!, $productIds: [ID!]!) {
    collectionRemoveProducts(id: $id, productIds: $productIds) {
      job { id done }
      userErrors { field message }
    }
  }
`;

const COLLECTION_JOB_STATUS = `#graphql
  query BulkCollectionEditJob($id: ID!) {
    job(id: $id) { id done }
  }
`;

type ProductError = { productId: string; message: string };

/** 只保留真正会写入的行：方向与本次操作一致，且前后归属确实变了。 */
export function buildBulkCollectionEditWritableRows(
  rows: BulkCollectionEditRow[],
  action: BulkCollectionEditAction,
): BulkCollectionEditRow[] {
  const targetInCollection = action === "add";
  return rows.filter(
    (row) =>
      !row.skipped &&
      row.beforeInCollection !== row.afterInCollection &&
      row.afterInCollection === targetInCollection,
  );
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 返回错误文案；null 表示这一批成功。 */
async function runAddBatch(
  admin: ShopifyAdminGraphqlClient,
  collectionId: string,
  productIds: string[],
): Promise<string | null> {
  try {
    const response = await admin.graphql(COLLECTION_ADD_PRODUCTS, {
      variables: { id: collectionId, productIds },
    });
    if (!response.ok) return `HTTP ${response.status}`;
    const json = (await response.json()) as {
      data?: {
        collectionAddProducts?: {
          userErrors?: Array<{ message: string }> | null;
        } | null;
      };
      errors?: Array<{ message: string }>;
    };
    if (json.errors?.length) return json.errors.map((e) => e.message).join("; ");
    const userErrors = json.data?.collectionAddProducts?.userErrors ?? [];
    if (userErrors.length > 0) return userErrors.map((e) => e.message).join("; ");
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/** 返回 jobId；error 非空表示这一批提交失败。 */
async function runRemoveBatch(
  admin: ShopifyAdminGraphqlClient,
  collectionId: string,
  productIds: string[],
): Promise<{ jobId: string | null; error: string | null }> {
  try {
    const response = await admin.graphql(COLLECTION_REMOVE_PRODUCTS, {
      variables: { id: collectionId, productIds },
    });
    if (!response.ok) return { jobId: null, error: `HTTP ${response.status}` };
    const json = (await response.json()) as {
      data?: {
        collectionRemoveProducts?: {
          job?: { id: string; done?: boolean | null } | null;
          userErrors?: Array<{ message: string }> | null;
        } | null;
      };
      errors?: Array<{ message: string }>;
    };
    if (json.errors?.length) {
      return { jobId: null, error: json.errors.map((e) => e.message).join("; ") };
    }
    const payload = json.data?.collectionRemoveProducts;
    const userErrors = payload?.userErrors ?? [];
    if (userErrors.length > 0) {
      return { jobId: null, error: userErrors.map((e) => e.message).join("; ") };
    }
    if (!payload?.job?.id) {
      return { jobId: null, error: "Shopify 未返回移除任务，请稍后重试" };
    }
    return { jobId: payload.job.done === true ? null : payload.job.id, error: null };
  } catch (e) {
    return { jobId: null, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 有界轮询；预算内全部完成返回 true，否则 false（调用方据此标 pendingJob）。 */
async function waitForJobs(
  admin: ShopifyAdminGraphqlClient,
  jobIds: string[],
): Promise<boolean> {
  let pending = [...jobIds];
  for (let attempt = 1; attempt <= JOB_POLL_ATTEMPTS && pending.length > 0; attempt += 1) {
    await sleep(JOB_POLL_BASE_MS * attempt);
    const stillPending: string[] = [];
    for (const jobId of pending) {
      try {
        const response = await admin.graphql(COLLECTION_JOB_STATUS, {
          variables: { id: jobId },
        });
        if (!response.ok) {
          stillPending.push(jobId);
          continue;
        }
        const json = (await response.json()) as {
          data?: { job?: { done?: boolean | null } | null };
        };
        if (json.data?.job?.done !== true) stillPending.push(jobId);
      } catch {
        // 查询作业状态失败不代表移除失败，下一轮再看
        stillPending.push(jobId);
      }
    }
    pending = stillPending;
  }
  return pending.length === 0;
}

async function applyAdd(
  admin: ShopifyAdminGraphqlClient,
  collectionId: string,
  productIds: string[],
): Promise<ProductError[]> {
  const errors: ProductError[] = [];
  for (const batch of chunk(productIds, BATCH_SIZE)) {
    const batchError = await runAddBatch(admin, collectionId, batch);
    if (!batchError) continue;
    if (batch.length === 1) {
      errors.push({ productId: batch[0], message: batchError });
      continue;
    }
    // 整批被回滚了，逐个重试把坏行挑出来，其余商品仍然写进去
    for (const productId of batch) {
      const singleError = await runAddBatch(admin, collectionId, [productId]);
      if (singleError) errors.push({ productId, message: singleError });
    }
  }
  return errors;
}

async function applyRemove(
  admin: ShopifyAdminGraphqlClient,
  collectionId: string,
  productIds: string[],
): Promise<{ errors: ProductError[]; allJobsDone: boolean }> {
  const errors: ProductError[] = [];
  const jobIds: string[] = [];
  for (const batch of chunk(productIds, BATCH_SIZE)) {
    const { jobId, error } = await runRemoveBatch(admin, collectionId, batch);
    if (error) {
      // 移除不校验成员关系，批次失败基本是合集级问题，逐个重试只会重复同一个错误
      for (const productId of batch) errors.push({ productId, message: error });
      continue;
    }
    if (jobId) jobIds.push(jobId);
  }
  const allJobsDone = jobIds.length === 0 ? true : await waitForJobs(admin, jobIds);
  return { errors, allJobsDone };
}

/** 执行写回。永不抛出 per-product 错误，逐行收集后交给调用方落库。 */
export async function applyBulkCollectionEdit(args: {
  admin: ShopifyAdminGraphqlClient;
  shop: string;
  collectionId: string;
  action: BulkCollectionEditAction;
  rows: BulkCollectionEditRow[];
}): Promise<BulkCollectionEditApplyOutcome> {
  const writableRows = buildBulkCollectionEditWritableRows(args.rows, args.action);
  const productIds = writableRows.map((row) => row.productId);

  let errors: ProductError[];
  let pendingJob = false;
  if (args.action === "add") {
    errors = await applyAdd(args.admin, args.collectionId, productIds);
  } else {
    const outcome = await applyRemove(args.admin, args.collectionId, productIds);
    errors = outcome.errors;
    pendingJob = !outcome.allJobsDone;
  }

  const succeeded = writableRows.length - errors.length;

  console.info(
    `${LOG_PREFIX} shop=${args.shop} action=${args.action} collection=${args.collectionId} products=${writableRows.length} succeeded=${succeeded} failed=${errors.length} pendingJob=${pendingJob}`,
  );

  return {
    at: new Date().toISOString(),
    succeeded,
    failed: errors.length,
    // 错误清单只留前 50 条，避免任务 result 无上限膨胀
    errors: errors.slice(0, 50),
    ...(pendingJob ? { pendingJob: true } : {}),
  };
}
