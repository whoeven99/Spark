import { describe, expect, it } from "vitest";
import type { DiagnosisItemResult } from "../../../../app/server/operations/diagnosis.server";
import {
  diagnosisItemName,
  diagnosisItemSummary,
  localizeOperationTaskCopy,
  toOpsCopyLocale,
} from "../../../../app/server/operations/opsCopy.server";
import type { OperationsSummaryMetrics } from "../../../../app/server/operations/diagnosis.server";

function baseMetrics(overrides: Partial<OperationsSummaryMetrics> = {}): OperationsSummaryMetrics {
  return {
    orderCount30d: 0,
    revenue30d: 0,
    aov30d: 0,
    cancelRate30d: 0,
    refundAmount30d: 0,
    refundRate30d: 18.8,
    refundRatePrev30d: 10,
    refundRateDelta: 8.8,
    fulfillmentRate30d: 40,
    averageFulfillmentHours: 60,
    salesAmount7d: 100,
    salesAmountPrev7d: 120,
    salesGrowthRate: -16.7,
    orderCount7d: 10,
    orderCountPrev7d: 12,
    aov7d: 10,
    aovPrev7d: 10,
    pendingOrderCount: 20,
    overdueOrderCount: 15,
    carrierIssueCount: 2,
    riskSkuCount: 9,
    watchSkuCount: 3,
    estimatedInventoryLoss: 391.47,
    currency: "EUR",
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
    hasProductOpsData: true,
    draftProductCount: 27,
    noImagesProductCount: 0,
    noDescriptionProductCount: 0,
    ...overrides,
  };
}

describe("opsCopy", () => {
  it("maps UI locale tags to ops copy locale", () => {
    expect(toOpsCopyLocale("en")).toBe("en");
    expect(toOpsCopyLocale("zh-CN")).toBe("zh");
    expect(toOpsCopyLocale("zh")).toBe("zh");
  });

  it("localizes diagnosis names and summaries for English", () => {
    const fulfillment: DiagnosisItemResult = {
      key: "fulfillment_health",
      name: "履约健康",
      status: "risk",
      metrics: { overdueOrderCount: 15, slaHours: 48, fulfillmentRate30d: 40 },
      evidence: [],
      reasoning: ["存在 15 单超过 48 小时未发货"],
      formulas: [],
    };
    const refund: DiagnosisItemResult = {
      key: "refund_health",
      name: "退款与售后",
      status: "risk",
      metrics: { refundRate30d: 18.8, refundRateDelta: 8.8 },
      evidence: [],
      reasoning: ["退款率偏高"],
      formulas: [],
    };

    expect(diagnosisItemName("fulfillment_health", "en")).toBe("Fulfillment health");
    expect(diagnosisItemName("refund_health", "en")).toBe("Refunds & after-sales");
    expect(diagnosisItemSummary(fulfillment, "en")).toContain("15 order(s)");
    expect(diagnosisItemSummary(refund, "en")).toContain("18.8%");
    expect(diagnosisItemSummary(fulfillment, "en")).not.toMatch(/[\u4e00-\u9fff]/);
  });

  it("localizes priority task titles for English", () => {
    const metrics = baseMetrics();
    const overdue = localizeOperationTaskCopy(
      {
        sourceKey: "fulfillment_overdue",
        title: "处理 15 单超时未发货订单",
        triggerReason: "中文触发原因",
      },
      metrics,
      "en",
    );
    const inventory = localizeOperationTaskCopy(
      {
        sourceKey: "inventory_risk",
        title: "为 9 个高动销 SKU 补货止损",
        triggerReason: "中文",
      },
      metrics,
      "en",
    );
    const launch = localizeOperationTaskCopy(
      {
        sourceKey: "launch_failure_review",
        title: "立即复盘上新失败与待上架商品",
        triggerReason: "中文",
        priority: "P0",
        quadrant: "q1",
        relatedObjects: { draftCount: 27, noImagesCount: 0, noDescriptionCount: 0 },
      },
      metrics,
      "en",
    );
    const refund = localizeOperationTaskCopy(
      {
        sourceKey: "refund_spike",
        title: "复盘退款异常上升原因",
        triggerReason: "中文",
      },
      metrics,
      "en",
    );

    expect(overdue.title).toBe("Clear 15 overdue unfulfilled order(s)");
    expect(inventory.title).toContain("9 high-velocity SKU");
    expect(launch.title).toMatch(/Review failed launches/i);
    expect(refund.title).toMatch(/refund spike/i);
    expect(overdue.title + inventory.title + launch.title + refund.title).not.toMatch(
      /[\u4e00-\u9fff]/,
    );
  });

  it("keeps Chinese task copy when locale is zh", () => {
    const copy = localizeOperationTaskCopy(
      {
        sourceKey: "fulfillment_overdue",
        title: "处理 15 单超时未发货订单",
        triggerReason: "已触及履约 SLA 红线",
      },
      baseMetrics(),
      "zh",
    );
    expect(copy.title).toBe("处理 15 单超时未发货订单");
    expect(copy.triggerReason).toBe("已触及履约 SLA 红线");
  });
});
