import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../../../app/db.server";
import { computeOperationsDiagnosis } from "../../../../app/server/operations/diagnosis.server";
import { loadProductOperations } from "../../../../app/server/operations/productOperationsQuery.server";
import type { ProductOperationsData } from "../../../../app/server/operations/productOperationsQuery.server";

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
  loadProductOperations: vi.fn(),
}));

const SHOP = "spark-test.myshopify.com";
const NOW = new Date("2026-08-26T12:00:00.000Z");

function sampleProductOps(overrides: Partial<ProductOperationsData> = {}): ProductOperationsData {
  return {
    draftProductCount: 2,
    draftProducts: [
      { id: "draft-0", title: "Summer Hat", status: "DRAFT" },
      { id: "draft-1", title: "Winter Coat", status: "DRAFT" },
    ],
    noImagesProductCount: 1,
    noDescriptionProductCount: 3,
    samples: {
      draftSample: [{ title: "Summer Hat" }, { title: "Winter Coat" }],
      noImagesSample: [{ title: "Missing Images Product" }],
      noDescriptionSample: [{ title: "No Desc 1" }],
    },
    ...overrides,
  };
}

function stubEmptyShopTables() {
  vi.mocked(prisma.shopOrder.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.shopOrder.count).mockResolvedValue(0 as never);
  vi.mocked(prisma.shopOrder.findFirst).mockResolvedValue(null as never);
  vi.mocked(prisma.shopRefund.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.shopRefundLineItem.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.shopInventoryLevel.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.shopOrderLineItem.findMany).mockResolvedValue([] as never);
}

describe("computeOperationsDiagnosis product ops", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubEmptyShopTables();
  });

  it("still records product readiness when the shop has no orders", async () => {
    const admin = { graphql: vi.fn() };
    vi.mocked(loadProductOperations).mockResolvedValue(sampleProductOps());

    const result = await computeOperationsDiagnosis(SHOP, NOW, { shopifyAdmin: admin });

    expect(loadProductOperations).toHaveBeenCalledWith(admin);
    expect(result.hasData).toBe(false);
    expect(result.summaryMetrics.hasProductOpsData).toBe(true);
    expect(result.summaryMetrics.draftProductCount).toBe(2);
    expect(result.summaryMetrics.noImagesProductCount).toBe(1);
    expect(result.summaryMetrics.noDescriptionProductCount).toBe(3);
    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "product_operations",
          status: "watch",
        }),
      ]),
    );
  });

  it("stays pending when Shopify Admin is missing", async () => {
    vi.mocked(loadProductOperations).mockResolvedValue(null);

    const result = await computeOperationsDiagnosis(SHOP, NOW);

    expect(loadProductOperations).toHaveBeenCalledWith(null);
    expect(result.hasData).toBe(false);
    expect(result.summaryMetrics.hasProductOpsData).toBe(false);
    expect(result.items.find((item) => item.key === "product_operations")).toBeUndefined();
  });
});
