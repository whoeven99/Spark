/**
 * 批量上下架写回执行器 —— 全仓库唯一会修改 Shopify 商品 status 的地方。
 *
 * 只由 `/api/bulk-status-edit` 在用户看过变更清单并二次确认后调用；
 * Agent 回合内（chat-stream / Skill / dry-run）都不允许走到这里。
 *
 * 写回策略：`productUpdate` 只传 id + status。
 * 2026-07 起 productUpdate 的入参是 `product: ProductUpdateInput!`，旧的 `input: ProductInput!`
 * 已标记 deprecated；新代码走新签名。
 * 状态只控制能否售卖，不改销售渠道发布关系（那需要 publishablePublish 与额外 scope）。
 * 单个商品失败不阻塞其它商品。
 */
import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";
import type { BulkStatusEditApplyOutcome, BulkStatusEditRow } from "../../lib/bulkStatusEdit";

const LOG_PREFIX = "[BulkStatusEdit][Apply]";
const MUTATION_CONCURRENCY = 2;

const PRODUCT_STATUS_UPDATE = `#graphql
  mutation BulkStatusEditUpdate($product: ProductUpdateInput!) {
    productUpdate(product: $product) {
      product { id status }
      userErrors { field message }
    }
  }
`;

/** 写回只接受这两个目标状态，归档等其它值不在本功能范围内。 */
const WRITABLE_STATUSES = new Set(["ACTIVE", "DRAFT"]);

/** 只保留真正会写入的行。 */
export function buildBulkStatusEditWritableRows(
  rows: BulkStatusEditRow[],
): BulkStatusEditRow[] {
  return rows.filter(
    (row) =>
      !row.skipped &&
      WRITABLE_STATUSES.has(row.afterStatus) &&
      row.afterStatus !== row.beforeStatus,
  );
}

async function applyRow(
  admin: ShopifyAdminGraphqlClient,
  row: BulkStatusEditRow,
): Promise<{ productId: string; message: string } | null> {
  const failWith = (message: string) => ({ productId: row.productId, message });

  let json: {
    data?: {
      productUpdate?: {
        product?: { id: string; status?: string | null } | null;
        userErrors?: Array<{ field?: string[] | null; message: string }> | null;
      } | null;
    };
    errors?: Array<{ message: string }>;
  };
  try {
    const response = await admin.graphql(PRODUCT_STATUS_UPDATE, {
      variables: { product: { id: row.productId, status: row.afterStatus } },
    });
    if (!response.ok) return failWith(`HTTP ${response.status}`);
    json = await response.json();
  } catch (e) {
    return failWith(e instanceof Error ? e.message : String(e));
  }

  if (json.errors?.length) {
    return failWith(json.errors.map((e) => e.message).join("; "));
  }
  const userErrors = json.data?.productUpdate?.userErrors ?? [];
  if (userErrors.length > 0) {
    return failWith(userErrors.map((e) => e.message).join("; "));
  }
  return null;
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

/** 执行写回。永不抛出 per-product 错误，逐行收集后交给调用方落库。 */
export async function applyBulkStatusEdit(args: {
  admin: ShopifyAdminGraphqlClient;
  shop: string;
  rows: BulkStatusEditRow[];
}): Promise<BulkStatusEditApplyOutcome> {
  const writableRows = buildBulkStatusEditWritableRows(args.rows);
  const outcomes = await mapWithConcurrency(writableRows, MUTATION_CONCURRENCY, (row) =>
    applyRow(args.admin, row),
  );

  const errors = outcomes.filter(
    (item): item is { productId: string; message: string } => item !== null,
  );
  const succeeded = writableRows.length - errors.length;

  console.info(
    `${LOG_PREFIX} shop=${args.shop} products=${writableRows.length} succeeded=${succeeded} failed=${errors.length}`,
  );

  return {
    at: new Date().toISOString(),
    succeeded,
    failed: errors.length,
    // 错误清单只留前 50 条，避免任务 result 无上限膨胀
    errors: errors.slice(0, 50),
  };
}
