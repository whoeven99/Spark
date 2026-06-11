import { describe, expect, it } from "vitest";
import type { DailyOperationsResult } from "~/server/operations/dailyInspection.server";
import {
  buildWorkspaceDashboardFromDailyOps,
  emptyWorkspaceDashboardSnapshot,
} from "~/server/operations/workspaceDashboard.server";

function baseResult(overrides: Partial<DailyOperationsResult> = {}): DailyOperationsResult {
  return {
    shop: "test.myshopify.com",
    snapshotDate: "2026-06-12",
    generatedAt: "2026-06-12T08:00:00.000Z",
    hasData: true,
    metrics: {
      orderCount30d: 100,
      revenue30d: 10000,
      aov30d: 100,
      cancelRate30d: 2,
      refundAmount30d: 500,
      refundRate30d: 5,
      refundRatePrev30d: 4,
      refundRateDelta: 1,
      fulfillmentRate30d: 90,
      averageFulfillmentHours: 12,
      salesAmount7d: 3000,
      salesAmountPrev7d: 2500,
      salesGrowthRate: 20,
      orderCount7d: 40,
      orderCountPrev7d: 35,
      aov7d: 75,
      aovPrev7d: 71.4,
      pendingOrderCount: 3,
      overdueOrderCount: 2,
      carrierIssueCount: 1,
      riskSkuCount: 2,
      watchSkuCount: 4,
      estimatedInventoryLoss: 120,
      currency: "USD",
    },
    items: [
      {
        key: "inventory_health",
        name: "库存健康",
        status: "risk",
        metrics: {},
        evidence: ["2 个 SKU 可售天数不足 7 天"],
        reasoning: ["优先为高动销 SKU 补货"],
        formulas: [],
      },
    ],
    tasks: [
      {
        id: "task-1",
        sourceKey: "inventory_risk",
        title: "补货止损",
        quadrant: "q1",
        priority: "P0",
        status: "open",
        triggerReason: "库存风险上升",
        relatedObjects: {},
        suggestedActions: ["按预估损失排序补货"],
        ownerRole: "供应链",
        dueWindow: "today",
        dueAt: null,
        createdAt: "2026-06-12T08:00:00.000Z",
        resolvedAt: null,
      },
    ],
    review: null,
    ...overrides,
  };
}

describe("buildWorkspaceDashboardFromDailyOps", () => {
  it("returns empty snapshot when hasData is false", () => {
    const snapshot = buildWorkspaceDashboardFromDailyOps(
      baseResult({ hasData: false, items: [], tasks: [] }),
    );
    expect(snapshot.hasData).toBe(false);
    expect(snapshot.metrics[0].value).toBe("—");
    expect(snapshot.suggestions[0]).toContain("暂无订单数据");
  });

  it("maps core metrics from daily operations", () => {
    const snapshot = buildWorkspaceDashboardFromDailyOps(baseResult());
    expect(snapshot.hasData).toBe(true);
    expect(snapshot.metrics[0].label).toBe("销售额");
    expect(snapshot.metrics[0].delta).toBe("+20%");
    expect(snapshot.metrics[2].value).toBe("待接入");
    expect(snapshot.metrics[4].value).toBe("5%");
    expect(snapshot.metrics[5].value).toBe("2");
  });

  it("builds alerts from diagnosis and suggestions from reasoning/tasks", () => {
    const snapshot = buildWorkspaceDashboardFromDailyOps(baseResult());
    expect(snapshot.alerts[0]?.title).toBe("库存健康");
    expect(snapshot.suggestions).toContain("优先为高动销 SKU 补货");
    expect(snapshot.suggestions).toContain("按预估损失排序补货");
  });

  it("emptyWorkspaceDashboardSnapshot is stable", () => {
    const snapshot = emptyWorkspaceDashboardSnapshot();
    expect(snapshot.metrics.length).toBe(6);
    expect(snapshot.hasData).toBe(false);
  });
});
