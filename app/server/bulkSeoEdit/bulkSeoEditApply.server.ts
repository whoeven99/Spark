/**
 * 批量 SEO 改写写回执行器 —— 全仓库唯一会修改 Shopify 商品 SEO 元数据的地方。
 *
 * 只由 `/api/bulk-seo-edit` 在用户看过变更清单并二次确认后调用；
 * Agent 回合内（chat-stream / Skill / dry-run）都不允许走到这里。
 *
 * 写回策略：`productUpdate` 只传 seo 里本次真正变化的子字段。
 * 没变的那一半不写进 input，避免把商户手写的另一个字段连带覆盖。
 * 单个商品失败不阻塞其它商品。
 */
import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";
import type { BulkSeoEditApplyOutcome, BulkSeoEditRow } from "../../lib/bulkSeoEdit";

const LOG_PREFIX = "[BulkSeoEdit][Apply]";
const MUTATION_CONCURRENCY = 2;

const PRODUCT_SEO_UPDATE = `#graphql
  mutation BulkSeoEditUpdate($input: ProductInput!) {
    productUpdate(input: $input) {
      product { id }
      userErrors { field message }
    }
  }
`;

/** 只保留真正会写入的行。 */
export function buildBulkSeoEditWritableRows(rows: BulkSeoEditRow[]): BulkSeoEditRow[] {
  return rows.filter((row) => !row.skipped && (row.titleChanged || row.descriptionChanged));
}

/** 组装 ProductInput.seo，只带本次变化的子字段。 */
export function buildSeoInput(row: BulkSeoEditRow): Record<string, unknown> {
  const seo: Record<string, string> = {};
  if (row.titleChanged && row.afterSeoTitle != null) seo.title = row.afterSeoTitle;
  if (row.descriptionChanged && row.afterSeoDescription != null) {
    seo.description = row.afterSeoDescription;
  }
  return { id: row.productId, seo };
}

async function applyRow(
  admin: ShopifyAdminGraphqlClient,
  row: BulkSeoEditRow,
): Promise<{ productId: string; message: string } | null> {
  const failWith = (message: string) => ({ productId: row.productId, message });

  let json: {
    data?: {
      productUpdate?: {
        product?: { id: string } | null;
        userErrors?: Array<{ field?: string[] | null; message: string }> | null;
      } | null;
    };
    errors?: Array<{ message: string }>;
  };
  try {
    const response = await admin.graphql(PRODUCT_SEO_UPDATE, {
      variables: { input: buildSeoInput(row) },
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
export async function applyBulkSeoEdit(args: {
  admin: ShopifyAdminGraphqlClient;
  shop: string;
  rows: BulkSeoEditRow[];
}): Promise<BulkSeoEditApplyOutcome> {
  const writableRows = buildBulkSeoEditWritableRows(args.rows);
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
