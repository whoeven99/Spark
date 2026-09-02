import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyBulkCostImport,
  computePacingDelayMs,
  selectWritableCostRows,
} from "../../../../app/server/bulkCostImport/bulkCostImportApply.server";
import type { BulkCostImportRow } from "../../../../app/lib/bulkCostImport";

type GraphqlCall = { query: string; variables: Record<string, unknown> };

function row(overrides: Partial<BulkCostImportRow> = {}): BulkCostImportRow {
  return {
    sourceRow: 2,
    inventoryItemId: "gid://shopify/InventoryItem/11",
    variantId: "gid://shopify/ProductVariant/1",
    productId: "gid://shopify/Product/1",
    productTitle: "连衣裙",
    variantTitle: "S",
    sku: "DR-001",
    beforeCost: "38.00",
    afterCost: "42.00",
    price: "99.00",
    beforeMarginPercent: 61.6,
    afterMarginPercent: 57.6,
    skipped: false,
    ...overrides,
  };
}

function okPayload(id = "gid://shopify/InventoryItem/11") {
  return {
    data: {
      inventoryItemUpdate: {
        inventoryItem: { id, unitCost: { amount: "42.00" } },
        userErrors: [],
      },
    },
  };
}

function createAdmin(handler: (call: GraphqlCall, index: number) => unknown): {
  admin: { graphql: ReturnType<typeof vi.fn> };
  calls: GraphqlCall[];
} {
  const calls: GraphqlCall[] = [];
  const graphql = vi.fn(async (query: string, init?: { variables?: Record<string, unknown> }) => {
    const call = { query, variables: init?.variables ?? {} };
    calls.push(call);
    return { ok: true, status: 200, json: async () => handler(call, calls.length - 1) };
  });
  return { admin: { graphql }, calls };
}

const asAdmin = (admin: { graphql: ReturnType<typeof vi.fn> }) =>
  admin as unknown as Parameters<typeof applyBulkCostImport>[0]["admin"];

// 退避会真的等，用假计时器把等待折叠掉
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("selectWritableCostRows", () => {
  it("剔除跳过行与缺 inventoryItemId 的行", () => {
    const rows = [
      row(),
      row({ inventoryItemId: "gid://shopify/InventoryItem/22", skipped: true }),
      row({ inventoryItemId: "" }),
      row({ inventoryItemId: "gid://shopify/InventoryItem/33", afterCost: "" }),
    ];
    expect(selectWritableCostRows(rows).map((r) => r.inventoryItemId)).toEqual([
      "gid://shopify/InventoryItem/11",
    ]);
  });
});

describe("computePacingDelayMs", () => {
  it("额度充足时不等待", () => {
    expect(computePacingDelayMs({ currentlyAvailable: 900, restoreRate: 100 })).toBe(0);
  });

  it("额度见底时按恢复速率算出等待时长", () => {
    expect(computePacingDelayMs({ currentlyAvailable: 100, restoreRate: 100 })).toBe(1000);
  });

  it("缺少 throttleStatus 或恢复速率非法时不等待", () => {
    expect(computePacingDelayMs(undefined)).toBe(0);
    expect(computePacingDelayMs({ currentlyAvailable: 0, restoreRate: 0 })).toBe(0);
  });

  it("等待时长有上限，避免异常数据把任务挂死", () => {
    expect(computePacingDelayMs({ currentlyAvailable: 0, restoreRate: 1 })).toBe(5000);
  });
});

describe("applyBulkCostImport", () => {
  it("成本用字符串传给 InventoryItemInput.cost", async () => {
    const { admin, calls } = createAdmin(() => okPayload());
    await applyBulkCostImport({ admin: asAdmin(admin), shop: "s.myshopify.com", rows: [row()] });
    expect(calls).toHaveLength(1);
    expect(calls[0].variables).toEqual({
      id: "gid://shopify/InventoryItem/11",
      input: { cost: "42.00" },
    });
  });

  it("被限流时退避重试，最终成功", async () => {
    const { admin, calls } = createAdmin((_call, index) =>
      index === 0
        ? { errors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }] }
        : okPayload(),
    );
    const promise = applyBulkCostImport({
      admin: asAdmin(admin),
      shop: "s.myshopify.com",
      rows: [row()],
    });
    await vi.runAllTimersAsync();
    const outcome = await promise;
    expect(calls).toHaveLength(2);
    expect(outcome.succeeded).toBe(1);
    expect(outcome.failed).toBe(0);
  });

  it("一直被限流则耗尽重试次数并记为失败", async () => {
    const { admin, calls } = createAdmin(() => ({
      errors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }],
    }));
    const promise = applyBulkCostImport({
      admin: asAdmin(admin),
      shop: "s.myshopify.com",
      rows: [row()],
    });
    await vi.runAllTimersAsync();
    const outcome = await promise;
    expect(calls).toHaveLength(4);
    expect(outcome.succeeded).toBe(0);
    expect(outcome.errors[0].message).toBe("throttled");
  });

  it("userErrors 记为该行失败，不影响其它行", async () => {
    const { admin } = createAdmin((call) =>
      call.variables.id === "gid://shopify/InventoryItem/22"
        ? {
            data: {
              inventoryItemUpdate: {
                inventoryItem: null,
                userErrors: [{ field: ["input"], message: "Cost is invalid" }],
              },
            },
          }
        : okPayload(call.variables.id as string),
    );
    const outcome = await applyBulkCostImport({
      admin: asAdmin(admin),
      shop: "s.myshopify.com",
      rows: [row(), row({ inventoryItemId: "gid://shopify/InventoryItem/22" })],
    });
    expect(outcome.succeeded).toBe(1);
    expect(outcome.failed).toBe(1);
    expect(outcome.errors).toEqual([
      { inventoryItemId: "gid://shopify/InventoryItem/22", message: "Cost is invalid" },
    ]);
  });

  it("没有可写行时不发任何请求", async () => {
    const { admin, calls } = createAdmin(() => okPayload());
    const outcome = await applyBulkCostImport({
      admin: asAdmin(admin),
      shop: "s.myshopify.com",
      rows: [row({ skipped: true })],
    });
    expect(calls).toHaveLength(0);
    expect(outcome).toMatchObject({ succeeded: 0, failed: 0 });
  });
});
