/**
 * 批量打标写回执行器 —— 全仓库唯一会修改 Shopify 商品标签的地方。
 *
 * 只由 `/api/bulk-tag-edit` 在用户看过变更清单并二次确认后调用；
 * Agent 回合内（chat-stream / Skill / dry-run）都不允许走到这里。
 *
 * 写回策略：用 tagsAdd / tagsRemove 增量操作，不走 productUpdate 整体覆写 ——
 * 覆写会把读取之后、写入之前由别的 App 或人工加的标签静默抹掉。
 * 同一商品先移除再添加（与试算口径一致），单个商品失败不阻塞其它商品。
 */
import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";
import type { BulkTagEditApplyOutcome, BulkTagEditRow } from "../../lib/bulkTagEdit";

const LOG_PREFIX = "[BulkTagEdit][Apply]";
const MUTATION_CONCURRENCY = 2;

const TAGS_ADD = `#graphql
  mutation BulkTagEditAdd($id: ID!, $tags: [String!]!) {
    tagsAdd(id: $id, tags: $tags) {
      node { id }
      userErrors { field message }
    }
  }
`;

const TAGS_REMOVE = `#graphql
  mutation BulkTagEditRemove($id: ID!, $tags: [String!]!) {
    tagsRemove(id: $id, tags: $tags) {
      node { id }
      userErrors { field message }
    }
  }
`;

type MutationName = "tagsAdd" | "tagsRemove";

/** 只保留真正会写入的行。 */
export function buildBulkTagEditWritableRows(rows: BulkTagEditRow[]): BulkTagEditRow[] {
  return rows.filter(
    (row) => !row.skipped && (row.addedTags.length > 0 || row.removedTags.length > 0),
  );
}

/** 跑一次标签 mutation；返回错误信息，成功返回 null。 */
async function runTagMutation(
  admin: ShopifyAdminGraphqlClient,
  name: MutationName,
  productId: string,
  tags: string[],
): Promise<string | null> {
  let json: {
    data?: Record<string, { userErrors?: Array<{ message: string }> | null } | null>;
    errors?: Array<{ message: string }>;
  };
  try {
    const response = await admin.graphql(name === "tagsAdd" ? TAGS_ADD : TAGS_REMOVE, {
      variables: { id: productId, tags },
    });
    if (!response.ok) return `HTTP ${response.status}`;
    json = await response.json();
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }

  if (json.errors?.length) {
    return json.errors.map((e) => e.message).join("; ");
  }
  const userErrors = json.data?.[name]?.userErrors ?? [];
  if (userErrors.length > 0) {
    return userErrors.map((e) => e.message).join("; ");
  }
  return null;
}

async function applyRow(
  admin: ShopifyAdminGraphqlClient,
  row: BulkTagEditRow,
): Promise<{ productId: string; message: string } | null> {
  // 先减后加：与 computeProductTagChange 的口径一致，避免刚加上又被前缀规则删掉
  if (row.removedTags.length > 0) {
    const error = await runTagMutation(admin, "tagsRemove", row.productId, row.removedTags);
    // 移除失败就不再追加：半套状态比原样不动更难排查
    if (error) return { productId: row.productId, message: error };
  }
  if (row.addedTags.length > 0) {
    const error = await runTagMutation(admin, "tagsAdd", row.productId, row.addedTags);
    if (error) return { productId: row.productId, message: error };
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
export async function applyBulkTagEdit(args: {
  admin: ShopifyAdminGraphqlClient;
  shop: string;
  rows: BulkTagEditRow[];
}): Promise<BulkTagEditApplyOutcome> {
  const writableRows = buildBulkTagEditWritableRows(args.rows);
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
