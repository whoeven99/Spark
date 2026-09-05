/**
 * 批量调价写回执行器 —— 全仓库唯一会修改 Shopify 商品价格的地方。
 *
 * 只由 `/api/bulk-price-edit` 在用户看过变更清单并二次确认后调用；
 * Agent 回合内（chat-stream / Skill / dry-run）都不允许走到这里。
 *
 * 写回策略：按 productId 分组（productVariantsBulkUpdate 是按商品的），
 * 每次最多 250 个变体，并发 2，单个商品失败不阻塞其它商品。
 */
import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";
import {
  BULK_PRICE_EDIT_VARIANTS_PER_MUTATION,
  type BulkPriceEditApplyOutcome,
  type BulkPriceEditRow,
} from "../../lib/bulkPriceEdit";

const LOG_PREFIX = "[BulkPriceEdit][Apply]";
const MUTATION_CONCURRENCY = 2;

const VARIANTS_BULK_UPDATE = `#graphql
  mutation BulkPriceEditUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants { id price compareAtPrice }
      userErrors { field message }
    }
  }
`;

type VariantInput = {
  id: string;
  price?: string;
  compareAtPrice?: string | null;
};

type MutationBatch = {
  productId: string;
  variants: VariantInput[];
  rows: BulkPriceEditRow[];
};

/** 只提交真正有变化的字段：未变的字段不传，避免无谓覆盖。 */
function toVariantInput(row: BulkPriceEditRow): VariantInput {
  return {
    id: row.variantId,
    ...(row.priceChanged ? { price: row.afterPrice } : {}),
    ...(row.compareAtChanged ? { compareAtPrice: row.afterCompareAt } : {}),
  };
}

export function buildBulkPriceEditBatches(rows: BulkPriceEditRow[]): MutationBatch[] {
  const byProduct = new Map<string, BulkPriceEditRow[]>();
  for (const row of rows) {
    if (row.skipped) continue;
    if (!row.priceChanged && !row.compareAtChanged) continue;
    const list = byProduct.get(row.productId);
    if (list) list.push(row);
    else byProduct.set(row.productId, [row]);
  }

  const batches: MutationBatch[] = [];
  for (const [productId, productRows] of byProduct) {
    for (let i = 0; i < productRows.length; i += BULK_PRICE_EDIT_VARIANTS_PER_MUTATION) {
      const slice = productRows.slice(i, i + BULK_PRICE_EDIT_VARIANTS_PER_MUTATION);
      batches.push({
        productId,
        variants: slice.map(toVariantInput),
        rows: slice,
      });
    }
  }
  return batches;
}

async function runBatch(
  admin: ShopifyAdminGraphqlClient,
  batch: MutationBatch,
): Promise<{ succeeded: number; errors: Array<{ variantId: string; message: string }> }> {
  const failAll = (message: string) => ({
    succeeded: 0,
    errors: batch.rows.map((row) => ({ variantId: row.variantId, message })),
  });

  let json: {
    data?: {
      productVariantsBulkUpdate?: {
        productVariants?: Array<{ id: string }> | null;
        userErrors?: Array<{ field?: string[] | null; message: string }> | null;
      } | null;
    };
    errors?: Array<{ message: string }>;
  };
  try {
    const response = await admin.graphql(VARIANTS_BULK_UPDATE, {
      variables: { productId: batch.productId, variants: batch.variants },
    });
    if (!response.ok) {
      return failAll(`HTTP ${response.status}`);
    }
    json = await response.json();
  } catch (e) {
    return failAll(e instanceof Error ? e.message : String(e));
  }

  if (json.errors?.length) {
    return failAll(json.errors.map((e) => e.message).join("; "));
  }

  const payload = json.data?.productVariantsBulkUpdate;
  const userErrors = payload?.userErrors ?? [];
  if (userErrors.length > 0) {
    // userErrors 不保证能定位到具体变体：整批标记失败，宁可少报成功也不误报
    return failAll(userErrors.map((e) => e.message).join("; "));
  }

  const updatedIds = new Set((payload?.productVariants ?? []).map((v) => v.id));
  const errors: Array<{ variantId: string; message: string }> = [];
  let succeeded = 0;
  for (const row of batch.rows) {
    if (updatedIds.size === 0 || updatedIds.has(row.variantId)) succeeded += 1;
    else errors.push({ variantId: row.variantId, message: "variant not returned by Shopify" });
  }
  return { succeeded, errors };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

/** 执行写回。永不抛出 per-variant 错误，逐行收集后交给调用方落库。 */
export async function applyBulkPriceEdit(args: {
  admin: ShopifyAdminGraphqlClient;
  shop: string;
  rows: BulkPriceEditRow[];
}): Promise<BulkPriceEditApplyOutcome> {
  const batches = buildBulkPriceEditBatches(args.rows);
  const outcomes = await mapWithConcurrency(batches, MUTATION_CONCURRENCY, (batch) =>
    runBatch(args.admin, batch),
  );

  let succeeded = 0;
  const errors: Array<{ variantId: string; message: string }> = [];
  for (const outcome of outcomes) {
    succeeded += outcome.succeeded;
    errors.push(...outcome.errors);
  }

  console.info(
    `${LOG_PREFIX} shop=${args.shop} batches=${batches.length} succeeded=${succeeded} failed=${errors.length}`,
  );

  return {
    at: new Date().toISOString(),
    succeeded,
    failed: errors.length,
    // 错误清单只留前 50 条，避免任务 result 无上限膨胀
    errors: errors.slice(0, 50),
  };
}
