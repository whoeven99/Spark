import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../../../app/db.server";
import { syncSkuCosts } from "../../../../app/server/operations/roi/skuCostSync.server";

vi.mock("../../../../app/db.server", () => ({
  default: {
    shopSkuCost: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      upsert: vi.fn(),
    },
    $transaction: vi.fn().mockResolvedValue([]),
  },
}));

const SHOP = "test.myshopify.com";

type VariantNode = {
  id: string;
  sku?: string | null;
  inventoryItem?: {
    id: string;
    unitCost?: { amount: string; currencyCode: string } | null;
  } | null;
};

/** 按页返回 variant，模拟 Shopify GraphQL 游标分页 */
function adminReturning(pages: VariantNode[][]) {
  let page = 0;
  return {
    graphql: vi.fn(async () => {
      const nodes = pages[page] ?? [];
      const hasNextPage = page < pages.length - 1;
      page += 1;
      return {
        json: async () => ({
          data: {
            productVariants: {
              pageInfo: { hasNextPage, endCursor: hasNextPage ? `cursor-${page}` : null },
              nodes,
            },
          },
        }),
      };
    }),
  } as never;
}

function variant(n: number, overrides: Partial<VariantNode> = {}): VariantNode {
  return {
    id: `gid://shopify/ProductVariant/${n}`,
    sku: `SKU-${n}`,
    inventoryItem: {
      id: `gid://shopify/InventoryItem/${n}`,
      unitCost: { amount: "3.5", currencyCode: "USD" },
    },
    ...overrides,
  };
}

/** $transaction 收到的操作数组（重载签名下先过 unknown 再断言） */
function transactionOps(): unknown[] {
  const calls = vi.mocked(prisma.$transaction).mock.calls;
  expect(calls).toHaveLength(1);
  return calls[0]?.[0] as unknown as unknown[];
}

function createManyArg(index: number) {
  return vi.mocked(prisma.shopSkuCost.createMany).mock.calls[index]?.[0];
}

function deleteManyArg(index: number) {
  return vi.mocked(prisma.shopSkuCost.deleteMany).mock.calls[index]?.[0];
}

describe("syncSkuCosts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.shopSkuCost.deleteMany).mockResolvedValue({ count: 0 } as never);
    vi.mocked(prisma.shopSkuCost.createMany).mockResolvedValue({ count: 0 } as never);
    vi.mocked(prisma.$transaction).mockResolvedValue([] as never);
  });

  it("批量写入而不是逐条 upsert", async () => {
    const admin = adminReturning([[variant(1), variant(2), variant(3)]]);

    const result = await syncSkuCosts(admin, SHOP);

    expect(result.synced).toBe(3);
    expect(prisma.shopSkuCost.upsert).not.toHaveBeenCalled();
    expect(prisma.shopSkuCost.createMany).toHaveBeenCalledTimes(1);
    expect(createManyArg(0)?.data).toHaveLength(3);
    expect(transactionOps()).toHaveLength(2);
  });

  it("只删除本次拉到的 inventoryItemId，不做全店清空", async () => {
    const admin = adminReturning([[variant(1), variant(2)]]);

    await syncSkuCosts(admin, SHOP);

    expect(prisma.shopSkuCost.deleteMany).toHaveBeenCalledTimes(1);
    expect(deleteManyArg(0)?.where).toEqual({
      shop: SHOP,
      inventoryItemId: { in: ["1", "2"] },
    });
  });

  it("跨页去重后按 200 分批", async () => {
    const pageA = Array.from({ length: 250 }, (_, i) => variant(i + 1));
    // 第二页重复前 50 个，另加 50 个新的：去重后应为 300 行 → 2 批
    const pageB = [
      ...Array.from({ length: 50 }, (_, i) => variant(i + 1)),
      ...Array.from({ length: 50 }, (_, i) => variant(251 + i)),
    ];
    const admin = adminReturning([pageA, pageB]);

    const result = await syncSkuCosts(admin, SHOP);

    expect(result.synced).toBe(300);
    expect(prisma.shopSkuCost.createMany).toHaveBeenCalledTimes(2);
    expect(prisma.shopSkuCost.deleteMany).toHaveBeenCalledTimes(2);
    // 删除必须全部排在写入之前
    const ops = transactionOps();
    expect(ops).toHaveLength(4);
  });

  it("跳过缺少 unitCost 或成本非正的变体", async () => {
    const admin = adminReturning([
      [
        variant(1),
        variant(2, { inventoryItem: { id: "gid://shopify/InventoryItem/2", unitCost: null } }),
        variant(3, {
          inventoryItem: {
            id: "gid://shopify/InventoryItem/3",
            unitCost: { amount: "0", currencyCode: "USD" },
          },
        }),
      ],
    ]);

    const result = await syncSkuCosts(admin, SHOP);

    expect(result.synced).toBe(1);
  });

  it("无可用成本时不开事务", async () => {
    const admin = adminReturning([[]]);

    const result = await syncSkuCosts(admin, SHOP);

    expect(result.synced).toBe(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("GraphQL 报错时抛出", async () => {
    const admin = {
      graphql: vi.fn(async () => ({
        json: async () => ({ errors: [{ message: "throttled" }] }),
      })),
    } as never;

    await expect(syncSkuCosts(admin, SHOP)).rejects.toThrow("throttled");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
