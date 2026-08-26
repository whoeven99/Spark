import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../../../app/db.server";
import {
  ensureDailySnapshot,
  ensureDailySnapshotOverview,
} from "../../../../app/server/operations/dailyInspection.server";
import { computeOperationsDiagnosis } from "../../../../app/server/operations/diagnosis.server";
import type { OperationsDiagnosis } from "../../../../app/server/operations/diagnosis.server";

vi.mock("../../../../app/db.server", () => ({
  default: {
    operationDiagnosisSnapshot: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
      create: vi.fn(),
    },
    operationTask: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("../../../../app/server/operations/diagnosis.server", () => ({
  computeOperationsDiagnosis: vi.fn(),
  PAYMENT_SUCCESS_RISK_PERCENT: 70,
  PAYMENT_SUCCESS_WATCH_PERCENT: 90,
}));

const SHOP = "spark-test.myshopify.com";
const NOW = new Date("2026-08-26T12:00:00.000Z");
const DATE_KEY = "2026-08-26";

function emptyMetrics(hasProductOpsData: boolean) {
  return {
    orderCount30d: 0,
    revenue30d: 0,
    aov30d: 0,
    cancelRate30d: 0,
    refundAmount30d: 0,
    refundRate30d: 0,
    refundRatePrev30d: 0,
    refundRateDelta: 0,
    fulfillmentRate30d: 0,
    averageFulfillmentHours: 0,
    salesAmount7d: 0,
    salesAmountPrev7d: 0,
    salesGrowthRate: null,
    orderCount7d: 0,
    orderCountPrev7d: 0,
    aov7d: 0,
    aovPrev7d: 0,
    pendingOrderCount: 0,
    overdueOrderCount: 0,
    carrierIssueCount: 0,
    riskSkuCount: 0,
    watchSkuCount: 0,
    estimatedInventoryLoss: 0,
    currency: "USD",
    hasPixelData: false,
    sessions7d: 0,
    sessionsPrev7d: 0,
    trafficChangeRate: null,
    conversionRate7d: null,
    conversionRatePrev7d: null,
    paymentAttempts7d: 0,
    paymentSuccessful7d: 0,
    paymentSuccessRate7d: null,
    paymentFailureCount7d: 0,
    hasProductOpsData,
    draftProductCount: hasProductOpsData ? 2 : 0,
    noImagesProductCount: hasProductOpsData ? 1 : 0,
    noDescriptionProductCount: 0,
  };
}

function diagnosisWithProductOps(): OperationsDiagnosis {
  return {
    shop: SHOP,
    generatedAt: NOW.toISOString(),
    hasData: false,
    totalOrdersAllTime: 0,
    summaryMetrics: emptyMetrics(true),
    items: [
      {
        key: "product_operations",
        name: "商品运营",
        status: "watch",
        metrics: {
          draftProductCount: 2,
          noImagesProductCount: 1,
          noDescriptionProductCount: 0,
          totalIssues: 3,
        },
        evidence: ["DRAFT 商品 2 个，缺图 1 个，缺描述 0 个"],
        reasoning: ["有 2 个商品草稿待上架"],
        formulas: [],
      },
    ],
    detail: {
      overdueOrders: [],
      routineUnfulfilledOrders: [],
      carrierIssues: [],
      inventoryRisks: [],
      topRefundSkus: [],
      abnormalRefundOrders: [],
    },
  };
}

function existingSnapshot(hasProductOpsData: boolean) {
  return {
    id: "snap_old",
    shop: SHOP,
    snapshotDate: DATE_KEY,
    generatedAt: NOW,
    hasData: false,
    metrics: emptyMetrics(hasProductOpsData),
    items: [],
  };
}

describe("ensureDailySnapshot product ops refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.operationDiagnosisSnapshot.findFirst).mockResolvedValue(null as never);
    vi.mocked(prisma.operationTask.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.operationTask.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.operationDiagnosisSnapshot.create).mockResolvedValue({
      id: "snap_new",
      snapshotDate: DATE_KEY,
      generatedAt: NOW,
      hasData: false,
    } as never);
    vi.mocked(computeOperationsDiagnosis).mockResolvedValue(diagnosisWithProductOps());
  });

  it("rebuilds a pending product-ops snapshot when Admin is now available", async () => {
    const admin = { graphql: vi.fn() };
    vi.mocked(prisma.operationDiagnosisSnapshot.findUnique).mockResolvedValue(
      existingSnapshot(false) as never,
    );

    const result = await ensureDailySnapshotOverview(SHOP, {
      now: NOW,
      shopifyAdmin: admin,
    });

    expect(computeOperationsDiagnosis).toHaveBeenCalledWith(SHOP, NOW, {
      shopifyAdmin: admin,
    });
    expect(prisma.operationDiagnosisSnapshot.delete).toHaveBeenCalledWith({
      where: { id: "snap_old" },
    });
    expect(prisma.operationDiagnosisSnapshot.create).toHaveBeenCalledTimes(1);
    expect(result.metrics.hasProductOpsData).toBe(true);
    expect(result.environments.find((item) => item.key === "new-arrivals")?.source).toBe("real");
  });

  it("reuses a pending snapshot when Admin is still missing", async () => {
    vi.mocked(prisma.operationDiagnosisSnapshot.findUnique).mockResolvedValue(
      existingSnapshot(false) as never,
    );

    const result = await ensureDailySnapshotOverview(SHOP, { now: NOW });

    expect(computeOperationsDiagnosis).not.toHaveBeenCalled();
    expect(prisma.operationDiagnosisSnapshot.create).not.toHaveBeenCalled();
    expect(result.metrics.hasProductOpsData).toBe(false);
    expect(result.environments.find((item) => item.key === "new-arrivals")?.source).toBe("pending");
  });

  it("reuses a complete snapshot even when Admin is present", async () => {
    const admin = { graphql: vi.fn() };
    vi.mocked(prisma.operationDiagnosisSnapshot.findUnique).mockResolvedValue(
      existingSnapshot(true) as never,
    );

    const result = await ensureDailySnapshotOverview(SHOP, {
      now: NOW,
      shopifyAdmin: admin,
    });

    expect(computeOperationsDiagnosis).not.toHaveBeenCalled();
    expect(prisma.operationDiagnosisSnapshot.create).not.toHaveBeenCalled();
    expect(result.metrics.hasProductOpsData).toBe(true);
  });

  it("does not re-query product GraphQL when a complete snapshot already exists", async () => {
    vi.mocked(prisma.operationDiagnosisSnapshot.findUnique).mockResolvedValue(
      existingSnapshot(true) as never,
    );

    await ensureDailySnapshot(SHOP, {
      now: NOW,
      shopifyAdmin: { graphql: vi.fn() },
    });

    expect(computeOperationsDiagnosis).toHaveBeenCalledWith(SHOP, NOW);
    expect(prisma.operationDiagnosisSnapshot.create).not.toHaveBeenCalled();
  });
});
