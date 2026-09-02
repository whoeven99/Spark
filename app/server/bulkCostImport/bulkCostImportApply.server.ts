/**
 * 成本价写回执行器 —— 全仓库唯一会修改 Shopify 商品成本的地方。
 *
 * 只由 `/api/bulk-cost-import` 在用户看过变更清单并二次确认后调用；
 * Agent 回合内（chat-stream / Skill / dry-run）都不允许走到这里。
 *
 * 与批量调价的关键差异：`inventoryItemUpdate` 没有 bulk 版本，一次只能改一个
 * InventoryItem。1000 行就是 1000 次调用，一定会撞上 Shopify 的 GraphQL 限流，
 * 因此这里必须自己按 throttleStatus 配速并对 THROTTLED 退避重试——
 * `bulkPriceEditApply` 那边不需要，是因为它一次 mutation 能覆盖 250 个变体。
 */
import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";
import type {
  BulkCostImportApplyOutcome,
  BulkCostImportRow,
} from "../../lib/bulkCostImport";

const LOG_PREFIX = "[BulkCostImport][Apply]";

const MUTATION_CONCURRENCY = 2;
const MAX_ATTEMPTS = 4;
const BASE_BACKOFF_MS = 1000;
/** 可用额度低于这个水位就主动等一会儿，别等被 Shopify 拒了再退避。 */
const THROTTLE_FLOOR_POINTS = 200;
/** 单次主动配速的等待上限，避免 restoreRate 异常时把任务挂死。 */
const MAX_PACING_WAIT_MS = 5000;

const INVENTORY_ITEM_UPDATE = `#graphql
  mutation BulkCostImportUpdate($id: ID!, $input: InventoryItemInput!) {
    inventoryItemUpdate(id: $id, input: $input) {
      inventoryItem { id unitCost { amount } }
      userErrors { field message }
    }
  }
`;

type ThrottleStatus = {
  currentlyAvailable?: number;
  restoreRate?: number;
};

type MutationResponse = {
  data?: {
    inventoryItemUpdate?: {
      inventoryItem?: { id: string } | null;
      userErrors?: Array<{ field?: string[] | null; message: string }> | null;
    } | null;
  };
  errors?: Array<{ message: string; extensions?: { code?: string } }>;
  extensions?: { cost?: { throttleStatus?: ThrottleStatus } };
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isThrottled(json: MutationResponse): boolean {
  return (json.errors ?? []).some((e) => e.extensions?.code === "THROTTLED");
}

/**
 * 按 Shopify 返回的剩余额度配速。
 * 额度充足时返回 0，不做任何等待。
 */
export function computePacingDelayMs(status: ThrottleStatus | undefined): number {
  const available = status?.currentlyAvailable;
  const restoreRate = status?.restoreRate;
  if (typeof available !== "number" || typeof restoreRate !== "number" || restoreRate <= 0) {
    return 0;
  }
  if (available >= THROTTLE_FLOOR_POINTS) return 0;
  const needed = THROTTLE_FLOOR_POINTS - available;
  return Math.min(Math.ceil((needed / restoreRate) * 1000), MAX_PACING_WAIT_MS);
}

type RowOutcome = { ok: boolean; message?: string };

async function updateOne(
  admin: ShopifyAdminGraphqlClient,
  row: BulkCostImportRow,
): Promise<RowOutcome> {
  let lastMessage = "unknown error";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let json: MutationResponse;
    try {
      const response = await admin.graphql(INVENTORY_ITEM_UPDATE, {
        variables: {
          id: row.inventoryItemId,
          // Decimal 用字符串传，避免浮点在序列化时抖出 42.000000000000004
          input: { cost: row.afterCost },
        },
      });
      if (response.status === 429) {
        lastMessage = "HTTP 429";
        await sleep(BASE_BACKOFF_MS * 2 ** (attempt - 1));
        continue;
      }
      if (!response.ok) {
        return { ok: false, message: `HTTP ${response.status}` };
      }
      json = (await response.json()) as MutationResponse;
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }

    if (isThrottled(json)) {
      lastMessage = "throttled";
      await sleep(BASE_BACKOFF_MS * 2 ** (attempt - 1));
      continue;
    }

    if (json.errors?.length) {
      return { ok: false, message: json.errors.map((e) => e.message).join("; ") };
    }

    const payload = json.data?.inventoryItemUpdate;
    const userErrors = payload?.userErrors ?? [];
    if (userErrors.length > 0) {
      return { ok: false, message: userErrors.map((e) => e.message).join("; ") };
    }
    if (!payload?.inventoryItem?.id) {
      return { ok: false, message: "inventory item not returned by Shopify" };
    }

    const pacing = computePacingDelayMs(json.extensions?.cost?.throttleStatus);
    if (pacing > 0) await sleep(pacing);

    return { ok: true };
  }

  return { ok: false, message: lastMessage };
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

/** 待写回的行：跳过的不写，没有 inventoryItemId 的在试算阶段就已被剔除。 */
export function selectWritableCostRows(rows: BulkCostImportRow[]): BulkCostImportRow[] {
  return rows.filter((row) => !row.skipped && row.inventoryItemId && row.afterCost);
}

/** 执行写回。永不抛出 per-item 错误，逐行收集后交给调用方落库。 */
export async function applyBulkCostImport(args: {
  admin: ShopifyAdminGraphqlClient;
  shop: string;
  rows: BulkCostImportRow[];
}): Promise<BulkCostImportApplyOutcome> {
  const writable = selectWritableCostRows(args.rows);
  const outcomes = await mapWithConcurrency(writable, MUTATION_CONCURRENCY, (row) =>
    updateOne(args.admin, row),
  );

  let succeeded = 0;
  const errors: Array<{ inventoryItemId: string; message: string }> = [];
  outcomes.forEach((outcome, index) => {
    if (outcome.ok) succeeded += 1;
    else {
      errors.push({
        inventoryItemId: writable[index].inventoryItemId,
        message: outcome.message ?? "unknown error",
      });
    }
  });

  console.info(
    `${LOG_PREFIX} shop=${args.shop} rows=${writable.length} succeeded=${succeeded} failed=${errors.length}`,
  );

  return {
    at: new Date().toISOString(),
    succeeded,
    failed: errors.length,
    // 错误清单只留前 50 条，避免任务 result 无上限膨胀
    errors: errors.slice(0, 50),
  };
}
