import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../../../app/db.server";
import { computeOperationsDiagnosis } from "../../../../app/server/operations/diagnosis.server";

vi.mock("../../../../app/db.server", () => ({
  default: {
    shopOrder: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
    },
    shopRefund: { findMany: vi.fn() },
    shopRefundLineItem: { findMany: vi.fn() },
    shopInventoryLevel: { findMany: vi.fn() },
    shopOrderLineItem: { findMany: vi.fn() },
  },
}));

vi.mock("../../../../app/server/operations/productOperationsQuery.server", () => ({
  loadProductOperations: vi.fn().mockResolvedValue(null),
}));

const SHOP = "spark-test.myshopify.com";
const NOW = new Date("2026-08-26T12:00:00.000Z");
const WINDOW_END = new Date("2026-08-26T00:00:00.000Z");
const SINCE_7D = new Date("2026-08-19T00:00:00.000Z");
const SINCE_30D = new Date("2026-07-27T00:00:00.000Z");

function orderRow(overrides: {
  shopifyOrderId: string;
  createdAt: Date;
  totalPrice: number;
}) {
  return {
    shopifyOrderId: overrides.shopifyOrderId,
    orderNumber: overrides.shopifyOrderId,
    createdAt: overrides.createdAt,
    totalPrice: overrides.totalPrice,
    currency: "USD",
    status: "open",
    financialStatus: "paid",
    fulfillmentStatus: "fulfilled",
    customerDisplayName: "Test",
    fulfillments: [],
  };
}

describe("computeOperationsDiagnosis 7-day UTC window", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.shopRefund.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.shopRefundLineItem.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.shopInventoryLevel.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.shopOrderLineItem.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.shopOrder.count).mockResolvedValue(3 as never);
    vi.mocked(prisma.shopOrder.findFirst).mockResolvedValue({ currency: "USD" } as never);
  });

  it("queries complete UTC days excluding today, and drops in-window today orders", async () => {
    const todayOrder = orderRow({
      shopifyOrderId: "today",
      createdAt: new Date("2026-08-26T01:00:00.000Z"),
      totalPrice: 999,
    });
    const yesterdayOrder = orderRow({
      shopifyOrderId: "yesterday",
      createdAt: new Date("2026-08-25T23:00:00.000Z"),
      totalPrice: 40,
    });
    const windowStartOrder = orderRow({
      shopifyOrderId: "start",
      createdAt: new Date("2026-08-19T00:00:00.000Z"),
      totalPrice: 10,
    });
    const beforeWindowOrder = orderRow({
      shopifyOrderId: "before",
      createdAt: new Date("2026-08-18T23:00:00.000Z"),
      totalPrice: 80,
    });

    vi.mocked(prisma.shopOrder.findMany).mockResolvedValue([
      todayOrder,
      yesterdayOrder,
      windowStartOrder,
      beforeWindowOrder,
    ] as never);

    const result = await computeOperationsDiagnosis(SHOP, NOW, {
      loadPixelFunnel: async () => null,
    });

    expect(prisma.shopOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          shop: SHOP,
          createdAt: { gte: SINCE_30D, lt: WINDOW_END },
        },
      }),
    );
    expect(result.summaryMetrics.salesAmount7d).toBe(50);
    expect(SINCE_7D.toISOString()).toBe("2026-08-19T00:00:00.000Z");
  });
});
