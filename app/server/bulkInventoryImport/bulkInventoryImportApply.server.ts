/**
 * 库存写回执行器 —— 全仓库唯一会修改 Shopify 库存数量的地方。
 *
 * 只由 `/api/bulk-inventory-import` 在用户看过变更清单并二次确认后调用；
 * Agent 回合内（chat-stream / Skill / dry-run）都不允许走到这里。
 *
 * 三条与其它批量能力不同、不能退化的约束：
 *
 * 1. **CAS（compare-and-swap）**：每行都带上试算时读到的 `changeFromQuantity`。
 *    试算到确认之间如果店铺又卖出去几件，这一行会被 Shopify 拒绝（`CHANGE_FROM_QUANTITY_STALE`），
 *    而不是把销量抹掉。这类行单独计入 `staleCount`，不当成故障，也不重试——
 *    重试等于用同一个过期基准再撞一次，只会再失败一次。
 * 2. **幂等键**：`@idempotent` 指令自 2026-04 起是必填的。每行在进入重试循环**之前**
 *    生成一次 key 并在所有重试中复用，这样「请求发出去了但响应丢了」的情况重试时
 *    不会被算成第二次调整。每行一个 key，不能整批共用。
 * 3. **一行一次调用**：`inventorySetQuantities` 虽然能一次传多行，但它的原子性没有文档保证，
 *    而 CAS 失败是逐行发生的——批量提交时一行过期可能拖垮整批，且无法准确归因到行。
 *    因此这里按行调用，用并发 2 + 按 throttleStatus 配速来扛住 1000 行的量，
 *    与成本价导入保持同一套限流策略。
 */
import { randomUUID } from "node:crypto";
import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";
import type {
  BulkInventoryImportApplyOutcome,
  BulkInventoryImportRow,
} from "../../lib/bulkInventoryImport";

const LOG_PREFIX = "[BulkInventoryImport][Apply]";

const MUTATION_CONCURRENCY = 2;
const MAX_ATTEMPTS = 4;
const BASE_BACKOFF_MS = 1000;
/** 可用额度低于这个水位就主动等一会儿，别等被 Shopify 拒了再退避。 */
const THROTTLE_FLOOR_POINTS = 200;
/** 单次主动配速的等待上限，避免 restoreRate 异常时把任务挂死。 */
const MAX_PACING_WAIT_MS = 5000;

/** 只写可售量。on_hand 是另一套语义（实物在库），不在本能力范围。 */
const QUANTITY_NAME = "available";
/** Shopify 要求的调整原因枚举值；导入属于「盘点校正」。 */
const ADJUSTMENT_REASON = "correction";
/** CAS 基准过期的 userError code，语义上不算失败，单独计数。 */
const STALE_ERROR_CODE = "CHANGE_FROM_QUANTITY_STALE";

const INVENTORY_SET_QUANTITIES = `#graphql
  mutation BulkInventoryImportSet(
    $input: InventorySetQuantitiesInput!
    $idempotencyKey: String!
  ) {
    inventorySetQuantities(input: $input) @idempotent(key: $idempotencyKey) {
      inventoryAdjustmentGroup {
        id
        changes { name delta }
      }
      userErrors { code field message }
    }
  }
`;

type ThrottleStatus = {
  currentlyAvailable?: number;
  restoreRate?: number;
};

type MutationResponse = {
  data?: {
    inventorySetQuantities?: {
      inventoryAdjustmentGroup?: { id: string } | null;
      userErrors?: Array<{
        code?: string | null;
        field?: string[] | null;
        message: string;
      }> | null;
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

type RowOutcome = { ok: boolean; stale?: boolean; message?: string };

async function setOne(
  admin: ShopifyAdminGraphqlClient,
  row: BulkInventoryImportRow,
  context: { locationId: string; referenceDocumentUri: string },
): Promise<RowOutcome> {
  // 重试要复用同一个 key，否则「请求到了、响应丢了」的重试会被当成第二次调整
  const idempotencyKey = randomUUID();
  let lastMessage = "unknown error";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let json: MutationResponse;
    try {
      const response = await admin.graphql(INVENTORY_SET_QUANTITIES, {
        variables: {
          input: {
            name: QUANTITY_NAME,
            reason: ADJUSTMENT_REASON,
            referenceDocumentUri: context.referenceDocumentUri,
            quantities: [
              {
                inventoryItemId: row.inventoryItemId,
                locationId: context.locationId,
                quantity: row.afterQuantity,
                // 显式传值是必填要求；这里永远传试算基准，不传 null
                changeFromQuantity: row.beforeQuantity,
              },
            ],
          },
          idempotencyKey,
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

    const payload = json.data?.inventorySetQuantities;
    const userErrors = payload?.userErrors ?? [];
    if (userErrors.length > 0) {
      const stale = userErrors.some((e) => e.code === STALE_ERROR_CODE);
      return {
        ok: false,
        ...(stale ? { stale: true } : {}),
        message: userErrors.map((e) => e.message).join("; "),
      };
    }
    if (!payload?.inventoryAdjustmentGroup?.id) {
      return { ok: false, message: "inventory adjustment not returned by Shopify" };
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

/** 待写回的行：跳过的不写，缺 inventoryItemId 的在试算阶段就已被剔除。 */
export function selectWritableInventoryRows(
  rows: BulkInventoryImportRow[],
): BulkInventoryImportRow[] {
  return rows.filter(
    (row) =>
      !row.skipped &&
      Boolean(row.inventoryItemId) &&
      Number.isInteger(row.afterQuantity) &&
      row.afterQuantity !== row.beforeQuantity,
  );
}

/**
 * 商户在 Shopify 库存历史里看到的来源标识。
 * 用应用自己的 GID 命名空间（不能用 gid://shopify/*），带上任务 ID 方便回溯。
 */
export function buildInventoryReferenceUri(taskId: string): string {
  const safe = taskId.replace(/[^A-Za-z0-9_-]/g, "") || "unknown";
  return `gid://spark/BulkInventoryImport/${safe}`;
}

/** 执行写回。永不抛出 per-item 错误，逐行收集后交给调用方落库。 */
export async function applyBulkInventoryImport(args: {
  admin: ShopifyAdminGraphqlClient;
  shop: string;
  taskId: string;
  locationId: string;
  rows: BulkInventoryImportRow[];
}): Promise<BulkInventoryImportApplyOutcome> {
  const writable = selectWritableInventoryRows(args.rows);
  const context = {
    locationId: args.locationId,
    referenceDocumentUri: buildInventoryReferenceUri(args.taskId),
  };
  const outcomes = await mapWithConcurrency(writable, MUTATION_CONCURRENCY, (row) =>
    setOne(args.admin, row, context),
  );

  let succeeded = 0;
  let staleCount = 0;
  const errors: Array<{ inventoryItemId: string; message: string }> = [];
  outcomes.forEach((outcome, index) => {
    if (outcome.ok) {
      succeeded += 1;
      return;
    }
    if (outcome.stale) staleCount += 1;
    errors.push({
      inventoryItemId: writable[index].inventoryItemId,
      message: outcome.message ?? "unknown error",
    });
  });

  console.info(
    `${LOG_PREFIX} shop=${args.shop} rows=${writable.length} succeeded=${succeeded} failed=${errors.length} stale=${staleCount}`,
  );

  return {
    at: new Date().toISOString(),
    succeeded,
    failed: errors.length,
    staleCount,
    // 错误清单只留前 50 条，避免任务 result 无上限膨胀
    errors: errors.slice(0, 50),
  };
}
