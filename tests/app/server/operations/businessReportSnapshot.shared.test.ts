import { describe, expect, it } from "vitest";
import {
  buildLiveSnapshots,
  buildReportGenerationTrace,
  buildReportTaskCandidatePipeline,
  mergeReportTaskCandidates,
  type BusinessModule,
  type FactorDiagnosisCard,
  type InsightListItem,
  type ReportRecommendedAction,
  type ReportTaskCandidate,
} from "~/server/operations/businessReportSnapshot.shared";

function createCandidate(
  overrides: Partial<ReportTaskCandidate> = {},
): ReportTaskCandidate {
  return {
    problemKey: "refund_spike",
    sourceType: "rule",
    priority: "P1",
    quadrant: "q1",
    dueWindow: "48h",
    ownerRole: "运营/售后",
    objective: "复盘退款异常，确认问题集中在哪些 SKU 和订单链路。",
    impactMetrics: ["退款率"],
    estimatedLift: "预计 1 周内把退款率拉回基线。",
    confidence: "medium",
    riskEnvironment: "售后与履约",
    whyNow: "退款率已经开始侵蚀利润。",
    roiImpactSummary: "先止住退款损耗，保护短期 ROI。",
    action: "先排查退款 SKU 和异常订单。",
    dedupeKey: "refund_spike:sku_123:refund_rate:48h",
    primaryObjectId: "sku_123",
    primaryObjectType: "sku",
    aiExecutionPrompt: "请先排查退款 SKU 和异常订单。",
    ...overrides,
  };
}

describe("mergeReportTaskCandidates", () => {
  it("dedupes rule and ai candidates with the same problem key", () => {
    const ruleCandidate = createCandidate({
      sourceType: "rule",
      priority: "P0",
      confidence: "medium",
      objective: "复盘退款异常并先止住继续扩大的损耗。",
    });
    const aiCandidate = createCandidate({
      sourceType: "hybrid",
      priority: "P1",
      confidence: "high",
      impactMetrics: ["退款率", "复购率"],
      objective: "结合退款 SKU、履约异常和差评反馈，补全问题归因并明确优先处理对象。",
      estimatedLift: "预计同时改善退款率和后续复购表现。",
      aiExecutionPrompt: "请结合退款 SKU、履约异常和差评反馈，输出优先处理顺序。",
    });

    const pipeline = mergeReportTaskCandidates([ruleCandidate], [aiCandidate]);

    expect(pipeline.dedupedCount).toBe(1);
    expect(pipeline.mergedCandidates).toHaveLength(1);
    expect(pipeline.ruleCandidates).toHaveLength(1);
    expect(pipeline.aiCandidates).toHaveLength(1);

    const merged = pipeline.mergedCandidates[0];
    expect(merged?.sourceType).toBe("hybrid");
    expect(merged?.priority).toBe("P0");
    expect(merged?.confidence).toBe("high");
    expect(merged?.impactMetrics).toEqual(["退款率", "复购率"]);
    expect(merged?.objective).toBe(aiCandidate.objective);
    expect(merged?.primaryObjectId).toBe("sku_123");
  });
});

describe("buildReportTaskCandidatePipeline", () => {
  it("splits rule and ai candidates from report actions", () => {
    const actions: ReportRecommendedAction[] = [
      {
        key: "inventory_risk",
        title: "先处理高风险 SKU",
        roiLayerLabel: "短期 ROI",
        summary: "高风险 SKU 正在漏损销售。",
        action: "优先补货或限量。",
        tone: "negative",
        taskCandidate: createCandidate({
          problemKey: "inventory_risk",
          sourceType: "rule",
          dedupeKey: "inventory_risk:risk_sku:缺货率:today",
          primaryObjectId: "risk_sku",
          primaryObjectType: "inventory_cluster",
          impactMetrics: ["缺货率"],
          dueWindow: "today",
        }),
      },
      {
        key: "growth_focus",
        title: "放大利润与高价值客群",
        roiLayerLabel: "长期价值",
        summary: "开始做结构性放大。",
        action: "优先围绕高价值客群做放大。",
        tone: "positive",
        taskCandidate: createCandidate({
          problemKey: "growth_focus",
          sourceType: "hybrid",
          dedupeKey: "growth_focus:high_value_customers:复购率:this_week",
          primaryObjectId: "high_value_customers",
          primaryObjectType: "customer_segment",
          impactMetrics: ["复购率"],
          dueWindow: "this_week",
          quadrant: "q3",
          priority: "P2",
        }),
      },
    ];

    const pipeline = buildReportTaskCandidatePipeline(actions);

    expect(pipeline.ruleCandidates).toHaveLength(1);
    expect(pipeline.aiCandidates).toHaveLength(1);
    expect(pipeline.mergedCandidates).toHaveLength(2);
    expect(pipeline.dedupedCount).toBe(0);
  });
});

describe("buildReportGenerationTrace", () => {
  it("captures module benchmark, source inputs, and mapped actions", () => {
    const modules: BusinessModule[] = [
      {
        key: "conversion",
        title: "转化效率",
        subtitle: "站内漏斗",
        source: "real",
        summary: "站内转化正在承压。",
        metrics: [
          { label: "整体 CVR", value: "2.1%", delta: "-12.0%" },
          { label: "支付成功率", value: "89.0%" },
        ],
        chart: {
          title: "转化漏斗",
          kind: "funnel",
          items: [{ label: "访问", value: 100, display: "10k" }],
        },
        signals: ["支付成功率下滑"],
        actionHint: "优先复盘漏斗卡点。",
      },
    ];

    const factorCards: FactorDiagnosisCard[] = [
      {
        key: "conversion",
        title: "转化效率",
        statusLabel: "Risk",
        roiLayerLabel: "回收速度",
        summary: "转化正在承压。",
        evidence: ["整体 CVR 2.1%"],
        comparison: "历史基准：整体 CVR -12.0%",
        impactPath: "访问进入 -> 站内漏斗 -> 支付成功 -> 回收速度",
        action: "优先修站内漏斗。",
        source: "real",
        tone: "negative",
        href: "/app/insights/charts?group=conversion&card=funnel",
      },
    ];

    const insights: InsightListItem[] = [
      {
        title: "站内转化正在拖慢回收速度",
        confidence: "高",
        metric: "CVR / 支付成功率",
        detail: "先修漏斗卡点。",
        tone: "critical",
        targetKey: "conversion",
        href: "/app/insights/charts?group=conversion&card=funnel",
      },
    ];

    const actions: ReportRecommendedAction[] = [
      {
        key: "conversion_repair",
        title: "先修站内转化链路",
        roiLayerLabel: "回收速度",
        summary: "当前 CVR 下滑，先修站内。",
        action: "先看漏斗掉点。",
        tone: "warning",
        targetModuleKeys: ["conversion"],
        taskCandidate: createCandidate({
          problemKey: "conversion_repair",
          dedupeKey: "conversion_repair:landing:/products/a:today",
          impactMetrics: ["整体 CVR", "支付成功率"],
          whyNow: "继续加流量只会放大低转化问题。",
        }),
      },
    ];

    const trace = buildReportGenerationTrace({
      modules,
      factorCards,
      actions,
      insights,
    });

    expect(trace.factors).toHaveLength(1);
    expect(trace.actions).toHaveLength(1);
    expect(trace.factors[0]).toMatchObject({
      moduleKey: "conversion",
      roiLayerLabel: "回收速度",
      source: "real",
      benchmark: {
        kind: "historical",
        summary: "历史基准：整体 CVR -12.0%",
      },
      classification: {
        statusLabel: "Risk",
        tone: "negative",
        insightTitle: "站内转化正在拖慢回收速度",
      },
      mappedActionKeys: ["conversion_repair"],
      impactPath: "访问进入 -> 站内漏斗 -> 支付成功 -> 回收速度",
    });
    expect(trace.factors[0]?.sourceInputs).toContain("Sessions");
    expect(trace.factors[0]?.derivedMetrics[0]).toMatchObject({
      label: "整体 CVR",
      value: "2.1%",
      delta: "-12.0%",
    });
    expect(trace.actions[0]).toMatchObject({
      actionKey: "conversion_repair",
      title: "先修站内转化链路",
      targetModuleKeys: ["conversion"],
      sourceType: "rule",
      problemKey: "conversion_repair",
      dedupeKey: "conversion_repair:landing:/products/a:today",
      whyNow: "继续加流量只会放大低转化问题。",
      impactMetrics: ["整体 CVR", "支付成功率"],
    });
  });
});

describe("buildLiveSnapshots", () => {
  it("exposes ROI data quality and confidence on report layers", () => {
    const snapshots = buildLiveSnapshots(null);
    const roiLayers = snapshots["7d"].report.roiLayers;

    expect(roiLayers).toHaveLength(3);
    expect(roiLayers[0]).toMatchObject({
      key: "short_term",
      dataQuality: "estimated",
      confidence: "low",
    });
    expect(roiLayers[1]).toMatchObject({
      key: "payback",
      dataQuality: "estimated",
      confidence: "medium",
    });
    expect(roiLayers[2]).toMatchObject({
      key: "lifetime",
      dataQuality: "predicted",
      confidence: "low",
    });
  });
});
