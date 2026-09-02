/**
 * 批量 Metafield 写回执行器 —— 全仓库唯一会修改商品自定义字段的地方。
 *
 * 只由 `/api/bulk-metafield-edit` 在用户看过变更清单并二次确认后调用；
 * Agent 回合内（chat-stream / Skill / dry-run）都不允许走到这里。
 *
 * 两个 mutation 的行为差别很大，写回策略也因此不同：
 *
 * 1. `metafieldsSet` 单次最多 25 条，且**整批原子**——一条不合法，整批都不落库。
 *    好在它的 userErrors 带 `elementIndex`，能精确指出是第几条出的问题，
 *    所以失败时先按下标剔掉坏行再重发剩下的，而不是一上来就退化成逐行调用。
 *    只有拿不到 `elementIndex`（少见）才逐行重发把坏行隔离出来。
 * 2. `metafieldsDelete` 的 userErrors 是通用 `UserError`，**没有** code 也没有下标，
 *    所以整批失败只能逐行重试来归因。另外它对「本来就不存在」的字段返回 null 而不是报错，
 *    这对我们是成功（目标就是让它不存在），不计入失败。
 */
import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";
import type {
  BulkMetafieldEditAction,
  BulkMetafieldEditApplyOutcome,
  BulkMetafieldEditRow,
} from "../../lib/bulkMetafieldEdit";

const LOG_PREFIX = "[BulkMetafieldEdit][Apply]";

/** Shopify 对 metafieldsSet 的硬上限就是 25；delete 没有文档化上限，对齐即可。 */
const BATCH_SIZE = 25;
const BATCH_CONCURRENCY = 2;

const METAFIELDS_SET = `#graphql
  mutation BulkMetafieldEditSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id }
      userErrors { field message code elementIndex }
    }
  }
`;

const METAFIELDS_DELETE = `#graphql
  mutation BulkMetafieldEditDelete($metafields: [MetafieldIdentifierInput!]!) {
    metafieldsDelete(metafields: $metafields) {
      deletedMetafields { ownerId namespace key }
      userErrors { field message }
    }
  }
`;

export type BulkMetafieldEditApplyContext = {
  action: BulkMetafieldEditAction;
  namespace: string;
  key: string;
  type: string;
};

type RowError = { productId: string; message: string };

type SetOutcome =
  | { kind: "ok" }
  /** 拿到了出错行下标，可以精确剔除后重发 */
  | { kind: "partial"; failures: Array<{ index: number; message: string }> }
  /** 整批失败但归因不到具体行 */
  | { kind: "fatal"; message: string };

/** 只保留真正会写回的行。 */
export function selectWritableMetafieldRows(
  rows: BulkMetafieldEditRow[],
  action: BulkMetafieldEditAction,
): BulkMetafieldEditRow[] {
  return rows.filter((row) => {
    if (row.skipped || !row.productId.trim()) return false;
    // 清空不需要目标值；设值必须有非空目标值，否则等于把字段写成空串
    if (action === "clear") return true;
    return typeof row.afterValue === "string" && row.afterValue.trim() !== "";
  });
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

async function postGraphql(
  admin: ShopifyAdminGraphqlClient,
  query: string,
  variables: Record<string, unknown>,
): Promise<{ ok: true; json: Record<string, unknown> } | { ok: false; message: string }> {
  try {
    const response = await admin.graphql(query, { variables });
    if (!response.ok) return { ok: false, message: `HTTP ${response.status}` };
    return { ok: true, json: (await response.json()) as Record<string, unknown> };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

async function setOnce(
  admin: ShopifyAdminGraphqlClient,
  rows: BulkMetafieldEditRow[],
  context: BulkMetafieldEditApplyContext,
): Promise<SetOutcome> {
  const result = await postGraphql(admin, METAFIELDS_SET, {
    metafields: rows.map((row) => ({
      ownerId: row.productId,
      namespace: context.namespace,
      key: context.key,
      // 定义存在时 type 可以省略，但显式传能挡住「定义在试算后被删」导致的静默错写
      type: context.type,
      value: row.afterValue ?? "",
    })),
  });
  if (!result.ok) return { kind: "fatal", message: result.message };

  const json = result.json as {
    data?: {
      metafieldsSet?: {
        userErrors?: Array<{
          message: string;
          code?: string | null;
          elementIndex?: number | null;
        }> | null;
      } | null;
    };
    errors?: Array<{ message: string }>;
  };

  if (json.errors?.length) {
    return { kind: "fatal", message: json.errors.map((e) => e.message).join("; ") };
  }

  const userErrors = json.data?.metafieldsSet?.userErrors ?? [];
  if (userErrors.length === 0) return { kind: "ok" };

  const failures: Array<{ index: number; message: string }> = [];
  for (const error of userErrors) {
    const index = error.elementIndex;
    if (typeof index !== "number" || index < 0 || index >= rows.length) continue;
    failures.push({ index, message: error.message });
  }
  if (failures.length === 0) {
    return { kind: "fatal", message: userErrors.map((e) => e.message).join("; ") };
  }
  return { kind: "partial", failures };
}

function describeSetOutcome(outcome: SetOutcome): string {
  if (outcome.kind === "fatal") return outcome.message;
  if (outcome.kind === "partial") return outcome.failures.map((f) => f.message).join("; ");
  return "unknown error";
}

async function applySetBatch(
  admin: ShopifyAdminGraphqlClient,
  rows: BulkMetafieldEditRow[],
  context: BulkMetafieldEditApplyContext,
): Promise<RowError[]> {
  const errors: RowError[] = [];
  let pending = rows;

  // 每一轮至少剔掉一行，所以轮数不会超过行数
  for (let pass = 0; pass < rows.length && pending.length > 0; pass += 1) {
    const outcome = await setOnce(admin, pending, context);
    if (outcome.kind === "ok") return errors;

    if (outcome.kind === "partial") {
      const bad = new Set(outcome.failures.map((f) => f.index));
      for (const failure of outcome.failures) {
        errors.push({ productId: pending[failure.index].productId, message: failure.message });
      }
      pending = pending.filter((_, index) => !bad.has(index));
      continue;
    }

    if (pending.length === 1) {
      errors.push({ productId: pending[0].productId, message: outcome.message });
      return errors;
    }

    // 整批原子失败又归因不到行：逐行重发，把坏行隔离出来，不让好行陪葬
    for (const row of pending) {
      const single = await setOnce(admin, [row], context);
      if (single.kind !== "ok") {
        errors.push({ productId: row.productId, message: describeSetOutcome(single) });
      }
    }
    return errors;
  }

  return errors;
}

async function deleteOnce(
  admin: ShopifyAdminGraphqlClient,
  rows: BulkMetafieldEditRow[],
  context: BulkMetafieldEditApplyContext,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const result = await postGraphql(admin, METAFIELDS_DELETE, {
    metafields: rows.map((row) => ({
      ownerId: row.productId,
      namespace: context.namespace,
      key: context.key,
    })),
  });
  if (!result.ok) return result;

  const json = result.json as {
    data?: {
      metafieldsDelete?: {
        userErrors?: Array<{ message: string }> | null;
      } | null;
    };
    errors?: Array<{ message: string }>;
  };

  if (json.errors?.length) {
    return { ok: false, message: json.errors.map((e) => e.message).join("; ") };
  }
  const userErrors = json.data?.metafieldsDelete?.userErrors ?? [];
  if (userErrors.length > 0) {
    return { ok: false, message: userErrors.map((e) => e.message).join("; ") };
  }
  // deletedMetafields 里的 null 表示该字段本来就不存在。目标就是让它不存在，算成功。
  return { ok: true };
}

async function applyClearBatch(
  admin: ShopifyAdminGraphqlClient,
  rows: BulkMetafieldEditRow[],
  context: BulkMetafieldEditApplyContext,
): Promise<RowError[]> {
  const outcome = await deleteOnce(admin, rows, context);
  if (outcome.ok) return [];
  if (rows.length === 1) {
    return [{ productId: rows[0].productId, message: outcome.message }];
  }

  // delete 的 userErrors 没有下标，只能逐行重试来归因
  const errors: RowError[] = [];
  for (const row of rows) {
    const single = await deleteOnce(admin, [row], context);
    if (!single.ok) errors.push({ productId: row.productId, message: single.message });
  }
  return errors;
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
export async function applyBulkMetafieldEdit(args: {
  admin: ShopifyAdminGraphqlClient;
  shop: string;
  context: BulkMetafieldEditApplyContext;
  rows: BulkMetafieldEditRow[];
}): Promise<BulkMetafieldEditApplyOutcome> {
  const writable = selectWritableMetafieldRows(args.rows, args.context.action);
  const batches = chunk(writable, BATCH_SIZE);

  const perBatchErrors = await mapWithConcurrency(batches, BATCH_CONCURRENCY, (batch) =>
    args.context.action === "clear"
      ? applyClearBatch(args.admin, batch, args.context)
      : applySetBatch(args.admin, batch, args.context),
  );

  const errors = perBatchErrors.flat();
  const succeeded = writable.length - errors.length;

  console.info(
    `${LOG_PREFIX} shop=${args.shop} field=${args.context.namespace}.${args.context.key} action=${args.context.action} products=${writable.length} succeeded=${succeeded} failed=${errors.length}`,
  );

  return {
    at: new Date().toISOString(),
    succeeded,
    failed: errors.length,
    // 错误清单只留前 50 条，避免任务 result 无上限膨胀
    errors: errors.slice(0, 50),
  };
}
