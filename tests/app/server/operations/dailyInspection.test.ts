import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../../../app/db.server";
import {
  createOperationTaskFromReportCandidate,
  getOperationTaskByIdForShop,
} from "../../../../app/server/operations/dailyInspection.server";
import type { ReportTaskCandidate } from "../../../../app/server/operations/businessReportSnapshot.shared";

vi.mock("../../../../app/db.server", () => ({
  default: {
    operationTask: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("../../../../app/server/operations/diagnosis.server", () => ({
  computeOperationsDiagnosis: vi.fn(),
  PAYMENT_SUCCESS_RISK_PERCENT: 85,
  PAYMENT_SUCCESS_WATCH_PERCENT: 92,
}));

function createCandidate(
  overrides: Partial<ReportTaskCandidate> = {},
): ReportTaskCandidate {
  return {
    problemKey: "growth_focus",
    sourceType: "hybrid",
    priority: "P2",
    quadrant: "q3",
    dueWindow: "this_week",
    ownerRole: "运营",
    objective: "围绕高价值客户和高利润渠道做放大。",
    impactMetrics: ["复购率", "客户终身价值"],
    estimatedLift: "预计提升复购率 2-4%。",
    confidence: "medium",
    riskEnvironment: "客户价值",
    whyNow: "高价值客群和利润渠道已经形成结构优势。",
    roiImpactSummary: "放大利润来源，改善长期 ROI。",
    action: "优先圈定高价值客群并规划二次触达。",
    dedupeKey: "growth_focus:high_value_segment:ltv:this_week",
    primaryObjectId: "high_value_segment",
    primaryObjectType: "customer_segment",
    aiExecutionPrompt: "请围绕高价值客户与高利润渠道规划增长动作。",
    ...overrides,
  };
}

describe("createOperationTaskFromReportCandidate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.operationTask.findFirst).mockResolvedValue(null as never);
  });

  it("creates a report-backed OperationTask with report metadata", async () => {
    const now = new Date("2026-08-20T08:00:00.000Z");
    vi.mocked(prisma.operationTask.create).mockResolvedValue({
      id: "task_1",
      dedupeKey: "growth_focus:high_value_segment:ltv:this_week",
      sourceKey: "report:growth_focus",
      title: "放大利润与高价值客群",
      quadrant: "q3",
      priority: "P2",
      status: "open",
      triggerReason: "高价值客群和利润渠道已经形成结构优势。",
      relatedObjects: {
        reportTask: {
          objective: "围绕高价值客户和高利润渠道做放大。",
          impactMetrics: ["复购率", "客户终身价值"],
          roiImpactSummary: "放大利润来源，改善长期 ROI。",
          effect: "revenue",
        },
      },
      suggestedActions: ["优先圈定高价值客群并规划二次触达。"],
      ownerRole: "运营",
      dueWindow: "this_week",
      dueAt: new Date("2026-08-27T08:00:00.000Z"),
      createdAt: now,
      resolvedAt: null,
    } as never);

    const result = await createOperationTaskFromReportCandidate("spark-test.myshopify.com", {
      title: "放大利润与高价值客群",
      taskCandidate: createCandidate(),
      now,
    });

    expect(result.created).toBe(true);
    expect(result.task.id).toBe("task_1");
    expect(prisma.operationTask.create).toHaveBeenCalledTimes(1);
    expect(vi.mocked(prisma.operationTask.create).mock.calls[0]?.[0]).toMatchObject({
      data: {
        sourceKey: "report:growth_focus",
        dedupeKey: "growth_focus:high_value_segment:ltv:this_week",
        triggerReason: "高价值客群和利润渠道已经形成结构优势。",
        suggestedActions: ["优先圈定高价值客群并规划二次触达。"],
        relatedObjects: {
          reportTask: {
            origin: "insights_report",
            problemKey: "growth_focus",
            objective: "围绕高价值客户和高利润渠道做放大。",
            roiImpactSummary: "放大利润来源，改善长期 ROI。",
            effect: "revenue",
            primaryObjectId: "high_value_segment",
            primaryObjectType: "customer_segment",
          },
        },
      },
    });
  });

  it("reuses an existing active rule task when the report candidate maps to the same rule source", async () => {
    vi.mocked(prisma.operationTask.findFirst).mockResolvedValue({
      id: "task_existing",
      dedupeKey: "inventory_risk",
      sourceKey: "inventory_risk",
      title: "为 6 个高动销 SKU 补货止损",
      quadrant: "q1",
      priority: "P0",
      status: "open",
      triggerReason: "库存风险已触发。",
      relatedObjects: { skus: [] },
      suggestedActions: ["优先补货"],
      ownerRole: "供应链/采购",
      dueWindow: "today",
      dueAt: null,
      createdAt: new Date("2026-08-20T06:00:00.000Z"),
      resolvedAt: null,
    } as never);

    const result = await createOperationTaskFromReportCandidate("spark-test.myshopify.com", {
      title: "先处理高风险 SKU",
      taskCandidate: createCandidate({
        problemKey: "inventory_risk",
        sourceType: "rule",
        priority: "P0",
        quadrant: "q1",
        dueWindow: "today",
        ownerRole: "供应链/采购",
        objective: "优先为高风险 SKU 补货止损。",
        impactMetrics: ["缺货率"],
        estimatedLift: "预计回收缺货损失。",
        confidence: "high",
        riskEnvironment: "库存",
        whyNow: "风险 SKU 已经开始漏损销售。",
        roiImpactSummary: "先止住库存漏损，保护短期 ROI。",
        action: "优先补货或限量销售。",
        dedupeKey: "inventory_risk:risk_skus:inventory_loss:today",
        primaryObjectId: "risk_skus",
        primaryObjectType: "inventory_cluster",
        aiExecutionPrompt: "请优先处理高风险 SKU 的补货止损。",
      }),
    });

    expect(result.created).toBe(false);
    expect(result.task.id).toBe("task_existing");
    expect(prisma.operationTask.create).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.operationTask.findFirst).mock.calls[0]?.[0]).toMatchObject({
      where: {
        OR: expect.arrayContaining([
          { dedupeKey: "inventory_risk:risk_skus:inventory_loss:today" },
          { sourceKey: "inventory_risk" },
        ]),
      },
    });
  });
});

function createStoredOperationTask(overrides: Record<string, unknown> = {}) {
  const now = new Date("2026-08-20T08:00:00.000Z");
  return {
    id: "task_lookup",
    shop: "spark-test.myshopify.com",
    dedupeKey: "inventory_risk:risk_skus:inventory_loss:today",
    sourceKey: "inventory_risk",
    sourceType: "rule",
    title: "补货止损",
    quadrant: "q1",
    priority: "P0",
    status: "done",
    triggerReason: "库存风险上升",
    objective: null,
    impactMetrics: ["缺货率"],
    estimatedLift: null,
    roiImpactSummary: null,
    confidence: "high",
    riskEnvironment: "库存",
    aiContextPayload: null,
    relatedObjects: {},
    suggestedActions: ["按预估损失排序补货"],
    ownerRole: "供应链",
    dueWindow: "today",
    dueAt: null,
    createdAt: now,
    resolvedAt: now,
    ...overrides,
  };
}

describe("getOperationTaskByIdForShop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.operationTask.findFirst).mockResolvedValue(null as never);
  });

  it("returns the task when it belongs to the shop", async () => {
    vi.mocked(prisma.operationTask.findFirst).mockResolvedValue(
      createStoredOperationTask() as never,
    );

    const result = await getOperationTaskByIdForShop(
      "spark-test.myshopify.com",
      "task_lookup",
    );

    expect(result?.id).toBe("task_lookup");
    expect(result?.status).toBe("done");
    expect(vi.mocked(prisma.operationTask.findFirst).mock.calls[0]?.[0]).toMatchObject({
      where: { id: "task_lookup", shop: "spark-test.myshopify.com" },
    });
  });

  it("returns null when the task does not exist", async () => {
    const result = await getOperationTaskByIdForShop(
      "spark-test.myshopify.com",
      "missing_task",
    );

    expect(result).toBeNull();
  });

  it("returns null when the task belongs to another shop", async () => {
    const result = await getOperationTaskByIdForShop(
      "other-shop.myshopify.com",
      "task_lookup",
    );

    expect(result).toBeNull();
    expect(vi.mocked(prisma.operationTask.findFirst).mock.calls[0]?.[0]).toMatchObject({
      where: { id: "task_lookup", shop: "other-shop.myshopify.com" },
    });
  });
});
