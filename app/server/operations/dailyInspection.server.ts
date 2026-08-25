import prisma from "../../db.server";
import type { ReportTaskCandidate } from "./reportTaskCandidate.shared";
import {
  computeOperationsDiagnosis,
  PAYMENT_SUCCESS_RISK_PERCENT,
  PAYMENT_SUCCESS_WATCH_PERCENT,
  type DiagnosisItemResult,
  type DiagnosisStatus,
  type OperationsDiagnosis,
  type OperationsSummaryMetrics,
} from "./diagnosis.server";
import type { ShopifyAdminGraphqlClient } from "./productOperationsQuery.server";
import {
  dueWindowToDate,
  evaluateDiagnosisRules,
  RULE_MANAGED_SOURCE_KEYS,
  type TaskDueWindow,
  type TaskPriority,
  type TaskQuadrant,
} from "./diagnosisRules.server";

/**
 * 每日巡检服务：生成/读取当日诊断快照，同步四象限待办任务，输出昨日复盘。
 *
 * 触发方式为「懒巡检」：当天首个访问触发计算，后续访问直接读快照；
 * 后续可平滑切换为定时器调用 ensureDailySnapshot。
 */

const IGNORED_SUPPRESS_DAYS = 7;
/** open 任务超过该天数未处理自动标记过期关闭，避免列表无限堆积 */
const STALE_TASK_AUTO_CLOSE_DAYS = 14;

export type OperationTaskView = {
  id: string;
  dedupeKey: string;
  sourceKey: string;
  sourceType: "rule" | "ai" | "hybrid";
  title: string;
  quadrant: TaskQuadrant;
  priority: TaskPriority;
  status: string;
  triggerReason: string;
  objective: string | null;
  impactMetrics: string[];
  estimatedLift: string | null;
  roiImpactSummary: string | null;
  confidence: "high" | "medium" | "low" | null;
  riskEnvironment: string | null;
  aiContextPayload: unknown;
  relatedObjects: unknown;
  suggestedActions: string[];
  ownerRole: string | null;
  dueWindow: TaskDueWindow;
  dueAt: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

export type DailyReviewDelta = {
  key: string;
  label: string;
  previous: number;
  current: number;
  /** true=改善 false=恶化 null=持平 */
  improved: boolean | null;
};

export type DailyReview = {
  previousDate: string;
  deltas: DailyReviewDelta[];
  resolvedTaskCount: number;
};

export type DailyOperationsSource = "real" | "estimated" | "pending";

export type DailyOperationsEnvironmentKey =
  | "new-arrivals"
  | "inventory"
  | "fulfillment"
  | "payments"
  | "risk-control"
  | "after-sales"
  | "conversion";

export type DailyOperationsEnvironment = {
  key: DailyOperationsEnvironmentKey;
  titleKey: string;
  status: DiagnosisItemResult["status"];
  source: DailyOperationsSource;
  summary: string;
  metrics: Record<string, number | string | null>;
};

export type DailyOperationsInsightConfidence = "high" | "medium" | "low";

export type DailyOperationsInsight = {
  key: string;
  diagnosisKey: DiagnosisItemResult["key"];
  title: string;
  status: DiagnosisItemResult["status"];
  summary: string;
  confidence: DailyOperationsInsightConfidence;
  evidence: string[];
  reasoning: string[];
  taskCount: number;
  relatedTaskSourceKeys: string[];
  environmentKeys: DailyOperationsEnvironmentKey[];
};

export type DailyOperationsOverview = {
  salesAmount7d: number;
  salesGrowthRate: number | null;
  currency: string;
  activeRiskCount: number;
  watchRiskCount: number;
  insightCount: number;
  openTaskCount: number;
  inProgressTaskCount: number;
  doneTaskCount: number;
  overdueOrderCount: number;
  carrierIssueCount: number;
  riskSkuCount: number;
  refundRate30d: number;
  hasPixelData: boolean;
  sessions7d: number | null;
  conversionRate7d: number | null;
};

export type DailyOperationsDetail = OperationsDiagnosis["detail"];

export type DailyOperationsResult = {
  shop: string;
  snapshotDate: string;
  generatedAt: string;
  hasData: boolean;
  metrics: OperationsSummaryMetrics;
  overview: DailyOperationsOverview;
  detail: DailyOperationsDetail;
  environments: DailyOperationsEnvironment[];
  insights: DailyOperationsInsight[];
  items: DiagnosisItemResult[];
  tasks: OperationTaskView[];
  review: DailyReview | null;
};

/**
 * 概览结果：不含 `detail`。
 * `detail`（异常订单、退款 SKU、库存风险等明细对象）只能由 `computeOperationsDiagnosis`
 * 现算，无法从快照恢复，代价是一轮 30 天全量查询。因此只读指标/诊断项/任务的调用方
 * 应使用本类型，避免为用不到的明细付这笔成本。
 */
export type DailyOperationsOverviewResult = Omit<DailyOperationsResult, "detail">;

const DEFAULT_SNAPSHOT_TIMEZONE = "UTC";

/** 按店铺时区生成 YYYY-MM-DD 快照键（与商户感知的「今日」一致）。 */
function toDateKey(date: Date, timeZone: string = DEFAULT_SNAPSHOT_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function toTaskView(task: {
  id: string;
  dedupeKey: string;
  sourceKey: string;
  sourceType: string;
  title: string;
  quadrant: string;
  priority: string;
  status: string;
  triggerReason: string;
  objective: string | null;
  impactMetrics: unknown;
  estimatedLift: string | null;
  roiImpactSummary: string | null;
  confidence: string | null;
  riskEnvironment: string | null;
  aiContextPayload: unknown;
  relatedObjects: unknown;
  suggestedActions: unknown;
  ownerRole: string | null;
  dueWindow: string;
  dueAt: Date | null;
  createdAt: Date;
  resolvedAt: Date | null;
}): OperationTaskView {
  return {
    id: task.id,
    dedupeKey: task.dedupeKey,
    sourceKey: task.sourceKey,
    sourceType:
      task.sourceType === "ai" || task.sourceType === "hybrid" ? task.sourceType : "rule",
    title: task.title,
    quadrant: task.quadrant as TaskQuadrant,
    priority: task.priority as TaskPriority,
    status: task.status,
    triggerReason: task.triggerReason,
    objective: task.objective,
    impactMetrics: Array.isArray(task.impactMetrics) ? (task.impactMetrics as string[]) : [],
    estimatedLift: task.estimatedLift,
    roiImpactSummary: task.roiImpactSummary,
    confidence:
      task.confidence === "high" || task.confidence === "medium" || task.confidence === "low"
        ? task.confidence
        : null,
    riskEnvironment: task.riskEnvironment,
    aiContextPayload: task.aiContextPayload ?? null,
    relatedObjects: task.relatedObjects,
    suggestedActions: Array.isArray(task.suggestedActions)
      ? (task.suggestedActions as string[])
      : [],
    ownerRole: task.ownerRole,
    dueWindow: task.dueWindow as TaskDueWindow,
    dueAt: task.dueAt?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
    resolvedAt: task.resolvedAt?.toISOString() ?? null,
  };
}

function buildFallbackOperationTasks(now: Date = new Date()): OperationTaskView[] {
  const createdAt = now.toISOString();
  const dueAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  return [
    {
      id: "fallback-payment-chain-review",
      dedupeKey: "fallback:payment_chain_review",
      sourceKey: "payment_chain_review",
      sourceType: "rule",
      title: "排查移动端支付链路异常",
      quadrant: "q1",
      priority: "P0",
      status: "open",
      triggerReason: "演示环境下检测到支付成功率波动，先优先复核移动端结账流程。",
      objective: "先确认支付失败集中在哪个设备、支付方式和结账步骤。",
      impactMetrics: ["支付成功率", "订单完成率"],
      estimatedLift: "预计先回收结账末段流失。",
      roiImpactSummary: "减少支付失败带来的直接订单损失。",
      confidence: "medium",
      riskEnvironment: "payments",
      aiContextPayload: {
        diagnosisKey: "conversion_health",
        objectType: "order",
      },
      relatedObjects: {
        orders: [
          { orderNumber: "#1001", reason: "移动端信用卡支付失败" },
          { orderNumber: "#1002", reason: "回跳超时" },
        ],
      },
      suggestedActions: ["按设备和支付方式拆失败订单", "优先复核移动端结账页与回跳链路"],
      ownerRole: "运营",
      dueWindow: "today",
      dueAt,
      createdAt,
      resolvedAt: null,
    },
    {
      id: "fallback-launch-failure-review",
      dedupeKey: "fallback:launch_failure_review",
      sourceKey: "launch_failure_review",
      sourceType: "rule",
      title: "复盘上新失败商品",
      quadrant: "q2",
      priority: "P1",
      status: "open",
      triggerReason: "演示环境下发现上新商品存在待上架和素材缺失，建议先做上新复盘。",
      objective: "确认主推新品是卡在上架、图片，还是商品描述完整度。",
      impactMetrics: ["上新完成率", "商品就绪度"],
      estimatedLift: "预计缩短新品进入可投放状态的时间。",
      roiImpactSummary: "减少新品无法承接流量造成的投放浪费。",
      confidence: "medium",
      riskEnvironment: "new-arrivals",
      aiContextPayload: {
        diagnosisKey: "product_operations",
        objectType: "sku",
      },
      relatedObjects: {
        skus: [
          { sku: "NEW-TSHIRT-001", issue: "缺主图" },
          { sku: "NEW-BAG-002", issue: "仍是草稿状态" },
        ],
      },
      suggestedActions: ["优先处理近期要投放的商品", "把缺图、缺描述、待上架拆开跟进"],
      ownerRole: "商品运营",
      dueWindow: "48h",
      dueAt,
      createdAt,
      resolvedAt: null,
    },
    {
      id: "fallback-after-sales-timeout",
      dedupeKey: "fallback:after_sales_timeout",
      sourceKey: "after_sales_timeout",
      sourceType: "rule",
      title: "处理超时售后工单",
      quadrant: "q1",
      priority: "P1",
      status: "in_progress",
      triggerReason: "演示环境下发现售后响应时效偏慢，已开始影响退款与体验。",
      objective: "先清掉超时工单，再识别高频售后原因。",
      impactMetrics: ["售后响应时长", "退款率"],
      estimatedLift: "预计先压住因超时升级带来的退款。",
      roiImpactSummary: "减少售后拖延对利润和复购的侵蚀。",
      confidence: "low",
      riskEnvironment: "after-sales",
      aiContextPayload: {
        diagnosisKey: "refund_health",
        objectType: "order",
      },
      relatedObjects: {
        tickets: [
          { orderNumber: "#1008", ageHours: 31 },
          { orderNumber: "#1012", ageHours: 28 },
        ],
      },
      suggestedActions: ["先处理超 24 小时未响应工单", "按退款原因聚类高频问题"],
      ownerRole: "客服",
      dueWindow: "today",
      dueAt,
      createdAt,
      resolvedAt: null,
    },
  ];
}

function findFallbackOperationTask(taskId: string, now: Date = new Date()): OperationTaskView | null {
  return buildFallbackOperationTasks(now).find((task) => task.id === taskId) ?? null;
}

function applyOperationTaskAction(
  task: OperationTaskView,
  action: OperationTaskAction,
  now: Date = new Date(),
): OperationTaskView {
  const nextStatus = TASK_ACTION_TO_STATUS[action];
  return {
    ...task,
    status: nextStatus,
    resolvedAt:
      action === "done" || action === "ignore"
        ? now.toISOString()
        : action === "reopen"
          ? null
          : task.resolvedAt,
  };
}

type ReportTaskPresentationEffect = "revenue" | "conversion" | "retention" | "efficiency";

type CreateOperationTaskFromReportCandidateInput = {
  title: string;
  taskCandidate: ReportTaskCandidate;
  now?: Date;
};

type CreateOperationTaskFromReportCandidateResult = {
  created: boolean;
  task: OperationTaskView;
};

function inferReportTaskPresentationEffect(
  candidate: ReportTaskCandidate,
): ReportTaskPresentationEffect {
  switch (candidate.problemKey) {
    case "inventory_risk":
    case "growth_focus":
    case "ad_burn":
    case "budget_reallocation":
      return "revenue";
    case "after_sales_risk":
      return "retention";
    case "site_experience":
    case "landing_experience":
    case "conversion_repair":
      return "conversion";
    default:
      return "efficiency";
  }
}

function buildReportTaskSourceKey(problemKey: string): string {
  return `report:${problemKey}`;
}

export async function createOperationTaskFromReportCandidate(
  shop: string,
  input: CreateOperationTaskFromReportCandidateInput,
): Promise<CreateOperationTaskFromReportCandidateResult> {
  const now = input.now ?? new Date();
  const { title, taskCandidate } = input;
  const activeStatuses = ["open", "in_progress"] as const;
  const canReuseRuleTask = RULE_MANAGED_SOURCE_KEYS.includes(taskCandidate.problemKey);

  const existing = await prisma.operationTask.findFirst({
    where: {
      shop,
      status: { in: [...activeStatuses] },
      OR: [
        { dedupeKey: taskCandidate.dedupeKey },
        ...(canReuseRuleTask ? [{ sourceKey: taskCandidate.problemKey }] : []),
      ],
    },
    orderBy: [{ createdAt: "asc" }],
  });
  if (existing) {
    return {
      created: false,
      task: toTaskView(existing),
    };
  }

  const created = await prisma.operationTask.create({
    data: {
      shop,
      snapshotId: null,
      sourceKey: buildReportTaskSourceKey(taskCandidate.problemKey),
      sourceType: taskCandidate.sourceType,
      dedupeKey: taskCandidate.dedupeKey,
      title,
      quadrant: taskCandidate.quadrant,
      priority: taskCandidate.priority,
      status: "open",
      triggerReason: taskCandidate.whyNow,
      objective: taskCandidate.objective,
      impactMetrics: taskCandidate.impactMetrics,
      estimatedLift: taskCandidate.estimatedLift ?? null,
      roiImpactSummary: taskCandidate.roiImpactSummary,
      confidence: taskCandidate.confidence,
      riskEnvironment: taskCandidate.riskEnvironment,
      aiContextPayload: {
        aiExecutionPrompt: taskCandidate.aiExecutionPrompt,
        primaryObjectId: taskCandidate.primaryObjectId ?? null,
        primaryObjectType: taskCandidate.primaryObjectType ?? null,
      },
      relatedObjects: {
        reportTask: {
          origin: "insights_report",
          problemKey: taskCandidate.problemKey,
          sourceType: taskCandidate.sourceType,
          objective: taskCandidate.objective,
          impactMetrics: taskCandidate.impactMetrics,
          estimatedLift: taskCandidate.estimatedLift ?? null,
          roiImpactSummary: taskCandidate.roiImpactSummary,
          riskEnvironment: taskCandidate.riskEnvironment,
          whyNow: taskCandidate.whyNow,
          primaryObjectId: taskCandidate.primaryObjectId ?? null,
          primaryObjectType: taskCandidate.primaryObjectType ?? null,
          confidence: taskCandidate.confidence,
          aiExecutionPrompt: taskCandidate.aiExecutionPrompt,
          effect: inferReportTaskPresentationEffect(taskCandidate),
        },
      },
      suggestedActions: [taskCandidate.action],
      ownerRole: taskCandidate.ownerRole,
      dueWindow: taskCandidate.dueWindow,
      dueAt: dueWindowToDate(taskCandidate.dueWindow, now),
    },
  });

  return {
    created: true,
    task: toTaskView(created),
  };
}

type DiagnosisItemRow = {
  key: string;
  name: string;
  status: string;
  metrics: unknown;
  evidence: unknown;
  reasoning: unknown;
  formulas: unknown;
};

function toItemResult(item: DiagnosisItemRow): DiagnosisItemResult {
  return {
    key: item.key as DiagnosisItemResult["key"],
    name: item.name,
    status: item.status as DiagnosisItemResult["status"],
    metrics: (item.metrics ?? {}) as DiagnosisItemResult["metrics"],
    evidence: Array.isArray(item.evidence) ? (item.evidence as string[]) : [],
    reasoning: Array.isArray(item.reasoning) ? (item.reasoning as string[]) : [],
    formulas: Array.isArray(item.formulas) ? (item.formulas as string[]) : [],
  };
}

const INSIGHT_TASK_SOURCE_KEYS: Record<
  DiagnosisItemResult["key"],
  string[]
> = {
  sales_trend: ["sales_decline"],
  traffic_anomaly: ["traffic_conversion_drop"],
  conversion_health: ["traffic_conversion_drop", "payment_chain_review"],
  product_operations: ["launch_failure_review", "product_incomplete"],
  fulfillment_health: ["fulfillment_overdue", "routine_shipping"],
  logistics_anomaly: ["logistics_stale"],
  refund_health: ["refund_spike", "after_sales_timeout"],
  inventory_health: ["inventory_risk", "inventory_replenish_plan"],
};

const INSIGHT_ENVIRONMENT_KEYS: Record<
  DiagnosisItemResult["key"],
  DailyOperationsEnvironmentKey[]
> = {
  sales_trend: ["conversion"],
  traffic_anomaly: ["conversion"],
  conversion_health: ["conversion"],
  product_operations: ["new-arrivals"],
  fulfillment_health: ["fulfillment"],
  logistics_anomaly: ["fulfillment"],
  refund_health: ["after-sales"],
  inventory_health: ["inventory"],
};

function summarizeInsight(item: DiagnosisItemResult): string {
  return item.reasoning[0] ?? item.evidence[0] ?? item.name;
}

function inferInsightConfidence(item: DiagnosisItemResult): DailyOperationsInsightConfidence {
  if (item.status === "risk" && item.evidence.length >= 2) return "high";
  if (item.reasoning.length > 0 || item.evidence.length > 0) return "medium";
  return "low";
}

function buildOverview(
  metrics: OperationsSummaryMetrics,
  items: DiagnosisItemResult[],
  tasks: OperationTaskView[],
): DailyOperationsOverview {
  return {
    salesAmount7d: metrics.salesAmount7d,
    salesGrowthRate: metrics.salesGrowthRate,
    currency: metrics.currency,
    activeRiskCount: items.filter((item) => item.status === "risk").length,
    watchRiskCount: items.filter((item) => item.status === "watch").length,
    insightCount: items.filter((item) => item.status !== "healthy").length,
    openTaskCount: tasks.filter((task) => task.status === "open").length,
    inProgressTaskCount: tasks.filter((task) => task.status === "in_progress").length,
    doneTaskCount: tasks.filter((task) => task.status === "done").length,
    overdueOrderCount: metrics.overdueOrderCount,
    carrierIssueCount: metrics.carrierIssueCount,
    riskSkuCount: metrics.riskSkuCount,
    refundRate30d: metrics.refundRate30d,
    hasPixelData: metrics.hasPixelData,
    sessions7d: metrics.hasPixelData ? metrics.sessions7d : null,
    conversionRate7d: metrics.hasPixelData ? metrics.conversionRate7d : null,
  };
}

function deriveProductOpsStatus(metrics: OperationsSummaryMetrics): DiagnosisStatus {
  if (metrics.draftProductCount > 5) return "risk";
  const totalIssues =
    metrics.draftProductCount +
    metrics.noImagesProductCount +
    metrics.noDescriptionProductCount;
  if (totalIssues > 0) return "watch";
  return "healthy";
}

function buildProductOpsSummary(
  metrics: OperationsSummaryMetrics,
  products: DiagnosisItemResult | undefined,
): string {
  if (products?.reasoning[0]) return products.reasoning[0];
  if (!metrics.hasProductOpsData) {
    return "待接入上新计划、上架结果和信息完整度后，再判断新品是否在首日出现卡点。";
  }
  const parts: string[] = [];
  if (metrics.draftProductCount > 0) {
    parts.push(`${metrics.draftProductCount} 个商品草稿待上架，建议先复盘上新卡点`);
  }
  if (metrics.noImagesProductCount > 0) {
    parts.push(`${metrics.noImagesProductCount} 个商品缺少图片`);
  }
  if (metrics.noDescriptionProductCount > 0) {
    parts.push(`${metrics.noDescriptionProductCount} 个商品缺少描述`);
  }
  if (parts.length === 0) return "商品信息完整度良好，无待处理项";
  return `${parts.join("；")}，建议优先补齐素材后再观察转化。`;
}

function derivePaymentStatus(metrics: OperationsSummaryMetrics): DiagnosisStatus {
  if (metrics.paymentAttempts7d <= 0 || metrics.paymentSuccessRate7d === null) {
    return "watch";
  }
  if (metrics.paymentSuccessRate7d < PAYMENT_SUCCESS_RISK_PERCENT) return "risk";
  if (metrics.paymentSuccessRate7d < PAYMENT_SUCCESS_WATCH_PERCENT) return "watch";
  return "healthy";
}

function buildPaymentSummary(metrics: OperationsSummaryMetrics): string {
  if (metrics.paymentAttempts7d <= 0) {
    return "近 7 天暂无足够订单，暂无法评估支付链路。";
  }
  const rate = metrics.paymentSuccessRate7d;
  if (rate !== null && rate < PAYMENT_SUCCESS_RISK_PERCENT) {
    return `近 7 天支付成功率仅 ${rate}%（${metrics.paymentSuccessful7d}/${metrics.paymentAttempts7d}），支付链路存在显著障碍，优先排查结账流程。`;
  }
  if (rate !== null && rate < PAYMENT_SUCCESS_WATCH_PERCENT) {
    return `近 7 天支付成功率 ${rate}%，略低于预期，需关注支付流程与失败订单。`;
  }
  if (metrics.paymentFailureCount7d > 0) {
    return `近 7 天支付成功率 ${rate ?? "—"}%，仍有 ${metrics.paymentFailureCount7d} 笔未成功支付需跟进。`;
  }
  return `近 7 天支付成功率 ${rate ?? "—"}%，支付链路运行正常。`;
}

function buildEnvironments(
  metrics: OperationsSummaryMetrics,
  items: DiagnosisItemResult[],
): DailyOperationsEnvironment[] {
  const findItem = (key: DiagnosisItemResult["key"]) =>
    items.find((item) => item.key === key);
  const inventory = findItem("inventory_health");
  const logistics = findItem("logistics_anomaly");
  const fulfillment = findItem("fulfillment_health");
  const refund = findItem("refund_health");
  const conversion = findItem("conversion_health");
  const traffic = findItem("traffic_anomaly");
  const products = findItem("product_operations");
  const hasProductOps = Boolean(products) || metrics.hasProductOpsData;
  const hasPaymentData = metrics.paymentAttempts7d > 0;

  const fulfillmentStatus: DiagnosisItemResult["status"] =
    fulfillment?.status === "risk" || logistics?.status === "risk"
      ? "risk"
      : fulfillment?.status === "watch" || logistics?.status === "watch"
        ? "watch"
        : "healthy";

  return [
    {
      key: "new-arrivals",
      titleKey: "healthMonitor.environmentNewArrivals",
      status: products?.status ?? deriveProductOpsStatus(metrics),
      source: hasProductOps ? "real" : "pending",
      summary: buildProductOpsSummary(metrics, products),
      metrics: hasProductOps
        ? {
            draftProductCount: metrics.draftProductCount,
            noImagesProductCount: metrics.noImagesProductCount,
            noDescriptionProductCount: metrics.noDescriptionProductCount,
          }
        : {},
    },
    {
      key: "inventory",
      titleKey: "healthMonitor.environmentInventory",
      status: inventory?.status ?? "watch",
      source: "real",
      summary: inventory?.reasoning[0] ?? "优先确认高动销 SKU 的可售天数与补货节奏。",
      metrics: {
        riskSkuCount: metrics.riskSkuCount,
        estimatedInventoryLoss: metrics.estimatedInventoryLoss,
        currency: metrics.currency,
      },
    },
    {
      key: "fulfillment",
      titleKey: "healthMonitor.environmentFulfillment",
      status: fulfillmentStatus,
      source: "real",
      summary:
        logistics?.reasoning[0] ??
        fulfillment?.reasoning[0] ??
        "履约与物流问题会先影响客户体验，再推高退款与客服压力。",
      metrics: {
        overdueOrderCount: metrics.overdueOrderCount,
        carrierIssueCount: metrics.carrierIssueCount,
        fulfillmentRate30d: metrics.fulfillmentRate30d,
      },
    },
    {
      key: "payments",
      titleKey: "healthMonitor.environmentPayments",
      status: derivePaymentStatus(metrics),
      source: hasPaymentData ? "real" : "pending",
      summary: hasPaymentData
        ? buildPaymentSummary(metrics)
        : "近 7 天暂无足够订单，暂无法评估支付链路。",
      metrics: hasPaymentData
        ? {
            paymentSuccessRate7d: metrics.paymentSuccessRate7d,
            paymentAttempts7d: metrics.paymentAttempts7d,
            paymentSuccessful7d: metrics.paymentSuccessful7d,
            paymentFailureCount7d: metrics.paymentFailureCount7d,
          }
        : {},
    },
    {
      key: "after-sales",
      titleKey: "healthMonitor.environmentAfterSales",
      status: refund?.status ?? "watch",
      source: "real",
      summary: refund?.reasoning[0] ?? "售后、商品质量和履约问题会共同推高退款率。",
      metrics: {
        refundRate30d: metrics.refundRate30d,
        refundRateDelta: metrics.refundRateDelta,
      },
    },
    {
      key: "conversion",
      titleKey: "healthMonitor.environmentConversion",
      status: conversion?.status ?? traffic?.status ?? "watch",
      source: metrics.hasPixelData ? "real" : "pending",
      summary:
        conversion?.reasoning[0] ??
        traffic?.reasoning[0] ??
        (metrics.hasPixelData
          ? "优先区分站内转化问题还是流量问题，再决定后续动作。"
          : "待接入 Pixel 后再持续监控流量与转化漏斗。"),
      metrics: {
        conversionRate7d: metrics.conversionRate7d,
        trafficChangeRate: metrics.trafficChangeRate,
        hasPixelData: metrics.hasPixelData ? 1 : 0,
      },
    },
  ];
}

function buildInsights(
  items: DiagnosisItemResult[],
  tasks: OperationTaskView[],
): DailyOperationsInsight[] {
  return items
    .filter((item) => item.status !== "healthy")
    .map((item) => {
      const relatedTaskSourceKeys = INSIGHT_TASK_SOURCE_KEYS[item.key] ?? [];
      const taskCount = tasks.filter((task) =>
        relatedTaskSourceKeys.includes(task.sourceKey),
      ).length;
      return {
        key: item.key,
        diagnosisKey: item.key,
        title: item.name,
        status: item.status,
        summary: summarizeInsight(item),
        confidence: inferInsightConfidence(item),
        evidence: item.evidence.slice(0, 2),
        reasoning: item.reasoning.slice(0, 2),
        taskCount,
        relatedTaskSourceKeys,
        environmentKeys: INSIGHT_ENVIRONMENT_KEYS[item.key] ?? [],
      };
    })
    .slice(0, 6);
}

/** 复盘对比的指标口径（数值越小越好 / 越大越好）。 */
const REVIEW_METRICS: Array<{
  key: keyof OperationsSummaryMetrics;
  label: string;
  lowerIsBetter: boolean;
}> = [
  { key: "overdueOrderCount", label: "超时未发货订单", lowerIsBetter: true },
  { key: "carrierIssueCount", label: "物流异常单", lowerIsBetter: true },
  { key: "refundRate30d", label: "30 天退款率(%)", lowerIsBetter: true },
  { key: "riskSkuCount", label: "高风险库存 SKU", lowerIsBetter: true },
  { key: "salesAmount7d", label: "近 7 天销售额", lowerIsBetter: false },
  { key: "sessions7d", label: "近 7 天会话数", lowerIsBetter: false },
];

async function buildReview(
  shop: string,
  todayMetrics: OperationsSummaryMetrics,
  now: Date,
  timeZone: string = DEFAULT_SNAPSHOT_TIMEZONE,
): Promise<DailyReview | null> {
  const todayKey = toDateKey(now, timeZone);
  const previous = await prisma.operationDiagnosisSnapshot.findFirst({
    where: { shop, snapshotDate: { lt: todayKey }, hasData: true },
    orderBy: { snapshotDate: "desc" },
  });
  if (!previous) return null;
  const prevMetrics = previous.metrics as Record<string, number | string | null>;

  const deltas: DailyReviewDelta[] = [];
  for (const spec of REVIEW_METRICS) {
    const prevValue = Number(prevMetrics[spec.key] ?? 0);
    const currentValue = Number(todayMetrics[spec.key] ?? 0);
    if (!Number.isFinite(prevValue) || !Number.isFinite(currentValue)) continue;
    deltas.push({
      key: spec.key,
      label: spec.label,
      previous: prevValue,
      current: currentValue,
      improved:
        currentValue === prevValue
          ? null
          : spec.lowerIsBetter
            ? currentValue < prevValue
            : currentValue > prevValue,
    });
  }

  const previousDayStart = new Date(`${previous.snapshotDate}T00:00:00.000Z`);
  const resolvedTaskCount = await prisma.operationTask.count({
    where: {
      shop,
      status: { in: ["done", "auto_closed"] },
      resolvedAt: { gte: previousDayStart },
    },
  });

  return { previousDate: previous.snapshotDate, deltas, resolvedTaskCount };
}

/**
 * 将规则评估结果同步到 OperationTask 表：
 * - 已存在同 dedupeKey 的 open/in_progress 任务 → 刷新内容（保留状态与创建时间）
 * - 近 7 天被用户忽略过的同类任务 → 跳过，不重复打扰
 * - 条件已消失的 open 任务 → 自动关闭（auto_closed）
 */
async function syncTasks(
  shop: string,
  snapshotId: string,
  generated: ReturnType<typeof evaluateDiagnosisRules>,
  now: Date,
): Promise<void> {
  const ruleManagedSourceKeys = new Set(RULE_MANAGED_SOURCE_KEYS);
  const generatedKeys = new Set(generated.map((t) => t.dedupeKey));
  const activeTasks = await prisma.operationTask.findMany({
    where: { shop, status: { in: ["open", "in_progress"] } },
  });
  const activeByDedupe = new Map(activeTasks.map((t) => [t.dedupeKey, t]));

  const ignoredSince = new Date(
    now.getTime() - IGNORED_SUPPRESS_DAYS * 24 * 60 * 60 * 1000,
  );
  const recentlyIgnored = await prisma.operationTask.findMany({
    where: { shop, status: "ignored", updatedAt: { gte: ignoredSince } },
    select: { dedupeKey: true },
  });
  const ignoredKeys = new Set(recentlyIgnored.map((t) => t.dedupeKey));

  for (const task of generated) {
    const existing = activeByDedupe.get(task.dedupeKey);
    if (existing) {
      await prisma.operationTask.update({
        where: { id: existing.id },
        data: {
          snapshotId,
          title: task.title,
          quadrant: task.quadrant,
          priority: task.priority,
          triggerReason: task.triggerReason,
          sourceType: task.sourceType,
          objective: task.objective,
          impactMetrics: task.impactMetrics,
          estimatedLift: task.estimatedLift,
          roiImpactSummary: task.roiImpactSummary,
          confidence: task.confidence,
          riskEnvironment: task.riskEnvironment,
          aiContextPayload: task.aiContextPayload as object | null,
          relatedObjects: task.relatedObjects as object,
          suggestedActions: task.suggestedActions,
          ownerRole: task.ownerRole,
          dueWindow: task.dueWindow,
        },
      });
      continue;
    }
    if (ignoredKeys.has(task.dedupeKey)) continue;
    await prisma.operationTask.create({
      data: {
        shop,
        snapshotId,
        sourceKey: task.sourceKey,
        sourceType: task.sourceType,
        dedupeKey: task.dedupeKey,
        title: task.title,
        quadrant: task.quadrant,
        priority: task.priority,
        status: "open",
        triggerReason: task.triggerReason,
        objective: task.objective,
        impactMetrics: task.impactMetrics,
        estimatedLift: task.estimatedLift,
        roiImpactSummary: task.roiImpactSummary,
        confidence: task.confidence,
        riskEnvironment: task.riskEnvironment,
        aiContextPayload: task.aiContextPayload as object | null,
        relatedObjects: task.relatedObjects as object,
        suggestedActions: task.suggestedActions,
        ownerRole: task.ownerRole,
        dueWindow: task.dueWindow,
        dueAt: dueWindowToDate(task.dueWindow, now),
      },
    });
  }

  // 条件已消失或长期未处理的任务自动关闭
  const staleBefore = new Date(
    now.getTime() - STALE_TASK_AUTO_CLOSE_DAYS * 24 * 60 * 60 * 1000,
  );
  for (const task of activeTasks) {
    if (!ruleManagedSourceKeys.has(task.sourceKey)) continue;
    const conditionGone = !generatedKeys.has(task.dedupeKey);
    const tooOld = task.createdAt < staleBefore;
    if (conditionGone || (tooOld && task.status === "open")) {
      await prisma.operationTask.update({
        where: { id: task.id },
        data: { status: "auto_closed", resolvedAt: now },
      });
    }
  }
}

type EnsureDailySnapshotOptions = {
  force?: boolean;
  now?: Date;
  shopifyAdmin?: ShopifyAdminGraphqlClient;
  timeZone?: string;
};

type SnapshotRow = {
  snapshotDate: string;
  generatedAt: Date;
  hasData: boolean;
  metrics: unknown;
  items: DiagnosisItemRow[];
};

/** 用已持久化的快照拼出概览结果，只额外读任务列表与环比，不重算诊断。 */
async function buildOverviewFromSnapshot(
  shop: string,
  existing: SnapshotRow,
  now: Date,
  timeZone: string,
): Promise<DailyOperationsOverviewResult> {
  const metrics = existing.metrics as OperationsSummaryMetrics;
  const items = existing.items.map(toItemResult);
  const [tasks, review] = await Promise.all([
    listOperationTasks(shop),
    buildReview(shop, metrics, now, timeZone),
  ]);
  return {
    shop,
    snapshotDate: existing.snapshotDate,
    generatedAt: existing.generatedAt.toISOString(),
    hasData: existing.hasData,
    metrics,
    overview: buildOverview(metrics, items, tasks),
    environments: buildEnvironments(metrics, items),
    insights: buildInsights(items, tasks),
    items,
    tasks,
    review,
  };
}

/**
 * 概览入口：命中当日快照时直接复用持久化指标，不重算诊断明细。
 * 未命中（或 force）时退回 `ensureDailySnapshot` 建快照。
 */
export async function ensureDailySnapshotOverview(
  shop: string,
  options?: EnsureDailySnapshotOptions,
): Promise<DailyOperationsOverviewResult> {
  if (!options?.force) {
    const now = options?.now ?? new Date();
    const timeZone = options?.timeZone ?? DEFAULT_SNAPSHOT_TIMEZONE;
    const existing = await prisma.operationDiagnosisSnapshot.findUnique({
      where: {
        shop_snapshotDate: { shop, snapshotDate: toDateKey(now, timeZone) },
      },
      include: { items: true },
    });
    if (existing) {
      return buildOverviewFromSnapshot(shop, existing, now, timeZone);
    }
  }
  return ensureDailySnapshot(shop, options);
}

/**
 * 确保当日快照存在并返回完整结果（含 detail）的懒巡检入口。
 * 即使命中快照也必须重算一次诊断来取 detail，只读概览时请用
 * `ensureDailySnapshotOverview`。force=true 时重算当日快照（用于手动刷新）。
 */
export async function ensureDailySnapshot(
  shop: string,
  options?: EnsureDailySnapshotOptions,
): Promise<DailyOperationsResult> {
  const now = options?.now ?? new Date();
  const timeZone = options?.timeZone ?? DEFAULT_SNAPSHOT_TIMEZONE;
  const dateKey = toDateKey(now, timeZone);

  const existing = await prisma.operationDiagnosisSnapshot.findUnique({
    where: { shop_snapshotDate: { shop, snapshotDate: dateKey } },
    include: { items: true },
  });

  if (existing && !options?.force) {
    const [base, diagnosis] = await Promise.all([
      buildOverviewFromSnapshot(shop, existing, now, timeZone),
      computeOperationsDiagnosis(shop, now, {
        shopifyAdmin: options?.shopifyAdmin,
      }),
    ]);
    return { ...base, detail: diagnosis.detail };
  }

  const diagnosis = await computeOperationsDiagnosis(shop, now, {
    shopifyAdmin: options?.shopifyAdmin,
  });

  if (existing) {
    // force 重算：级联删除旧诊断项，任务保留（snapshotId 置空后重新挂接）
    await prisma.operationDiagnosisSnapshot.delete({ where: { id: existing.id } });
  }

  const snapshot = await prisma.operationDiagnosisSnapshot.create({
    data: {
      shop,
      snapshotDate: dateKey,
      hasData: diagnosis.hasData,
      metrics: diagnosis.summaryMetrics,
      items: {
        create: diagnosis.items.map((item) => ({
          shop,
          key: item.key,
          name: item.name,
          status: item.status,
          metrics: item.metrics,
          evidence: item.evidence,
          reasoning: item.reasoning,
          formulas: item.formulas,
        })),
      },
    },
  });

  const generated = evaluateDiagnosisRules(diagnosis);
  await syncTasks(shop, snapshot.id, generated, now);

  const [tasks, review] = await Promise.all([
    listOperationTasks(shop),
    buildReview(shop, diagnosis.summaryMetrics, now, timeZone),
  ]);

  return {
    shop,
    snapshotDate: dateKey,
    generatedAt: now.toISOString(),
    hasData: diagnosis.hasData,
    metrics: diagnosis.summaryMetrics,
    overview: buildOverview(diagnosis.summaryMetrics, diagnosis.items, tasks),
    detail: diagnosis.detail,
    environments: buildEnvironments(diagnosis.summaryMetrics, diagnosis.items),
    insights: buildInsights(diagnosis.items, tasks),
    items: diagnosis.items,
    tasks,
    review,
  };
}

/** 当前任务列表：进行中的全部 + 近 3 天已关闭的（供页面展示处理痕迹）。 */
export async function listOperationTasks(
  shop: string,
  now: Date = new Date(),
): Promise<OperationTaskView[]> {
  try {
    const recentClosedSince = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const tasks = await prisma.operationTask.findMany({
      where: {
        shop,
        OR: [
          { status: { in: ["open", "in_progress"] } },
          {
            status: { in: ["done", "ignored", "auto_closed"] },
            updatedAt: { gte: recentClosedSince },
          },
        ],
      },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    });
    return tasks.map(toTaskView);
  } catch (error) {
    console.error("[daily-inspection] Failed to list operation tasks, falling back to demo tasks.", {
      shop,
      error,
    });
    return buildFallbackOperationTasks(now);
  }
}

export type OperationTaskAction = "start" | "done" | "ignore" | "reopen";

const TASK_ACTION_TO_STATUS: Record<OperationTaskAction, string> = {
  start: "in_progress",
  done: "done",
  ignore: "ignored",
  reopen: "open",
};

/** 页面任务操作入口（带店铺归属校验）。 */
export async function updateOperationTaskStatus(
  shop: string,
  taskId: string,
  action: OperationTaskAction,
): Promise<OperationTaskView | null> {
  const fallbackTask = findFallbackOperationTask(taskId);
  if (fallbackTask) {
    return applyOperationTaskAction(fallbackTask, action);
  }

  const task = await prisma.operationTask.findUnique({ where: { id: taskId } });
  if (!task || task.shop !== shop) return null;
  const status = TASK_ACTION_TO_STATUS[action];
  const updated = await prisma.operationTask.update({
    where: { id: taskId },
    data: {
      status,
      resolvedAt:
        action === "done" || action === "ignore"
          ? new Date()
          : action === "reopen"
            ? null
            : task.resolvedAt,
    },
  });
  return toTaskView(updated);
}
