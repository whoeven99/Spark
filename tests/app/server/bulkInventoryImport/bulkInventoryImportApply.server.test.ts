import { describe, expect, it, vi } from "vitest";
import {
  applyBulkInventoryImport,
  buildInventoryReferenceUri,
  computePacingDelayMs,
  selectWritableInventoryRows,
} from "../../../../app/server/bulkInventoryImport/bulkInventoryImportApply.server";
import type { BulkInventoryImportRow } from "../../../../app/lib/bulkInventoryImport";

type GraphqlCall = { query: string; variables: Record<string, unknown> };

const LOCATION_ID = "gid://shopify/Location/9";

function row(overrides: Partial<BulkInventoryImportRow> = {}): BulkInventoryImportRow {
  return {
    sourceRow: 2,
    inventoryItemId: "gid://shopify/InventoryItem/1",
    variantId: "gid://shopify/ProductVariant/1",
    productId: "gid://shopify/Product/1",
    productTitle: "经典白T",
    variantTitle: "M / 白",
    sku: "TS-M-W",
    beforeQuantity: 12,
    afterQuantity: 50,
    skipped: false,
    ...overrides,
  };
}

function okResponse(id = "gid://shopify/InventoryAdjustmentGroup/1") {
  return { data: { inventorySetQuantities: { inventoryAdjustmentGroup: { id }, userErrors: [] } } };
}

function createAdmin(
  handler: (call: GraphqlCall, index: number) => unknown = () => okResponse(),
  statusFor: (index: number) => number = () => 200,
): { admin: { graphql: ReturnType<typeof vi.fn> }; calls: GraphqlCall[] } {
  const calls: GraphqlCall[] = [];
  const graphql = vi.fn(async (query: string, init?: { variables?: Record<string, unknown> }) => {
    const index = calls.length;
    const call = { query, variables: init?.variables ?? {} };
    calls.push(call);
    const status = statusFor(index);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => handler(call, index),
    };
  });
  return { admin: { graphql }, calls };
}

const asAdmin = (admin: { graphql: ReturnType<typeof vi.fn> }) =>
  admin as unknown as Parameters<typeof applyBulkInventoryImport>[0]["admin"];

const quantityOf = (call: GraphqlCall) =>
  (call.variables.input as { quantities: Array<Record<string, unknown>> }).quantities[0];

describe("selectWritableInventoryRows", () => {
  it("剔除跳过行、前后数量相同的行与非整数行", () => {
    const rows = [
      row(),
      row({ inventoryItemId: "gid://shopify/InventoryItem/2", skipped: true }),
      row({ inventoryItemId: "gid://shopify/InventoryItem/3", afterQuantity: 12 }),
      row({ inventoryItemId: "gid://shopify/InventoryItem/4", afterQuantity: 1.5 }),
      row({ inventoryItemId: "" }),
    ];
    expect(selectWritableInventoryRows(rows).map((r) => r.inventoryItemId)).toEqual([
      "gid://shopify/InventoryItem/1",
    ]);
  });
});

describe("buildInventoryReferenceUri", () => {
  it("用应用自己的命名空间并清洗任务 ID", () => {
    expect(buildInventoryReferenceUri("task_123-abc")).toBe(
      "gid://spark/BulkInventoryImport/task_123-abc",
    );
    expect(buildInventoryReferenceUri("../../etc/passwd")).toBe(
      "gid://spark/BulkInventoryImport/etcpasswd",
    );
    expect(buildInventoryReferenceUri("!!!")).toBe("gid://spark/BulkInventoryImport/unknown");
  });
});

describe("computePacingDelayMs", () => {
  it("额度充足时不等待，紧张时按恢复速率算等待且有上限", () => {
    expect(computePacingDelayMs(undefined)).toBe(0);
    expect(computePacingDelayMs({ currentlyAvailable: 900, restoreRate: 50 })).toBe(0);
    expect(computePacingDelayMs({ currentlyAvailable: 150, restoreRate: 50 })).toBe(1000);
    expect(computePacingDelayMs({ currentlyAvailable: 0, restoreRate: 1 })).toBe(5000);
    expect(computePacingDelayMs({ currentlyAvailable: 0, restoreRate: 0 })).toBe(0);
  });
});

describe("applyBulkInventoryImport", () => {
  it("按行调用，带上 available / correction / CAS 基准与每行独立的幂等键", async () => {
    const { admin, calls } = createAdmin();
    const outcome = await applyBulkInventoryImport({
      admin: asAdmin(admin),
      shop: "demo.myshopify.com",
      taskId: "task_1",
      locationId: LOCATION_ID,
      rows: [row(), row({ inventoryItemId: "gid://shopify/InventoryItem/2", beforeQuantity: 3 })],
    });

    expect(outcome).toMatchObject({ succeeded: 2, failed: 0, staleCount: 0, errors: [] });
    expect(calls).toHaveLength(2);

    const input = calls[0].variables.input as Record<string, unknown>;
    expect(input.name).toBe("available");
    expect(input.reason).toBe("correction");
    expect(input.referenceDocumentUri).toBe("gid://spark/BulkInventoryImport/task_1");
    expect(quantityOf(calls[0])).toEqual({
      inventoryItemId: "gid://shopify/InventoryItem/1",
      locationId: LOCATION_ID,
      quantity: 50,
      changeFromQuantity: 12,
    });
    expect(quantityOf(calls[1]).changeFromQuantity).toBe(3);

    // 每行一个幂等键，共用会让第二行被当成同一次调整而丢掉
    const keys = calls.map((c) => c.variables.idempotencyKey);
    expect(new Set(keys).size).toBe(2);
    expect(calls[0].query).toContain("@idempotent");
  });

  it("CAS 基准过期的行计入 staleCount 且不重试", async () => {
    const { admin, calls } = createAdmin(() => ({
      data: {
        inventorySetQuantities: {
          inventoryAdjustmentGroup: null,
          userErrors: [{ code: "CHANGE_FROM_QUANTITY_STALE", message: "quantity changed" }],
        },
      },
    }));
    const outcome = await applyBulkInventoryImport({
      admin: asAdmin(admin),
      shop: "demo.myshopify.com",
      taskId: "task_1",
      locationId: LOCATION_ID,
      rows: [row()],
    });

    expect(outcome).toMatchObject({ succeeded: 0, failed: 1, staleCount: 1 });
    expect(outcome.errors[0].inventoryItemId).toBe("gid://shopify/InventoryItem/1");
    // 用同一个过期基准重试只会再失败一次
    expect(calls).toHaveLength(1);
  });

  it("普通 userError 记为失败但不算 stale，且不阻塞其它行", async () => {
    const { admin } = createAdmin((call) =>
      quantityOf(call).inventoryItemId === "gid://shopify/InventoryItem/2"
        ? {
            data: {
              inventorySetQuantities: {
                inventoryAdjustmentGroup: null,
                userErrors: [{ code: "INVALID", message: "bad location" }],
              },
            },
          }
        : okResponse(),
    );
    const outcome = await applyBulkInventoryImport({
      admin: asAdmin(admin),
      shop: "demo.myshopify.com",
      taskId: "task_1",
      locationId: LOCATION_ID,
      rows: [row(), row({ inventoryItemId: "gid://shopify/InventoryItem/2" })],
    });

    expect(outcome).toMatchObject({ succeeded: 1, failed: 1, staleCount: 0 });
    expect(outcome.errors).toEqual([
      { inventoryItemId: "gid://shopify/InventoryItem/2", message: "bad location" },
    ]);
  });

  it("被限流时重试并复用同一个幂等键", async () => {
    vi.useFakeTimers();
    try {
      const { admin, calls } = createAdmin((_call, index) =>
        index === 0
          ? { errors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }] }
          : okResponse(),
      );
      const promise = applyBulkInventoryImport({
        admin: asAdmin(admin),
        shop: "demo.myshopify.com",
        taskId: "task_1",
        locationId: LOCATION_ID,
        rows: [row()],
      });
      await vi.runAllTimersAsync();
      const outcome = await promise;

      expect(outcome).toMatchObject({ succeeded: 1, failed: 0 });
      expect(calls).toHaveLength(2);
      // 重试复用 key，否则「请求到了、响应丢了」会被算成第二次调整
      expect(calls[0].variables.idempotencyKey).toBe(calls[1].variables.idempotencyKey);
    } finally {
      vi.useRealTimers();
    }
  });

  it("重试用尽后记为失败，不抛出", async () => {
    vi.useFakeTimers();
    try {
      const { admin, calls } = createAdmin(
        () => ({}),
        () => 429,
      );
      const promise = applyBulkInventoryImport({
        admin: asAdmin(admin),
        shop: "demo.myshopify.com",
        taskId: "task_1",
        locationId: LOCATION_ID,
        rows: [row()],
      });
      await vi.runAllTimersAsync();
      const outcome = await promise;

      expect(outcome).toMatchObject({ succeeded: 0, failed: 1, staleCount: 0 });
      expect(outcome.errors[0].message).toBe("HTTP 429");
      expect(calls).toHaveLength(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it("没有可写行时不发任何请求", async () => {
    const { admin, calls } = createAdmin();
    const outcome = await applyBulkInventoryImport({
      admin: asAdmin(admin),
      shop: "demo.myshopify.com",
      taskId: "task_1",
      locationId: LOCATION_ID,
      rows: [row({ skipped: true })],
    });
    expect(outcome).toMatchObject({ succeeded: 0, failed: 0, staleCount: 0 });
    expect(calls).toHaveLength(0);
  });
});
