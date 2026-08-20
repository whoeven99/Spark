/**
 * Client-safe business report snapshot types + view builders.
 * Keep Node/Shopify/Prisma IO in businessReportSnapshot.server.ts.
 */

import type { PageSpeedReport } from "../../lib/pageSpeedTypes";
import type { AdsInsightsPlatform } from "../adsInsights/types.server";
import type { ChannelRoiResult } from "./channelRoi.server";
import type { CustomerValueAggregates } from "./customerValue.server";
import type { OperationTaskView } from "./dailyInspection.server";
import type { OperationsDiagnosis } from "./diagnosis.server";

export type PeriodKey = "7d" | "30d";
export type ModuleSource = "real" | "estimated" | "pending";
export type ChartKind = "bars" | "stack" | "funnel" | "table";
export type ModuleFilterKey = "all" | string;

export type ModuleMetric = {
  label: string;
  value: string;
  delta?: string;
};

export type ChartItem = {
  label: string;
  value: number;
  display: string;
  note?: string;
};

export type ModuleChart = {
  title: string;
  kind: ChartKind;
  items: ChartItem[];
};

export type BusinessModule = {
  key: string;
  title: string;
  subtitle: string;
  source: ModuleSource;
  summary: string;
  metrics: ModuleMetric[];
  chart: ModuleChart;
  signals: string[];
  actionHint: string;
};

export type NarrativeCard = {
  title: string;
  body: string;
};

export type ReportCardTone = "positive" | "warning" | "negative" | "neutral";

export type ReportSummaryCard = {
  label: string;
  value: string;
  detail: string;
  tone: ReportCardTone;
};

export type InsightItemTone = "critical" | "warning" | "info";

export type InsightListItem = {
  title: string;
  confidence: "高" | "中" | "低";
  metric: string;
  detail: string;
  tone: InsightItemTone;
  targetKey?: string;
  href?: string;
};

export type DrilldownEntry = {
  key: string;
  title: string;
  detail: string;
  badge: string;
  href: string;
};

export type ReportRoiLayerCard = {
  key: "short_term" | "payback" | "lifetime";
  title: string;
  value: string;
  detail: string;
  dataQuality: "realized" | "estimated" | "predicted";
  confidence: "high" | "medium" | "low";
  tone: ReportCardTone;
};

export type FactorDiagnosisCard = {
  key: string;
  title: string;
  statusLabel: string;
  roiLayerLabel: string;
  summary: string;
  evidence: string[];
  comparison: string;
  impactPath: string;
  action: string;
  source: ModuleSource;
  tone: ReportCardTone;
  href?: string;
};

export type ReportTaskPriority = "P0" | "P1" | "P2";
export type ReportTaskQuadrant = "q1" | "q2" | "q3" | "q4";
export type ReportTaskDueWindow = "today" | "48h" | "this_week" | "backlog";
export type ReportTaskSourceType = "rule" | "hybrid";
export type ReportTaskConfidence = "high" | "medium" | "low";

export type ReportTaskCandidate = {
  problemKey: string;
  sourceType: ReportTaskSourceType;
  priority: ReportTaskPriority;
  quadrant: ReportTaskQuadrant;
  dueWindow: ReportTaskDueWindow;
  ownerRole: string;
  objective: string;
  impactMetrics: string[];
  estimatedLift?: string;
  confidence: ReportTaskConfidence;
  riskEnvironment: string;
  whyNow: string;
  roiImpactSummary: string;
  action: string;
  dedupeKey: string;
  primaryObjectId?: string;
  primaryObjectType?: string;
  aiExecutionPrompt: string;
};

type ReportTaskCandidateSeed = Omit<
  ReportTaskCandidate,
  "action" | "dedupeKey" | "aiExecutionPrompt"
>;

export type ReportTaskCandidatePipeline = {
  ruleCandidates: ReportTaskCandidate[];
  aiCandidates: ReportTaskCandidate[];
  mergedCandidates: ReportTaskCandidate[];
  dedupedCount: number;
};

export type ReportBenchmarkKind = "historical" | "structural" | "threshold" | "mixed";

export type ReportFactorGenerationTrace = {
  moduleKey: string;
  moduleTitle: string;
  roiLayerLabel: string;
  source: ModuleSource;
  sourceInputs: string[];
  derivedMetrics: ModuleMetric[];
  benchmark: {
    kind: ReportBenchmarkKind;
    summary: string;
  };
  classification: {
    statusLabel: string;
    tone: ReportCardTone;
    insightTitle?: string;
  };
  mappedActionKeys: string[];
  impactPath: string;
};

export type ReportActionGenerationTrace = {
  actionKey: string;
  title: string;
  roiLayerLabel: string;
  tone: ReportCardTone;
  targetModuleKeys: string[];
  sourceType: ReportTaskSourceType | null;
  problemKey?: string;
  dedupeKey?: string;
  whyNow: string;
  impactMetrics: string[];
};

export type SnapshotReportGenerationTrace = {
  factors: ReportFactorGenerationTrace[];
  actions: ReportActionGenerationTrace[];
};

export type ReportRecommendedAction = {
  key: string;
  title: string;
  roiLayerLabel: string;
  summary: string;
  action: string;
  tone: ReportCardTone;
  targetModuleKeys?: string[];
  taskCandidate?: ReportTaskCandidate;
  href?: string;
};

export type SnapshotReport = {
  summary: string;
  cards: ReportSummaryCard[];
  roiLayers: ReportRoiLayerCard[];
  factorCards: FactorDiagnosisCard[];
  insights: InsightListItem[];
  drilldowns: DrilldownEntry[];
  focus: string[];
  actions: ReportRecommendedAction[];
  taskPipeline: ReportTaskCandidatePipeline;
  generationTrace: SnapshotReportGenerationTrace;
  narratives: NarrativeCard[];
  charts: ModuleChart[];
};

export type Snapshot = {
  summary: string;
  metricAccent: string;
  topMetrics: Array<{ label: string; value: string; unit?: string }>;
  coverage: Array<{ label: string; value: string; source: ModuleSource }>;
  highlights: string[];
  nextSteps: string[];
  modules: BusinessModule[];
  report: SnapshotReport;
};

export type LiveSnapshotData = {
  shop: string;
  generatedAt: string;
  costConfigured: boolean;
  operationTasks: OperationTaskView[];
  diagnosis: OperationsDiagnosis | null;
  customerAggregates: CustomerValueAggregates | null;
  channelRoi: ChannelRoiResult | null;
  ads: {
    rangeDays: 7 | 14 | 30;
    totalSpend: number;
    totalClicks: number;
    totalImpressions: number;
    totalConversions: number;
    totalConversionsValue: number;
    totalRoas: number | null;
    currencyCode: string | null;
    platformSummaries: Array<{
      platform: AdsInsightsPlatform;
      accountName: string | null;
      currencyCode: string | null;
      spend: number;
      clicks: number;
      impressions: number;
      conversions: number;
      conversionsValue: number;
      roas: number | null;
      campaignCount: number;
    }>;
  } | null;
  ga4: {
    connected: boolean;
    propertyCount: number;
    startDate: string | null;
    endDate: string | null;
    summary: {
      totalUsers: number;
      totalSessions: number;
      totalPageViews: number;
      totalRevenue: number;
      totalPurchases: number;
    } | null;
    timeSeries: Array<{
      key: string;
      users: number;
      sessions: number;
      pageViews: number;
      revenue: number;
      purchases: number;
      engagementRate: number;
      bounceRate: number;
      averageSessionDuration: number;
      itemsViewed: number;
      itemsAddedToCart: number;
    }>;
    channelRows: Array<{
      key: string;
      users: number;
      sessions: number;
      pageViews: number;
      revenue: number;
      purchases: number;
    }>;
    landingRows: Array<{
      key: string;
      users: number;
      sessions: number;
      pageViews: number;
      revenue: number;
      purchases: number;
    }>;
    error: string | null;
  } | null;
  pageSpeed: {
    url: string | null;
    strategy: "mobile";
    report: PageSpeedReport | null;
    error: string | null;
  } | null;
  shopifyReports: {
    access: "ok" | "missing_scope" | "access_denied";
    currencyCode: string | null;
    salesTrend: Array<{
      date: string;
      sales: number;
      orders: number;
    }>;
    refundTrend: Array<{
      date: string;
      returnedQuantity: number;
    }>;
    fulfillmentTrend: Array<{
      date: string;
      fulfilled: number;
      shipped: number;
    }>;
    storefrontFunnel: {
      sessions: number;
      cartAdditions: number;
      reachedCheckout: number;
      completedCheckout: number;
    } | null;
  } | null;
};

export const periodItems: Array<{ key: PeriodKey; label: string }> = [
  { key: "7d", label: "近 7 天" },
  { key: "30d", label: "近 30 天" },
];

const mockReport7d: SnapshotReport = {
  summary: "日报先回答三个问题：ROI 是否健康、卡在哪个环节、今天先做什么。",
  cards: [
    { label: "经营 ROI", value: "待接入", detail: "广告成本映射后展示真实 ROI", tone: "neutral" },
    { label: "当前卡点", value: "站内转化", detail: "先用漏斗定位掉点位置", tone: "warning" },
    { label: "数据可信度", value: "逐步补齐", detail: "优先接真实利润、渠道和流量来源", tone: "neutral" },
  ],
  roiLayers: [
    {
      key: "short_term",
      title: "短期 ROI",
      value: "待接成本",
      detail: "广告成本映射后展示真实经营 ROI。",
      dataQuality: "estimated",
      confidence: "low",
      tone: "neutral",
    },
    {
      key: "payback",
      title: "回收速度",
      value: "Normal",
      detail: "先用转化漏斗和站点体验判断回收快慢。",
      dataQuality: "estimated",
      confidence: "medium",
      tone: "warning",
    },
    {
      key: "lifetime",
      title: "长期价值",
      value: "Medium",
      detail: "客户价值层就绪后再稳定输出长期判断。",
      dataQuality: "predicted",
      confidence: "low",
      tone: "neutral",
    },
  ],
  factorCards: [
    {
      key: "conversion",
      title: getFactorTitle("conversion"),
      statusLabel: "Watch",
      roiLayerLabel: "回收速度",
      summary: "当前最值得先盯的是站内转化链路。",
      evidence: ["整体 CVR 2.46%", "支付成功率 91.2%"],
      comparison: "较上期 CVR 下滑 0.3pp",
      impactPath: "流量进入 -> 商品页承接 -> 支付成功 -> 回收速度",
      action: "先查漏斗掉点和核心 landing page。",
      source: "real",
      tone: "warning",
      href: buildInsightsChartsHref({ group: "conversion", card: "funnel" }),
    },
    {
      key: "afterSales",
      title: getFactorTitle("afterSales"),
      statusLabel: "Risk",
      roiLayerLabel: "短期 ROI",
      summary: "退款和物流异常已经开始侵蚀利润。",
      evidence: ["退款率 4.8%", "物流异常 18 单"],
      comparison: "退款率较上期 +1.1pp",
      impactPath: "退款损耗 -> 贡献利润下降 -> 短期 ROI 受压",
      action: "优先排查高退款 SKU 和履约链路。",
      source: "real",
      tone: "negative",
      href: buildInsightsChartsHref({
        group: "merchandising_ops",
        card: "fulfillment_refund",
      }),
    },
    {
      key: "channel",
      title: getFactorTitle("channel"),
      statusLabel: "Healthy",
      roiLayerLabel: "长期价值",
      summary: "渠道利润差异已经拉开，可开始围绕高质量渠道放大。",
      evidence: ["最高利润渠道 Google", "高价值客户占比 17%"],
      comparison: "结构对比优先看高利润渠道 vs 全站",
      impactPath: "获客渠道质量 -> 客户价值层 -> 长期 ROI",
      action: "优先看最赚钱渠道和值得扩量的客群。",
      source: "estimated",
      tone: "positive",
      href: buildInsightsChartsHref({ group: "roi", card: "channel_roi" }),
    },
  ],
  insights: [
    {
      title: "转化下滑主要卡在站内",
      confidence: "中",
      metric: "整体转化率 / 支付成功率",
      detail: "先看漏斗掉点和核心 landing page。",
      tone: "warning",
      targetKey: "conversion",
      href: buildInsightsChartsHref({ group: "conversion", card: "funnel" }),
    },
    {
      title: "退款已开始侵蚀利润",
      confidence: "高",
      metric: "退款率 / 退款 SKU",
      detail: "优先排查高退款 SKU 和履约链路。",
      tone: "critical",
      targetKey: "afterSales",
      href: buildInsightsChartsHref({
        group: "merchandising_ops",
        card: "fulfillment_refund",
      }),
    },
    {
      title: "渠道利润差异已经拉开",
      confidence: "中",
      metric: "渠道收入 / 渠道利润",
      detail: "优先看最赚钱渠道和值得扩量的客群。",
      tone: "info",
      targetKey: "channel",
      href: buildInsightsChartsHref({ group: "roi", card: "channel_roi" }),
    },
  ],
  drilldowns: [
    { key: "refund", title: "退款详情", detail: "看异常退款订单、退款 SKU 和原因聚类", badge: "高优先", href: buildInsightsChartsHref({ group: "merchandising_ops", card: "fulfillment_refund" }) },
    { key: "inventory", title: "库存详情", detail: "看风险 SKU、可售天数和预计损失", badge: "对象深钻", href: buildInsightsChartsHref({ group: "merchandising_ops", card: "inventory_flow" }) },
    { key: "conversion", title: "流量/转化详情", detail: "看漏斗掉点、landing page 和渠道来源", badge: "定位卡点", href: buildInsightsChartsHref({ group: "conversion", card: "funnel" }) },
    { key: "channel", title: "渠道 ROI", detail: "看收入、利润和值得继续投的渠道", badge: "经营复盘", href: buildInsightsChartsHref({ group: "roi", card: "channel_roi" }) },
  ],
  focus: [
    "先用利润、退款和库存把经营结果层看清。",
    "再把流量与渠道补到同一套口径。",
    "最后再让 AI 基于模块摘要生成报告。",
  ],
  actions: [
    {
      key: "conversion_mock",
      title: "先修站内转化链路",
      roiLayerLabel: "回收速度",
      summary: "当前判断先不要继续堆流量，先把站内漏斗掉点找出来。",
      action: "优先检查核心 landing page、支付成功率和主要漏斗流失点。",
      tone: "warning",
      targetModuleKeys: ["conversion"],
      taskCandidate: {
        problemKey: "conversion_repair",
        sourceType: "rule",
        priority: "P1",
        quadrant: "q1",
        dueWindow: "48h",
        ownerRole: "运营/站点",
        primaryObjectId: "conversion_funnel",
        primaryObjectType: "flow",
        objective: "先拆清站内漏斗卡点，再决定是修 landing page、支付还是流量匹配问题。",
        impactMetrics: ["会话转化率", "支付成功率", "Landing Page 承接"],
        estimatedLift: "预计带动关键漏斗指标改善 3%~8%。",
        confidence: "medium",
        riskEnvironment: "站内转化",
        whyNow: "当前转化漏斗还在掉量，继续加流量只会放大低转化问题。",
        roiImpactSummary: "先修漏斗承接和支付链路，避免回收速度继续变慢。",
        action: "优先检查核心 landing page、支付成功率和主要漏斗流失点。",
        dedupeKey: "conversion_repair:conversion_funnel:会话转化率:48h",
        aiExecutionPrompt: "请围绕「先拆清站内漏斗卡点，再决定是修 landing page、支付还是流量匹配问题。」执行。优先关注 会话转化率 / 支付成功率 / Landing Page 承接。建议动作：优先检查核心 landing page、支付成功率和主要漏斗流失点。",
      },
      href: buildInsightsChartsHref({ group: "conversion", card: "funnel" }),
    },
    {
      key: "aftersales_mock",
      title: "先止住退款与履约损耗",
      roiLayerLabel: "短期 ROI",
      summary: "退款和物流异常已经开始直接侵蚀利润。",
      action: "优先排查高退款 SKU、异常订单和履约链路。",
      tone: "negative",
      targetModuleKeys: ["afterSales"],
      taskCandidate: {
        problemKey: "after_sales_risk",
        sourceType: "rule",
        priority: "P0",
        quadrant: "q1",
        dueWindow: "today",
        ownerRole: "运营/售后",
        primaryObjectId: "refund_fulfillment",
        primaryObjectType: "risk_cluster",
        objective: "优先复盘退款与履约异常，修正商品、物流或售后策略。",
        impactMetrics: ["退款率", "物流异常率", "复购率"],
        estimatedLift: "若根因处理到位，预计 1~2 周内退款风险下降 5%~10%。",
        confidence: "high",
        riskEnvironment: "售后与履约",
        whyNow: "退款和物流异常已经进入利润层，放着不处理会继续侵蚀短期结果。",
        roiImpactSummary: "先止住售后与履约损耗，直接保护短期 ROI。",
        action: "优先排查高退款 SKU、异常订单和履约链路。",
        dedupeKey: "after_sales_risk:refund_fulfillment:退款率:today",
        aiExecutionPrompt: "请围绕「优先复盘退款与履约异常，修正商品、物流或售后策略。」执行。优先关注 退款率 / 物流异常率 / 复购率。建议动作：优先排查高退款 SKU、异常订单和履约链路。",
      },
      href: buildInsightsChartsHref({
        group: "merchandising_ops",
        card: "fulfillment_refund",
      }),
    },
    {
      key: "channel_mock",
      title: "放大高质量渠道与客群",
      roiLayerLabel: "长期价值",
      summary: "渠道利润和高价值客户差异已经拉开，可以开始做结构性放大。",
      action: "先看最赚钱渠道、复购客群和值得继续扩量的对象。",
      tone: "positive",
      targetModuleKeys: ["channel", "customerValue"],
      taskCandidate: {
        problemKey: "growth_focus",
        sourceType: "hybrid",
        priority: "P1",
        quadrant: "q3",
        dueWindow: "this_week",
        ownerRole: "运营/投放",
        primaryObjectId: "high_value_channels",
        primaryObjectType: "channel_cluster",
        objective: "围绕高价值渠道与客群做结构性放大，而不是继续平均分配预算。",
        impactMetrics: ["渠道利润", "高价值客户占比", "复购率"],
        estimatedLift: "预计改善更稳的预算回收，并放大长期价值贡献。",
        confidence: "medium",
        riskEnvironment: "客户价值增长",
        whyNow: "渠道利润结构已经拉开差距，当前已经能看出哪些对象值得继续放大。",
        roiImpactSummary: "把预算和经营动作聚焦到高价值对象，更容易放大长期 ROI。",
        action: "先看最赚钱渠道、复购客群和值得继续扩量的对象。",
        dedupeKey: "growth_focus:high_value_channels:渠道利润:this_week",
        aiExecutionPrompt: "请围绕「围绕高价值渠道与客群做结构性放大，而不是继续平均分配预算。」执行。优先关注 渠道利润 / 高价值客户占比 / 复购率。建议动作：先看最赚钱渠道、复购客群和值得继续扩量的对象。",
      },
      href: buildInsightsChartsHref({ group: "roi", card: "channel_roi" }),
    },
  ],
  taskPipeline: {
    ruleCandidates: [],
    aiCandidates: [],
    mergedCandidates: [],
    dedupedCount: 0,
  },
  generationTrace: {
    factors: [],
    actions: [],
  },
  narratives: [
    { title: "风险", body: "当前最大的风险不是没数据，而是数据还没被整理成可执行的经营阅读顺序。" },
    { title: "机会", body: "利润、售后、客户价值和渠道层已经具备接真实数据的基础，可以先形成一版日报。" },
    { title: "建议动作", body: "先做 ROI 总览和漏斗，再把高风险 SKU、退款 SKU 和渠道利润串成一份日报。" },
  ],
  charts: [
    {
      title: "ROI 拆解预览",
      kind: "bars",
      items: [
        { label: "收入", value: 100, display: "$24.8k" },
        { label: "货品成本", value: 38, display: "$9.4k" },
        { label: "售后/支付/折扣", value: 14, display: "$3.5k" },
        { label: "广告花费", value: 19, display: "$4.6k" },
        { label: "经营利润", value: 29, display: "$7.3k" },
      ],
    },
    {
      title: "优先渠道预览",
      kind: "table",
      items: [
        { label: "Google", value: 100, display: "$5.4k", note: "利润稳定 / 适合加码" },
        { label: "Meta", value: 82, display: "$5.1k", note: "收入高 / 需继续压成本" },
        { label: "TikTok", value: 49, display: "$2.6k", note: "新客多 / 观察 ROI" },
      ],
    },
  ],
};

const mockSnapshots: Record<PeriodKey, Snapshot> = {
  "7d": {
    summary:
      "过去 7 天先把经营数据拆成流量、成本、转化、售后和利润等模块展示，方便后续在同一套口径上生成 AI 商业洞察。",
    metricAccent: "当前先做前端 UI 骨架：事实层先清楚，洞察层后接。",
    topMetrics: [
      { label: "销售额", value: "$24.8k", unit: "较上周期 -8.4%" },
      { label: "贡献利润", value: "$8.2k", unit: "利润率 33.1%" },
      { label: "整体转化率", value: "2.46%", unit: "支付成功率 91.2%" },
      { label: "退款率", value: "4.8%", unit: "物流异常 18 单" },
      { label: "高风险 SKU", value: "12", unit: "预计损失 $1.4k" },
    ],
    coverage: [
      { label: "Shopify 订单/退款/库存", value: "已接入", source: "real" },
      { label: "Pixel 漏斗", value: "已接入", source: "real" },
      { label: "GA4 页面与来源", value: "可接入", source: "estimated" },
      { label: "广告成本/ROAS", value: "待并入", source: "pending" },
    ],
    highlights: [
      "先把经营阅读顺序从“数据散点”整理成“模块分层”。",
      "利润、售后、转化会成为第一批最值得接真实数据的模块。",
      "AI 后续只读取模块摘要，不直接消化所有原始表。 ",
    ],
    nextSteps: [
      "优先接利润分析与售后分析的真实数据。",
      "再把流量与渠道层接成统一口径。",
      "最后补 AI 风险、机会和建议动作输出。",
    ],
    report: mockReport7d,
    modules: [
      {
        key: "traffic",
        title: "流量分析",
        subtitle: "先确认流量规模、来源结构和 landing page 表现",
        source: "estimated",
        summary: "当前 UI 先展示流量总量、来源占比和页面入口表现，后续会接 GA4 与 Pixel 的真实分层数据。",
        metrics: [
          { label: "Sessions", value: "18,420", delta: "-6.2%" },
          { label: "Users", value: "13,870", delta: "-4.1%" },
          { label: "Top 来源", value: "Direct 34%" },
          { label: "Top Landing", value: "/products/aura-lamp" },
        ],
        chart: {
          title: "来源占比预览",
          kind: "bars",
          items: [
            { label: "Direct", value: 34, display: "34%" },
            { label: "Google", value: 26, display: "26%" },
            { label: "Meta", value: 18, display: "18%" },
            { label: "TikTok", value: 12, display: "12%" },
          ],
        },
        signals: ["自然流量回落", "Direct 占比偏高，来源识别仍需补齐"],
        actionHint: "下一步建议把流量模块接入 GA4 来源和 landing page 维度。",
      },
      {
        key: "cost",
        title: "成本分析",
        subtitle: "把广告、折扣、支付手续费和售后损失拆开看",
        source: "estimated",
        summary: "成本层先看结构，再判断利润被哪一块挤压；真实广告投入后续直接替换占位数据。",
        metrics: [
          { label: "广告花费", value: "$4.6k", delta: "+9.8%" },
          { label: "折扣成本", value: "$1.1k", delta: "+2.4%" },
          { label: "支付手续费", value: "$0.8k" },
          { label: "退款损失", value: "$0.6k", delta: "+14.2%" },
        ],
        chart: {
          title: "成本构成预览",
          kind: "stack",
          items: [
            { label: "广告", value: 52, display: "52%" },
            { label: "折扣", value: 18, display: "18%" },
            { label: "支付", value: 10, display: "10%" },
            { label: "售后", value: 20, display: "20%" },
          ],
        },
        signals: ["广告成本先占位", "退款损失增速高于销售额"],
        actionHint: "后续把广告平台 spend 拉进来后，这里可以直接转成 ROI 视角。",
      },
      {
        key: "conversion",
        title: "转化率分析",
        subtitle: "把访问、加购、结账和支付成功放进同一条漏斗",
        source: "real",
        summary: "转化模块适合做漏斗视图，先帮助用户判断问题卡在流量质量、站内页面还是支付环节。",
        metrics: [
          { label: "整体 CVR", value: "2.46%", delta: "-0.3pp" },
          { label: "加购率", value: "8.9%", delta: "-0.7pp" },
          { label: "发起结账", value: "4.3%" },
          { label: "支付成功率", value: "91.2%" },
        ],
        chart: {
          title: "转化漏斗预览",
          kind: "funnel",
          items: [
            { label: "访问", value: 100, display: "18.4k" },
            { label: "加购", value: 43, display: "1.6k" },
            { label: "结账", value: 21, display: "790" },
            { label: "支付成功", value: 19, display: "720" },
          ],
        },
        signals: ["加购到结账掉得快", "支付链路整体稳定"],
        actionHint: "这个模块后面很适合承接 AI 的‘问题卡在哪一层’解释。",
      },
      {
        key: "afterSales",
        title: "售后分析",
        subtitle: "退款、超时履约和物流异常需要放在一个模块里看",
        source: "real",
        summary: "售后层不只是看退款率，还要把退款 SKU、超时订单和物流异常一并拉出来，方便定位根因。",
        metrics: [
          { label: "退款率", value: "4.8%", delta: "+1.1pp" },
          { label: "退款金额", value: "$1.2k" },
          { label: "超时未发货", value: "9 单" },
          { label: "物流异常", value: "18 单" },
        ],
        chart: {
          title: "售后问题排序",
          kind: "table",
          items: [
            { label: "退款 SKU / AURA-01", value: 100, display: "$420", note: "质量/描述不符" },
            { label: "退款 SKU / NOVA-03", value: 76, display: "$310", note: "运输破损" },
            { label: "物流异常 / FedEx", value: 58, display: "11 单", note: "在途超 7 天" },
          ],
        },
        signals: ["退款和物流异常需要联动看", "售后问题已经开始侵蚀利润"],
        actionHint: "后面这里可以直接接现有 diagnosis 的明细对象。",
      },
      {
        key: "profit",
        title: "利润分析",
        subtitle: "收入不是结果，利润才是最终经营判断",
        source: "estimated",
        summary: "利润模块会把收入、贡献利润和利润率放在一起，避免页面只展示销售额而掩盖真实经营质量。",
        metrics: [
          { label: "Revenue", value: "$24.8k", delta: "-8.4%" },
          { label: "Contribution Profit", value: "$8.2k", delta: "-15.1%" },
          { label: "利润率", value: "33.1%", delta: "-2.7pp" },
          { label: "高收入低利润渠道", value: "Meta" },
        ],
        chart: {
          title: "收入与利润对比",
          kind: "bars",
          items: [
            { label: "Direct", value: 74, display: "$4.3k" },
            { label: "Google", value: 58, display: "$3.1k" },
            { label: "Meta", value: 46, display: "$2.2k" },
            { label: "TikTok", value: 39, display: "$1.6k" },
          ],
        },
        signals: ["利润下滑比销售额更快", "利润视角应该成为首页主角之一"],
        actionHint: "接下来可以把渠道利润与商品利润切成两张子卡。",
      },
      {
        key: "productInventory",
        title: "商品与库存分析",
        subtitle: "把爆款、衰退款和库存风险放到同一张商品视图里",
        source: "real",
        summary: "这个模块要同时回答两个问题：哪些商品值得加预算，哪些商品会因为库存或售后拖累整体表现。",
        metrics: [
          { label: "Top 商品", value: "Aura Lamp" },
          { label: "衰退商品", value: "Nova Strip" },
          { label: "风险 SKU", value: "12", delta: "+4" },
          { label: "预计缺货损失", value: "$1.4k" },
        ],
        chart: {
          title: "商品热度预览",
          kind: "table",
          items: [
            { label: "Aura Lamp", value: 100, display: "$5.2k", note: "高销量 / 库存偏紧" },
            { label: "Nova Strip", value: 68, display: "$1.9k", note: "销量回落" },
            { label: "Zen Diffuser", value: 54, display: "$1.6k", note: "利润率高" },
          ],
        },
        signals: ["商品模块后续可以衔接推广和补货建议", "库存风险最好直接露出影响金额"],
        actionHint: "这个卡片后续可直接联动商品页和补货动作。",
      },
      {
        key: "customerValue",
        title: "客户价值分析",
        subtitle: "把新客、复购和高价值客户拆开看，而不是只看订单量",
        source: "estimated",
        summary: "客户价值层已经有现成后端能力，UI 这里先把分层、LTV 和高价值客户占比集中展示。",
        metrics: [
          { label: "复购率", value: "28.4%", delta: "+1.2pp" },
          { label: "平均 LTV", value: "$186" },
          { label: "高价值占比", value: "17%" },
          { label: "流失风险客户", value: "42" },
        ],
        chart: {
          title: "客户分层预览",
          kind: "bars",
          items: [
            { label: "New", value: 36, display: "36%" },
            { label: "Active", value: 31, display: "31%" },
            { label: "VIP", value: 12, display: "12%" },
            { label: "At Risk", value: 21, display: "21%" },
          ],
        },
        signals: ["高价值客户应该单独露出", "后续可补新客与老客利润贡献差异"],
        actionHint: "这个模块后续很适合给 AI 输出 retention 类建议。",
      },
      {
        key: "channel",
        title: "渠道分析",
        subtitle: "把收入、利润和客户质量统一到同一张渠道卡片",
        source: "estimated",
        summary: "渠道模块应该同时展示收入、利润和客户质量，避免只看投放量级，不看带来的客群质量。",
        metrics: [
          { label: "最佳利润渠道", value: "Google" },
          { label: "最佳客户质量", value: "Direct" },
          { label: "新客占比最高", value: "TikTok" },
          { label: "ROI", value: "待接广告成本" },
        ],
        chart: {
          title: "渠道经营预览",
          kind: "table",
          items: [
            { label: "Direct", value: 100, display: "$6.8k", note: "高利润 / 高复购" },
            { label: "Google", value: 82, display: "$5.4k", note: "利润稳定" },
            { label: "Meta", value: 74, display: "$5.1k", note: "收入高 / 利润偏薄" },
            { label: "TikTok", value: 49, display: "$2.6k", note: "新客多" },
          ],
        },
        signals: ["渠道表不该只看 revenue", "后续广告成本接入后可直接升级成 ROI 面板"],
        actionHint: "未来这里会成为 AI 判断‘该扩量还是止损’的重要输入。",
      },
    ],
  },
  "30d": {
    summary:
      "近 30 天更适合看结构和趋势，而不是只盯当天异常。第一版 UI 会保留同样的模块骨架，让短周期和长周期的阅读方式一致。",
    metricAccent: "短周期看波动，长周期看结构；UI 先统一两种阅读方式。",
    topMetrics: [
      { label: "销售额", value: "$96.4k", unit: "较上周期 +3.7%" },
      { label: "贡献利润", value: "$31.6k", unit: "利润率 32.8%" },
      { label: "整体转化率", value: "2.53%", unit: "支付成功率 92.1%" },
      { label: "退款率", value: "4.1%", unit: "退款金额 $4.8k" },
      { label: "高风险 SKU", value: "18", unit: "预计损失 $3.8k" },
    ],
    coverage: [
      { label: "Shopify 订单/退款/库存", value: "已接入", source: "real" },
      { label: "Pixel 漏斗", value: "已接入", source: "real" },
      { label: "GA4 页面与来源", value: "可接入", source: "estimated" },
      { label: "广告成本/ROAS", value: "待并入", source: "pending" },
    ],
      highlights: [
        "30 天视角更适合看结构，不适合只盯短期波动。",
        "渠道、客户价值和利润分布会比单日异常更重要。",
        "页面骨架保持一致，方便以后统一接入真实数据。",
      ],
      nextSteps: [
        "补齐趋势图真实口径。",
        "增加利润与客户价值的长期对比。",
        "把渠道与广告成本真正并成 ROI 视图。",
      ],
    report: {
      ...mockReport7d,
      summary: "30 天更适合看 ROI 结构，而不是只看单点波动。",
      cards: [
        { label: "经营 ROI", value: "结构视角", detail: "优先看利润、客户价值和渠道质量", tone: "neutral" },
        { label: "当前卡点", value: "利润结构", detail: "要看是成本压力还是售后侵蚀", tone: "warning" },
        { label: "数据可信度", value: "逐步补齐", detail: "30 天页优先接结构层真实数据", tone: "neutral" },
      ],
    },
    modules: [],
  },
};

mockSnapshots["30d"].modules = mockSnapshots["7d"].modules.map((module) => ({
  ...module,
  summary: module.summary.replace("当前 UI", "30 天视角").replace("后续", "下一步"),
}));

function formatCurrency(value: number | null | undefined, currency = "USD", digits = 0): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function formatNumber(value: number | null | undefined, digits = 0): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${formatNumber(value, digits)}%`;
}

function formatSignedPercent(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatNumber(value, digits)}%`;
}

function formatSignedPercentPoint(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatNumber(value, digits)}pp`;
}

function gradeBusinessRoiValue(value: number | null): { label: string; tone: ReportCardTone } {
  if (value == null || !Number.isFinite(value)) {
    return { label: "待接广告成本", tone: "neutral" };
  }
  if (value >= 0.5) return { label: "S", tone: "positive" };
  if (value >= 0.2) return { label: "A", tone: "positive" };
  if (value >= 0) return { label: "B", tone: "warning" };
  if (value >= -0.2) return { label: "C", tone: "warning" };
  return { label: "D", tone: "negative" };
}

function reportToneFromConfidence(connectedSignals: number): ReportCardTone {
  if (connectedSignals >= 4) return "positive";
  if (connectedSignals >= 2) return "warning";
  return "neutral";
}

function buildShortTermRoiAssessment(params: {
  overallBusinessRoi: number | null;
  hasAds: boolean;
  hasChannel: boolean;
  hasDiagnosis: boolean;
}): Pick<ReportRoiLayerCard, "dataQuality" | "confidence"> {
  if (params.overallBusinessRoi != null && params.hasAds && params.hasChannel) {
    return { dataQuality: "realized", confidence: "high" };
  }
  if (params.overallBusinessRoi != null) {
    return { dataQuality: "realized", confidence: "medium" };
  }
  if (params.hasChannel || params.hasDiagnosis) {
    return { dataQuality: "estimated", confidence: "medium" };
  }
  return { dataQuality: "estimated", confidence: "low" };
}

function buildPaybackRoiAssessment(params: {
  conversionSource: ModuleSource | undefined;
  siteExperienceSource: ModuleSource | undefined;
  ga4Connected: boolean;
}): Pick<ReportRoiLayerCard, "dataQuality" | "confidence"> {
  if (
    params.conversionSource === "real" &&
    params.siteExperienceSource === "real" &&
    params.ga4Connected
  ) {
    return { dataQuality: "estimated", confidence: "medium" };
  }
  if (params.conversionSource && params.conversionSource !== "pending") {
    return { dataQuality: "estimated", confidence: "medium" };
  }
  return { dataQuality: "estimated", confidence: "low" };
}

function buildLifetimeRoiAssessment(params: {
  customerSource: ModuleSource | undefined;
  channelSource: ModuleSource | undefined;
}): Pick<ReportRoiLayerCard, "dataQuality" | "confidence"> {
  if (params.customerSource === "real" && params.channelSource && params.channelSource !== "pending") {
    return { dataQuality: "predicted", confidence: "medium" };
  }
  if (params.customerSource && params.customerSource !== "pending") {
    return { dataQuality: "predicted", confidence: "medium" };
  }
  return { dataQuality: "predicted", confidence: "low" };
}

function mapInsightToneToReportTone(tone: InsightItemTone | undefined): ReportCardTone {
  if (tone === "critical") return "negative";
  if (tone === "warning") return "warning";
  if (tone === "info") return "positive";
  return "neutral";
}

function getFactorStatusLabel(tone: InsightItemTone | undefined): string {
  if (tone === "critical") return "Risk";
  if (tone === "warning") return "Watch";
  if (tone === "info") return "Healthy";
  return "Unknown";
}

function getFactorTitle(moduleKey: string): string {
  switch (moduleKey) {
    case "traffic":
      return "流量规模";
    case "cost":
    case "channel":
      return "投放效率";
    case "conversion":
      return "转化效率";
    case "siteExperience":
      return "转化效率（体验）";
    case "profit":
      return "定价与客单价";
    case "productInventory":
      return "商品经营质量";
    case "afterSales":
      return "履约与售后损耗";
    case "customerValue":
      return "生命周期价值";
    default:
      return "经营因子";
  }
}

function getFactorRoiLayerLabel(moduleKey: string): string {
  switch (moduleKey) {
    case "traffic":
    case "cost":
    case "profit":
    case "afterSales":
    case "productInventory":
      return "短期 ROI";
    case "conversion":
    case "siteExperience":
      return "回收速度";
    case "customerValue":
    case "channel":
      return "长期价值";
    default:
      return "经营因子";
  }
}

function getModuleDrilldownHref(moduleKey: string): string | undefined {
  const hrefByModuleKey: Record<string, string> = {
    traffic: buildInsightsChartsHref({ group: "acquisition", card: "traffic_scale" }),
    cost: buildInsightsChartsHref({ group: "roi", card: "channel_roi" }),
    conversion: buildInsightsChartsHref({ group: "conversion", card: "funnel" }),
    afterSales: buildInsightsChartsHref({
      group: "merchandising_ops",
      card: "fulfillment_refund",
    }),
    profit: buildInsightsChartsHref({ group: "roi", card: "short_term_roi" }),
    productInventory: buildInsightsChartsHref({
      group: "merchandising_ops",
      card: "inventory_flow",
    }),
    customerValue: buildInsightsChartsHref({ group: "roi", card: "payback_curve" }),
    channel: buildInsightsChartsHref({ group: "roi", card: "channel_roi" }),
    siteExperience: buildInsightsChartsHref({
      group: "conversion",
      card: "site_experience",
    }),
  };

  return hrefByModuleKey[moduleKey];
}

function buildFactorComparison(module: BusinessModule): string {
  const deltas = module.metrics
    .map((metric) => (metric.delta ? `${metric.label} ${metric.delta}` : null))
    .filter((value): value is string => Boolean(value));

  if (deltas.length > 0) {
    return `历史基准：${deltas[0]}`;
  }

  switch (module.key) {
    case "traffic":
      return "结构基准：当前来源结构对比全站流量分布。";
    case "conversion":
      return "经验阈值：优先看 CVR、支付成功率和漏斗掉点。";
    case "afterSales":
      return "经验阈值：退款率、履约超时和物流异常优先对比最近 30 天均值。";
    case "siteExperience":
      return "经验阈值：PageSpeed、LCP 和 TBT 对比行业可用阈值。";
    case "customerValue":
      return "历史基准：复购率与高价值客户占比对比近 30 天结构。";
    case "channel":
      return "结构基准：高利润渠道对比全站与其他主要渠道。";
    default:
      return "历史基准：优先对比最近一个周期与当前结构差异。";
  }
}

function buildFactorImpactPath(moduleKey: string): string {
  switch (moduleKey) {
    case "traffic":
      return "流量规模/质量 -> 商品页承接 -> 转化效率 -> 短期 ROI";
    case "cost":
      return "成本结构 -> 贡献利润 -> 经营利润 -> 短期 ROI";
    case "conversion":
      return "访问进入 -> 站内漏斗 -> 支付成功 -> 回收速度";
    case "afterSales":
      return "退款/履约损耗 -> 利润侵蚀 -> 短期 ROI";
    case "profit":
      return "收入质量 -> 贡献利润 -> 广告后经营利润 -> 短期 ROI";
    case "productInventory":
      return "商品供给/质量 -> 转化与退款 -> 短期 ROI";
    case "customerValue":
      return "复购与 LTV -> 生命周期价值 -> 长期 ROI";
    case "channel":
      return "获客渠道质量 -> 客户价值层 -> 长期 ROI";
    case "siteExperience":
      return "站点体验 -> Landing Page 承接 -> 回收速度";
    default:
      return "经营因子 -> ROI 影响";
  }
}

function inferBenchmarkKind(module: BusinessModule): ReportBenchmarkKind {
  const hasDelta = module.metrics.some((metric) => Boolean(metric.delta));
  if (hasDelta) {
    return module.key === "channel" || module.key === "traffic" ? "mixed" : "historical";
  }

  switch (module.key) {
    case "traffic":
    case "channel":
      return "structural";
    case "conversion":
    case "afterSales":
    case "siteExperience":
    case "customerValue":
      return "threshold";
    default:
      return "historical";
  }
}

function buildModuleSourceInputs(moduleKey: string): string[] {
  switch (moduleKey) {
    case "traffic":
      return ["GA4 sessions / channel / landing page", "Web Pixel 流量基线"];
    case "cost":
      return ["广告花费", "支付手续费", "折扣成本", "退款损失"];
    case "conversion":
      return ["Sessions", "订单数", "支付尝试", "支付成功数"];
    case "afterSales":
      return ["退款订单", "退款 SKU", "超时履约订单", "物流异常对象"];
    case "profit":
      return ["收入", "SKU 成本", "支付/折扣/退款损耗", "广告花费"];
    case "productInventory":
      return ["库存风险对象", "可售天数", "退款 SKU 聚类"];
    case "customerValue":
      return ["客户分层", "复购率", "动态 LTV"];
    case "channel":
      return ["渠道收入/利润", "客户质量", "广告平台 spend"];
    case "siteExperience":
      return ["PageSpeed 实验室报告", "Top landing page 对象"];
    default:
      return ["经营诊断聚合数据"];
  }
}

function buildRecommendedAction(params: {
  key: string;
  title: string;
  roiLayerLabel: string;
  summary: string;
  action: string;
  tone: ReportCardTone;
  targetModuleKeys?: string[];
  taskCandidate?: ReportTaskCandidateSeed;
  href?: string;
}): ReportRecommendedAction {
  const { taskCandidate, ...rest } = params;
  if (!taskCandidate) {
    return rest;
  }

  const primaryMetric = taskCandidate.impactMetrics[0] ?? params.key;
  const dedupeKey = [
    taskCandidate.problemKey,
    taskCandidate.primaryObjectId ?? "shop",
    primaryMetric,
    taskCandidate.dueWindow,
  ].join(":");

  return {
    ...rest,
    taskCandidate: {
      ...taskCandidate,
      action: params.action,
      dedupeKey,
      aiExecutionPrompt: `请围绕「${taskCandidate.objective}」执行。优先关注 ${taskCandidate.impactMetrics.join(" / ")}。建议动作：${params.action}`,
    },
  };
}

export function buildReportGenerationTrace(params: {
  modules: BusinessModule[];
  factorCards: FactorDiagnosisCard[];
  actions: ReportRecommendedAction[];
  insights: InsightListItem[];
}): SnapshotReportGenerationTrace {
  const insightByTargetKey = new Map<string, InsightListItem>();
  params.insights.forEach((item) => {
    if (item.targetKey && !insightByTargetKey.has(item.targetKey)) {
      insightByTargetKey.set(item.targetKey, item);
    }
  });

  const factorCardByKey = new Map(params.factorCards.map((card) => [card.key, card]));
  const actionKeysByModule = new Map<string, string[]>();

  params.actions.forEach((action) => {
    action.targetModuleKeys?.forEach((moduleKey) => {
      const existing = actionKeysByModule.get(moduleKey) ?? [];
      existing.push(action.key);
      actionKeysByModule.set(moduleKey, existing);
    });
  });

  return {
    factors: params.modules.map((module) => {
      const factorCard = factorCardByKey.get(module.key);
      const linkedInsight = insightByTargetKey.get(module.key);
      return {
        moduleKey: module.key,
        moduleTitle: module.title,
        roiLayerLabel: factorCard?.roiLayerLabel ?? getFactorRoiLayerLabel(module.key),
        source: module.source,
        sourceInputs: buildModuleSourceInputs(module.key),
        derivedMetrics: module.metrics,
        benchmark: {
          kind: inferBenchmarkKind(module),
          summary: factorCard?.comparison ?? buildFactorComparison(module),
        },
        classification: {
          statusLabel: factorCard?.statusLabel ?? "Unknown",
          tone: factorCard?.tone ?? "neutral",
          insightTitle: linkedInsight?.title,
        },
        mappedActionKeys: actionKeysByModule.get(module.key) ?? [],
        impactPath: factorCard?.impactPath ?? buildFactorImpactPath(module.key),
      };
    }),
    actions: params.actions.map((action) => ({
      actionKey: action.key,
      title: action.title,
      roiLayerLabel: action.roiLayerLabel,
      tone: action.tone,
      targetModuleKeys: action.targetModuleKeys ?? [],
      sourceType: action.taskCandidate?.sourceType ?? null,
      problemKey: action.taskCandidate?.problemKey,
      dedupeKey: action.taskCandidate?.dedupeKey,
      whyNow: action.taskCandidate?.whyNow ?? action.summary,
      impactMetrics: action.taskCandidate?.impactMetrics ?? [],
    })),
  };
}

function diagnosisFocusLabel(key: string): string {
  switch (key) {
    case "sales_trend":
      return "销售结果";
    case "traffic_anomaly":
      return "流量获取";
    case "conversion_health":
      return "站内转化";
    case "product_operations":
      return "商品基础";
    case "fulfillment_health":
      return "履约时效";
    case "logistics_anomaly":
      return "物流体验";
    case "refund_health":
      return "售后退款";
    case "inventory_health":
      return "库存供给";
    default:
      return "经营环节";
  }
}

const REPORT_TASK_PRIORITY_RANK: Record<ReportTaskPriority, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
};

const REPORT_TASK_DUE_WINDOW_RANK: Record<ReportTaskDueWindow, number> = {
  today: 0,
  "48h": 1,
  this_week: 2,
  backlog: 3,
};

const REPORT_TASK_CONFIDENCE_RANK: Record<ReportTaskConfidence, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function preferLongerText(primary?: string, secondary?: string): string | undefined {
  const left = primary?.trim() ?? "";
  const right = secondary?.trim() ?? "";
  if (!left) return right || undefined;
  if (!right) return left;
  return right.length > left.length ? right : left;
}

function compareReportTaskCandidates(
  left: ReportTaskCandidate,
  right: ReportTaskCandidate,
): number {
  const priorityDelta =
    REPORT_TASK_PRIORITY_RANK[left.priority] - REPORT_TASK_PRIORITY_RANK[right.priority];
  if (priorityDelta !== 0) return priorityDelta;

  const dueWindowDelta =
    REPORT_TASK_DUE_WINDOW_RANK[left.dueWindow] - REPORT_TASK_DUE_WINDOW_RANK[right.dueWindow];
  if (dueWindowDelta !== 0) return dueWindowDelta;

  const confidenceDelta =
    REPORT_TASK_CONFIDENCE_RANK[left.confidence] - REPORT_TASK_CONFIDENCE_RANK[right.confidence];
  if (confidenceDelta !== 0) return confidenceDelta;

  if (left.sourceType !== right.sourceType) {
    return left.sourceType === "rule" ? -1 : 1;
  }

  return left.problemKey.localeCompare(right.problemKey);
}

function mergeTwoReportTaskCandidates(
  primary: ReportTaskCandidate,
  secondary: ReportTaskCandidate,
): ReportTaskCandidate {
  const preferred =
    compareReportTaskCandidates(primary, secondary) <= 0 ? primary : secondary;
  const fallback = preferred === primary ? secondary : primary;
  const mergedSourceType =
    preferred.sourceType === fallback.sourceType
      ? preferred.sourceType
      : "hybrid";

  return {
    ...preferred,
    sourceType: mergedSourceType,
    ownerRole: preferLongerText(preferred.ownerRole, fallback.ownerRole) ?? preferred.ownerRole,
    objective: preferLongerText(preferred.objective, fallback.objective) ?? preferred.objective,
    impactMetrics: uniqueStrings([...preferred.impactMetrics, ...fallback.impactMetrics]),
    estimatedLift: preferLongerText(preferred.estimatedLift, fallback.estimatedLift),
    confidence:
      REPORT_TASK_CONFIDENCE_RANK[preferred.confidence] <=
      REPORT_TASK_CONFIDENCE_RANK[fallback.confidence]
        ? preferred.confidence
        : fallback.confidence,
    riskEnvironment:
      preferLongerText(preferred.riskEnvironment, fallback.riskEnvironment) ??
      preferred.riskEnvironment,
    whyNow: preferLongerText(preferred.whyNow, fallback.whyNow) ?? preferred.whyNow,
    roiImpactSummary:
      preferLongerText(preferred.roiImpactSummary, fallback.roiImpactSummary) ??
      preferred.roiImpactSummary,
    action: preferLongerText(preferred.action, fallback.action) ?? preferred.action,
    primaryObjectId: preferred.primaryObjectId ?? fallback.primaryObjectId,
    primaryObjectType: preferred.primaryObjectType ?? fallback.primaryObjectType,
    aiExecutionPrompt:
      preferLongerText(preferred.aiExecutionPrompt, fallback.aiExecutionPrompt) ??
      preferred.aiExecutionPrompt,
  };
}

export function mergeReportTaskCandidates(
  ruleCandidates: ReportTaskCandidate[],
  aiCandidates: ReportTaskCandidate[],
): ReportTaskCandidatePipeline {
  const mergedByKey = new Map<string, ReportTaskCandidate>();
  const inputs = [...ruleCandidates, ...aiCandidates];

  for (const candidate of inputs) {
    const existing = mergedByKey.get(candidate.dedupeKey);
    if (!existing) {
      mergedByKey.set(candidate.dedupeKey, candidate);
      continue;
    }
    mergedByKey.set(candidate.dedupeKey, mergeTwoReportTaskCandidates(existing, candidate));
  }

  const mergedCandidates = Array.from(mergedByKey.values()).sort(compareReportTaskCandidates);
  return {
    ruleCandidates: [...ruleCandidates].sort(compareReportTaskCandidates),
    aiCandidates: [...aiCandidates].sort(compareReportTaskCandidates),
    mergedCandidates,
    dedupedCount: Math.max(0, inputs.length - mergedCandidates.length),
  };
}

export function buildReportTaskCandidatePipeline(
  actions: ReportRecommendedAction[],
): ReportTaskCandidatePipeline {
  const ruleCandidates: ReportTaskCandidate[] = [];
  const aiCandidates: ReportTaskCandidate[] = [];

  for (const action of actions) {
    if (!action.taskCandidate) continue;
    if (action.taskCandidate.sourceType === "rule") {
      ruleCandidates.push(action.taskCandidate);
      continue;
    }
    aiCandidates.push(action.taskCandidate);
  }

  return mergeReportTaskCandidates(ruleCandidates, aiCandidates);
}

mockReport7d.taskPipeline = buildReportTaskCandidatePipeline(mockReport7d.actions);
mockReport7d.generationTrace = buildReportGenerationTrace({
  modules: mockSnapshots["7d"].modules ?? [],
  factorCards: mockReport7d.factorCards,
  actions: mockReport7d.actions,
  insights: mockReport7d.insights,
});

function clampChartShare(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 10;
  return Math.max(10, Math.min(100, value));
}

function mapInsightTone(status: "healthy" | "watch" | "risk"): InsightItemTone {
  if (status === "risk") return "critical";
  if (status === "watch") return "warning";
  return "info";
}

function mapInsightConfidence(evidenceCount: number, reasoningCount: number): "高" | "中" | "低" {
  if (evidenceCount >= 2) return "高";
  if (evidenceCount >= 1 || reasoningCount >= 1) return "中";
  return "低";
}

function normalizeGa4Key(value: string | null | undefined, fallback = "(not set)"): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

function buildDelta(current: number | null | undefined, previous: number | null | undefined, digits = 1): string | undefined {
  if (current == null || previous == null || !Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) {
    return undefined;
  }
  const change = ((current - previous) / previous) * 100;
  const sign = change > 0 ? "+" : "";
  return `${sign}${formatNumber(change, digits)}%`;
}

function buildPageSpeedHref(
  url: string | null,
  strategy: "mobile" | "desktop" = "mobile",
  label?: string,
): string {
  const next = new URLSearchParams();
  if (url) next.set("url", url);
  next.set("strategy", strategy);
  next.set("autorun", "1");
  next.set("source", "daily-insights");
  if (label) next.set("label", label);
  return `/app/settings/pagespeed?${next.toString()}`;
}

function buildInsightsChartsHref(params: {
  group: "roi" | "acquisition" | "conversion" | "merchandising_ops";
  card: string;
  extra?: Record<string, string | undefined | null>;
}): string {
  const next = new URLSearchParams();
  next.set("group", params.group);
  next.set("card", params.card);
  Object.entries(params.extra ?? {}).forEach(([key, value]) => {
    if (value) next.set(key, value);
  });
  return `/app/insights/charts?${next.toString()}`;
}

export function appendReturnTo(href: string, returnTo: string): string {
  const [path, query = ""] = href.split("?");
  const next = new URLSearchParams(query);
  next.set("returnTo", returnTo);
  return `${path}?${next.toString()}`;
}

function findPageSpeedCategory(report: PageSpeedReport | null, id: PageSpeedReport["categories"][number]["id"]) {
  return report?.categories.find((item) => item.id === id) ?? null;
}

function findPageSpeedMetric(report: PageSpeedReport | null, id: string) {
  return report?.metrics.find((item) => item.id === id) ?? null;
}

function formatScore(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${Math.round(value)}`;
}

function normalizeScoreToChart(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 10;
  return Math.max(10, Math.min(100, value));
}

function buildStorefrontUrl(baseUrl: string | null | undefined, path: string | null | undefined): string | null {
  const base = baseUrl?.trim();
  const pathname = path?.trim();
  if (!base || !pathname) return null;
  if (!pathname.startsWith("/")) return null;
  try {
    return new URL(pathname, base).toString();
  } catch {
    return null;
  }
}

function computeConversionRate(purchases: number | null | undefined, sessions: number | null | undefined): number | null {
  if (
    purchases == null ||
    sessions == null ||
    !Number.isFinite(purchases) ||
    !Number.isFinite(sessions) ||
    sessions <= 0
  ) {
    return null;
  }
  return (purchases / sessions) * 100;
}

function formatLandingObjectNote(params: {
  sessions: number | null | undefined;
  revenue: number | null | undefined;
  purchases: number | null | undefined;
  currency: string;
}) {
  const parts = [
    `${formatNumber(params.sessions)} sessions`,
    `${formatCurrency(params.revenue, params.currency)} revenue`,
  ];
  const cvr = computeConversionRate(params.purchases, params.sessions);
  if (cvr != null) {
    parts.push(`CVR ${formatPercent(cvr)}`);
  }
  return parts.join(" / ");
}

function buildHomeExperiencePriorityLabel(score: number | null | undefined): string {
  if (score == null || !Number.isFinite(score)) return "全站入口 / 待分析";
  if (score < 50) return "全站入口 / 体验偏弱 / 先处理";
  if (score < 90) return "全站入口 / 仍可优化";
  return "全站入口 / 体验稳定";
}

function buildLandingExperiencePriorityLabel(params: {
  sessions: number | null | undefined;
  totalSessions: number | null | undefined;
  revenue: number | null | undefined;
  totalRevenue: number | null | undefined;
  conversionRate: number | null | undefined;
  baselineConversionRate: number | null | undefined;
  hasDrilldown: boolean;
}): string {
  const sessionShare =
    params.sessions != null &&
    params.totalSessions != null &&
    Number.isFinite(params.sessions) &&
    Number.isFinite(params.totalSessions) &&
    params.totalSessions > 0
      ? params.sessions / params.totalSessions
      : null;
  const revenueShare =
    params.revenue != null &&
    params.totalRevenue != null &&
    Number.isFinite(params.revenue) &&
    Number.isFinite(params.totalRevenue) &&
    params.totalRevenue > 0
      ? params.revenue / params.totalRevenue
      : null;
  const highTraffic = sessionShare != null && sessionShare >= 0.2;
  const highRevenue = revenueShare != null && revenueShare >= 0.2;
  const lowConversion =
    params.conversionRate != null &&
    params.baselineConversionRate != null &&
    params.conversionRate < params.baselineConversionRate * 0.85;

  if ((highTraffic || highRevenue) && lowConversion) {
    return params.hasDrilldown ? "高流量 / 低转化 / 待深钻" : "高流量 / 低转化";
  }
  if (highTraffic || highRevenue) {
    return params.hasDrilldown ? "高流量 / 高价值 / 可深钻" : "高流量 / 高价值";
  }
  return params.hasDrilldown ? "主要承接页 / 待深钻" : "主要承接页";
}

export function buildLiveSnapshots(liveData: LiveSnapshotData | null): Record<PeriodKey, Snapshot> {
  if (!liveData?.diagnosis) return mockSnapshots;

  const diagnosis = liveData.diagnosis;
  const customer = liveData.customerAggregates;
  const channel = liveData.channelRoi;
  const ads = liveData.ads;
  const ga4 = liveData.ga4;
  const pageSpeed = liveData.pageSpeed;
  const currency = ads?.currencyCode || diagnosis.summaryMetrics.currency || channel?.currency || "USD";

  const totalContributionProfit =
    channel?.channels.reduce((sum, item) => sum + item.contributionProfit, 0) ?? 0;
  const totalCogs = channel?.channels.reduce((sum, item) => sum + item.cogs, 0) ?? 0;
  const totalPaymentFees = channel?.channels.reduce((sum, item) => sum + item.paymentFees, 0) ?? 0;
  const totalDiscountCost = channel?.channels.reduce((sum, item) => sum + item.discountCost, 0) ?? 0;
  const totalRefundLoss = channel?.channels.reduce((sum, item) => sum + item.refundLoss, 0) ?? 0;
  const totalAdsSpend = ads?.totalSpend ?? 0;
  const totalCostBase = totalCogs + totalPaymentFees + totalDiscountCost + totalRefundLoss;
  const totalCostWithAds = totalCostBase + totalAdsSpend;
  const operatingProfitAfterAds = totalContributionProfit - totalAdsSpend;
  const topProfitChannel =
    channel?.channels.slice().sort((a, b) => b.contributionProfit - a.contributionProfit)[0] ?? null;
  const topRevenueChannel =
    channel?.channels.slice().sort((a, b) => b.revenue - a.revenue)[0] ?? null;
  const topInventoryRisk = diagnosis.detail.inventoryRisks[0] ?? null;
  const topRefundSku = diagnosis.detail.topRefundSkus[0] ?? null;
  const topAdsPlatform =
    ads?.platformSummaries.slice().sort((a, b) => b.spend - a.spend)[0] ?? null;
  const ga4TopSource = ga4?.channelRows[0] ?? null;
  const ga4TopLanding = ga4?.landingRows[0] ?? null;
  const trafficSessions = ga4?.summary?.totalSessions ?? diagnosis.summaryMetrics.sessions7d;
  const trafficUsers = ga4?.summary?.totalUsers ?? null;
  const trafficPageViews = ga4?.summary?.totalPageViews ?? null;
  const pageSpeedReport = pageSpeed?.report ?? null;
  const pageSpeedPerformance = findPageSpeedCategory(pageSpeedReport, "performance");
  const pageSpeedSeo = findPageSpeedCategory(pageSpeedReport, "seo");
  const pageSpeedLcp = findPageSpeedMetric(pageSpeedReport, "largest-contentful-paint");
  const pageSpeedCls = findPageSpeedMetric(pageSpeedReport, "cumulative-layout-shift");
  const pageSpeedTbt = findPageSpeedMetric(pageSpeedReport, "total-blocking-time");
  const pageSpeedPoorMetrics = pageSpeedReport?.metrics.filter((item) => item.band === "poor") ?? [];
  const pageSpeedWarningMetrics =
    pageSpeedReport?.metrics.filter((item) => item.band === "needs-improvement") ?? [];
  const pageSpeedTopOpportunity = pageSpeedReport?.reports.performance.opportunities[0] ?? null;
  const primaryStorefrontUrl = pageSpeed?.url ?? null;
  const topLandingPath = ga4TopLanding ? normalizeGa4Key(ga4TopLanding.key, "/") : null;
  const topLandingPageUrl = buildStorefrontUrl(primaryStorefrontUrl, topLandingPath);
  const topLandingPageHref = topLandingPageUrl
    ? buildPageSpeedHref(topLandingPageUrl, pageSpeed?.strategy ?? "mobile", topLandingPath ?? "主 landing page")
    : undefined;
  const overallSiteConversionRate =
    computeConversionRate(ga4?.summary?.totalPurchases, ga4?.summary?.totalSessions) ??
    diagnosis.summaryMetrics.conversionRate7d;
  const topLandingConversionRate = computeConversionRate(
    ga4TopLanding?.purchases,
    ga4TopLanding?.sessions,
  );
  const siteExperienceObjects: ChartItem[] = [
    {
      label: "店铺首页",
      value: pageSpeedPerformance?.score != null ? normalizeScoreToChart(pageSpeedPerformance.score) : 10,
      display: buildHomeExperiencePriorityLabel(pageSpeedPerformance?.score),
      note:
        ga4?.summary
          ? `${formatLandingObjectNote({
              sessions: ga4.summary.totalSessions,
              revenue: ga4.summary.totalRevenue,
              purchases: ga4.summary.totalPurchases,
              currency,
            })} / 性能 ${formatScore(pageSpeedPerformance?.score)}`
          : "首页经营量级待补",
    },
    ...(ga4TopLanding && topLandingPath
      ? [
          {
            label: topLandingPath,
            value: topLandingPageHref ? 72 : 18,
            display: buildLandingExperiencePriorityLabel({
              sessions: ga4TopLanding.sessions,
              totalSessions: ga4?.summary?.totalSessions,
              revenue: ga4TopLanding.revenue,
              totalRevenue: ga4?.summary?.totalRevenue,
              conversionRate: topLandingConversionRate,
              baselineConversionRate: overallSiteConversionRate,
              hasDrilldown: Boolean(topLandingPageHref),
            }),
            note: formatLandingObjectNote({
              sessions: ga4TopLanding.sessions,
              revenue: ga4TopLanding.revenue,
              purchases: ga4TopLanding.purchases,
              currency,
            }),
          } satisfies ChartItem,
        ]
      : []),
  ];

  const trafficModule: BusinessModule = {
    key: "traffic",
    title: "流量分析",
    subtitle: "优先展示 GA4 的会话、来源和 landing page，Pixel 继续补充站内转化判断",
    source: ga4?.connected || diagnosis.summaryMetrics.hasPixelData ? "real" : "estimated",
    summary: ga4?.connected
      ? `当前已接入 GA4 ${ga4.propertyCount > 1 ? `并合并 ${ga4.propertyCount} 个属性` : ""}，流量模块开始具备来源结构和 landing page 视角。`
      : diagnosis.summaryMetrics.hasPixelData
        ? "当前已接入 Web Pixel 的会话与转化口径，可以先稳定展示 7 天流量节奏和波动。"
        : "目前还没有稳定的流量来源拆解，先保留模块结构，待 Pixel / GA4 完整接入后补齐来源与 landing page。 ",
    metrics: [
      { label: "近 7 天 Sessions", value: formatNumber(trafficSessions), delta: ga4?.connected ? undefined : buildDelta(diagnosis.summaryMetrics.sessions7d, diagnosis.summaryMetrics.sessionsPrev7d) },
      { label: "Users", value: formatNumber(trafficUsers) },
      { label: "Top 来源", value: ga4TopSource ? normalizeGa4Key(ga4TopSource.key) : "—" },
      { label: "Top Landing", value: ga4TopLanding ? normalizeGa4Key(ga4TopLanding.key, "/") : "—" },
    ],
    chart: {
      title: ga4?.connected ? "来源占比" : "近 7 天流量对比",
      kind: "bars",
      items: ga4?.connected
        ? (ga4.channelRows.slice(0, 4).map((row) => ({
            label: normalizeGa4Key(row.key),
            value:
              ga4.summary && ga4.summary.totalSessions > 0
                ? Math.max(10, (row.sessions / ga4.summary.totalSessions) * 100)
                : 10,
            display: formatPercent(
              ga4.summary && ga4.summary.totalSessions > 0
                ? (row.sessions / ga4.summary.totalSessions) * 100
                : null,
            ),
            note: `${formatNumber(row.sessions)} sessions`,
          })) ?? [])
        : [
            { label: "本期 Sessions", value: diagnosis.summaryMetrics.sessions7d > 0 ? 100 : 12, display: formatNumber(diagnosis.summaryMetrics.sessions7d) },
            {
              label: "上期 Sessions",
              value:
                diagnosis.summaryMetrics.sessions7d > 0 && diagnosis.summaryMetrics.sessionsPrev7d > 0
                  ? Math.min(100, Math.max(10, (diagnosis.summaryMetrics.sessionsPrev7d / diagnosis.summaryMetrics.sessions7d) * 100))
                  : 10,
              display: formatNumber(diagnosis.summaryMetrics.sessionsPrev7d),
            },
            { label: "近 7 天订单", value: diagnosis.summaryMetrics.orderCount7d > 0 && diagnosis.summaryMetrics.sessions7d > 0 ? Math.max(10, (diagnosis.summaryMetrics.orderCount7d / diagnosis.summaryMetrics.sessions7d) * 100 * 15) : 10, display: formatNumber(diagnosis.summaryMetrics.orderCount7d) },
          ],
    },
    signals: [
      ga4?.connected
        ? `GA4 窗口为 ${ga4.startDate ?? "—"} 到 ${ga4.endDate ?? "—"}，当前 Top 来源是 ${ga4TopSource ? normalizeGa4Key(ga4TopSource.key) : "—"}。`
        : diagnosis.summaryMetrics.trafficChangeRate != null
          ? `流量环比 ${diagnosis.summaryMetrics.trafficChangeRate >= 0 ? "变化" : "下滑"} ${formatPercent(Math.abs(diagnosis.summaryMetrics.trafficChangeRate))}`
          : "当前还没有足够的上期流量基线。",
      ga4TopLanding
        ? `当前 Top landing page 是 ${normalizeGa4Key(ga4TopLanding.key, "/")}。`
        : diagnosis.summaryMetrics.hasPixelData
          ? "当前模块先使用 Pixel 的会话口径，后续再补来源与页面维度。"
          : "需要补齐 Pixel 或 GA4，才能把流量模块做完整。",
      ga4?.error ? `GA4 当前有读取错误：${ga4.error}` : `当前 page views 为 ${formatNumber(trafficPageViews)}。`,
    ],
    actionHint: ga4?.connected
      ? "下一步可以继续把 GA4 的 country 和 device 维度并进来，让流量模块更像完整的 acquisition 视图。"
      : "下一步最适合补 GA4 的来源和 landing page，让流量模块从规模视图升级成来源视图。",
  };

  const costModule: BusinessModule = {
    key: "cost",
    title: "成本分析",
    subtitle: "先把广告花费、货品成本、支付手续费、折扣和退款损失拆开看",
    source: channel || ads ? "estimated" : "pending",
    summary: channel || ads
      ? ads
        ? "当前已经把广告花费并入成本层，虽然货品成本仍有估算成分，但页面终于开始接近完整经营成本口径。"
        : "当前已经能从订单与 SKU 成本估算出主要经营成本，但广告花费还没并进来，所以这是半真实口径。"
      : "成本层还没拿到足够的经营数据，先保留卡片结构。",
    metrics: [
      { label: "广告花费", value: formatCurrency(totalAdsSpend, currency) },
      { label: "货品成本", value: formatCurrency(totalCogs, currency) },
      { label: "支付手续费", value: formatCurrency(totalPaymentFees, currency) },
      { label: "其他成本", value: formatCurrency(totalDiscountCost + totalRefundLoss, currency) },
    ],
    chart: {
      title: "成本构成",
      kind: "stack",
      items: [
        { label: "广告", value: totalCostWithAds > 0 ? (totalAdsSpend / totalCostWithAds) * 100 : 10, display: formatPercent(totalCostWithAds > 0 ? (totalAdsSpend / totalCostWithAds) * 100 : null) },
        { label: "货品", value: totalCostWithAds > 0 ? (totalCogs / totalCostWithAds) * 100 : 10, display: formatPercent(totalCostWithAds > 0 ? (totalCogs / totalCostWithAds) * 100 : null) },
        { label: "支付", value: totalCostWithAds > 0 ? (totalPaymentFees / totalCostWithAds) * 100 : 10, display: formatPercent(totalCostWithAds > 0 ? (totalPaymentFees / totalCostWithAds) * 100 : null) },
        { label: "其他", value: totalCostWithAds > 0 ? ((totalDiscountCost + totalRefundLoss) / totalCostWithAds) * 100 : 10, display: formatPercent(totalCostWithAds > 0 ? ((totalDiscountCost + totalRefundLoss) / totalCostWithAds) * 100 : null) },
      ],
    },
    signals: [
      liveData.costConfigured ? "店铺成本参数已配置，成本估算可信度更高。" : "当前仍有部分成本基于默认毛利率估算。",
      ads ? `当前已并入 ${ads.platformSummaries.length} 个广告平台的 spend。` : "广告花费尚未并入，因此成本层还不是完整 ROI。",
    ],
    actionHint: ads ? "下一步可以把广告 spend 进一步按渠道映射到经营渠道，让成本和渠道形成一张表。" : "接入广告 spend 后，这个模块可以直接升级成完整的成本与 ROI 视图。",
  };

  const conversionModule: BusinessModule = {
    key: "conversion",
    title: "转化率分析",
    subtitle: "用现有诊断层里的转化与支付链路数据先搭起第一版漏斗",
    source: diagnosis.summaryMetrics.hasPixelData || diagnosis.summaryMetrics.paymentAttempts7d > 0 ? "real" : "estimated",
    summary: "当前已经可以用 Sessions、订单数、支付尝试和支付成功率组成一个实用版漏斗，先帮助判断问题卡在访问、下单还是支付。",
    metrics: [
      { label: "整体 CVR", value: formatPercent(diagnosis.summaryMetrics.conversionRate7d), delta: diagnosis.summaryMetrics.conversionRatePrev7d != null && diagnosis.summaryMetrics.conversionRate7d != null ? `${diagnosis.summaryMetrics.conversionRate7d - diagnosis.summaryMetrics.conversionRatePrev7d >= 0 ? "+" : ""}${formatNumber(diagnosis.summaryMetrics.conversionRate7d - diagnosis.summaryMetrics.conversionRatePrev7d, 1)}pp` : undefined },
      { label: "支付成功率", value: formatPercent(diagnosis.summaryMetrics.paymentSuccessRate7d) },
      { label: "支付尝试", value: formatNumber(diagnosis.summaryMetrics.paymentAttempts7d) },
      { label: "支付失败", value: formatNumber(diagnosis.summaryMetrics.paymentFailureCount7d) },
    ],
    chart: {
      title: "转化漏斗",
      kind: "funnel",
      items: [
        { label: "访问", value: 100, display: formatNumber(diagnosis.summaryMetrics.sessions7d) },
        { label: "下单", value: diagnosis.summaryMetrics.sessions7d > 0 ? Math.max(10, (diagnosis.summaryMetrics.orderCount7d / diagnosis.summaryMetrics.sessions7d) * 100) : 10, display: formatNumber(diagnosis.summaryMetrics.orderCount7d) },
        { label: "支付尝试", value: diagnosis.summaryMetrics.sessions7d > 0 ? Math.max(10, (diagnosis.summaryMetrics.paymentAttempts7d / diagnosis.summaryMetrics.sessions7d) * 100) : 10, display: formatNumber(diagnosis.summaryMetrics.paymentAttempts7d) },
        { label: "支付成功", value: diagnosis.summaryMetrics.sessions7d > 0 ? Math.max(10, (diagnosis.summaryMetrics.paymentSuccessful7d / diagnosis.summaryMetrics.sessions7d) * 100) : 10, display: formatNumber(diagnosis.summaryMetrics.paymentSuccessful7d) },
      ],
    },
    signals: [
      diagnosis.summaryMetrics.paymentSuccessRate7d != null
        ? `支付成功率当前为 ${formatPercent(diagnosis.summaryMetrics.paymentSuccessRate7d)}。`
        : "当前暂无足够支付链路样本。",
      diagnosis.summaryMetrics.conversionRate7d != null
        ? `近 7 天站内转化率为 ${formatPercent(diagnosis.summaryMetrics.conversionRate7d)}。`
        : "需要 Pixel 数据才能稳定展示整体转化率。",
    ],
    actionHint: "下一步可以继续补加购与发起结账事件，让漏斗更像完整的电商转化链路。",
  };

  const afterSalesModule: BusinessModule = {
    key: "afterSales",
    title: "售后分析",
    subtitle: "直接复用退款、履约与物流异常数据，先把售后视角接真实",
    source: diagnosis.hasData ? "real" : "pending",
    summary: "售后模块已经可以直接从诊断层取退款、超时履约和物流异常对象，是当前最适合先做真的模块之一。",
    metrics: [
      { label: "退款率", value: formatPercent(diagnosis.summaryMetrics.refundRate30d), delta: `${diagnosis.summaryMetrics.refundRateDelta >= 0 ? "+" : ""}${formatNumber(diagnosis.summaryMetrics.refundRateDelta, 1)}pp` },
      { label: "退款金额", value: formatCurrency(diagnosis.summaryMetrics.refundAmount30d, currency) },
      { label: "超时未发货", value: formatNumber(diagnosis.summaryMetrics.overdueOrderCount) },
      { label: "物流异常", value: formatNumber(diagnosis.summaryMetrics.carrierIssueCount) },
    ],
    chart: {
      title: "Top 售后对象",
      kind: "table",
      items: diagnosis.detail.topRefundSkus.slice(0, 3).map((item) => ({
        label: item.sku,
        value: Math.max(10, item.amount),
        display: formatCurrency(item.amount, currency),
        note: `${item.title} / ${item.reason}`,
      })),
    },
    signals: [
      diagnosis.detail.topRefundSkus.length > 0 ? `当前已识别 ${diagnosis.detail.topRefundSkus.length} 个高退款 SKU。 ` : "当前没有明显的退款 SKU 聚集。",
      diagnosis.summaryMetrics.carrierIssueCount > 0 ? "物流异常已经进入售后观察范围。" : "物流异常目前相对稳定。",
    ],
    actionHint: "后续可以把这张卡直接联动到退款订单、物流异常和订单风险详情页。",
  };

  const profitModule: BusinessModule = {
    key: "profit",
    title: "利润分析",
    subtitle: "利润先看贡献利润，再看扣广告后的经营利润",
    source: channel || ads ? "estimated" : "pending",
    summary: channel || ads
      ? ads
        ? "利润层现在可以同时展示贡献利润和扣广告后的经营利润，虽然还不是严格归因利润，但已经比只看收入更接近真实经营判断。"
        : "利润层已经能基于订单、退款、支付手续费和 SKU 成本估算出贡献利润，是最适合先上真实经营价值的一层。"
      : "当前还没有拿到渠道经营层数据，因此利润模块暂时只能占位。",
    metrics: [
      { label: "近 30 天收入", value: formatCurrency(channel?.totalRevenue ?? diagnosis.summaryMetrics.revenue30d, currency) },
      { label: "贡献利润", value: formatCurrency(totalContributionProfit, currency) },
      { label: "经营利润", value: formatCurrency(operatingProfitAfterAds, currency) },
      { label: "经营利润率", value: channel?.totalRevenue ? formatPercent((operatingProfitAfterAds / channel.totalRevenue) * 100) : "—" },
    ],
    chart: {
      title: ads ? "利润与投放对比" : "渠道利润对比",
      kind: "bars",
      items: ads
        ? [
            { label: "贡献利润", value: totalContributionProfit > 0 ? 100 : 10, display: formatCurrency(totalContributionProfit, currency) },
            { label: "广告花费", value: totalContributionProfit > 0 ? Math.max(10, (totalAdsSpend / Math.max(totalContributionProfit, 1)) * 100) : 10, display: formatCurrency(totalAdsSpend, currency) },
            { label: "经营利润", value: totalContributionProfit > 0 ? Math.max(10, (Math.max(operatingProfitAfterAds, 0) / Math.max(totalContributionProfit, 1)) * 100) : 10, display: formatCurrency(operatingProfitAfterAds, currency) },
          ]
        : (channel?.channels.slice(0, 4) ?? []).map((item) => ({
            label: item.label,
            value: totalContributionProfit > 0 ? Math.max(10, (item.contributionProfit / totalContributionProfit) * 100) : 10,
            display: formatCurrency(item.contributionProfit, currency),
          })),
    },
    signals: [
      topRevenueChannel ? `${topRevenueChannel.label} 当前收入最高。` : "当前还没有可对比的渠道收入。",
      ads
        ? `近 ${ads.rangeDays} 天广告花费为 ${formatCurrency(totalAdsSpend, currency)}，${topAdsPlatform ? `${topAdsPlatform.platform} 投放最高。` : "已开始进入利润判断。"}`
        : topProfitChannel
          ? `${topProfitChannel.label} 当前贡献利润最高。`
          : "当前还没有可对比的渠道利润。",
    ],
    actionHint: ads ? "下一步可以把广告 spend 映射到 Google / Meta / TikTok 等经营渠道，进一步逼近真实净利润。" : "接下来可以把利润模块拆成‘整体利润’和‘渠道利润’两层，让判断更直接。",
  };

  const productModule: BusinessModule = {
    key: "productInventory",
    title: "商品与库存分析",
    subtitle: "直接用库存风险和退款 SKU 先拼出商品经营视角",
    source: diagnosis.hasData ? "real" : "pending",
    summary: "商品模块目前优先读取库存风险和高退款 SKU，先回答哪些商品会拖累经营、哪些商品值得优先处理。",
    metrics: [
      { label: "风险 SKU", value: formatNumber(diagnosis.summaryMetrics.riskSkuCount) },
      { label: "观察 SKU", value: formatNumber(diagnosis.summaryMetrics.watchSkuCount) },
      { label: "预计缺货损失", value: formatCurrency(diagnosis.summaryMetrics.estimatedInventoryLoss, currency) },
      { label: "Top 退款 SKU", value: diagnosis.detail.topRefundSkus[0]?.sku ?? "—" },
    ],
    chart: {
      title: "商品风险对象",
      kind: "table",
      items: diagnosis.detail.inventoryRisks.slice(0, 3).map((item) => ({
        label: item.sku,
        value: Math.max(10, item.estimatedLoss),
        display: formatCurrency(item.estimatedLoss, currency),
        note: `${item.title} / 可售 ${item.sellableDays ?? "∞"} 天`,
      })),
    },
    signals: [
      diagnosis.summaryMetrics.riskSkuCount > 0 ? "库存风险已经可以按 SKU 直接露出。" : "当前没有高风险库存 SKU。",
      diagnosis.detail.topRefundSkus.length > 0 ? "退款 SKU 也已经能作为商品问题的补充证据。" : "当前退款 SKU 分布还比较分散。",
    ],
    actionHint: "后续再把商品销量、利润和退款合并成更完整的商品经营矩阵。",
  };

  const customerModule: BusinessModule = {
    key: "customerValue",
    title: "客户价值分析",
    subtitle: "复用已存在的客户价值层，把分层和 LTV 先接进页面",
    source: customer ? "real" : "pending",
    summary: customer
      ? "客户价值层已经有规则版结果，可以先把复购、高价值占比和分层分布稳定展示出来。"
      : "客户价值层暂时还没有拿到可用结果，后续会优先接这块。",
    metrics: [
      { label: "复购率", value: formatPercent(customer?.repeatPurchaseRate) },
      { label: "平均动态 LTV", value: formatCurrency(customer?.averageDynamicLtv, currency) },
      { label: "高价值客户占比", value: formatPercent(customer?.highValueShare) },
      { label: "流失风险客户", value: formatNumber(customer ? customer.segmentCounts.at_risk + customer.segmentCounts.churned : null) },
    ],
    chart: {
      title: "客户分层",
      kind: "bars",
      items: customer
        ? [
            { label: "New", value: customer.payingCustomers > 0 ? (customer.segmentCounts.new / customer.payingCustomers) * 100 : 10, display: formatNumber(customer.segmentCounts.new) },
            { label: "Active", value: customer.payingCustomers > 0 ? (customer.segmentCounts.active / customer.payingCustomers) * 100 : 10, display: formatNumber(customer.segmentCounts.active) },
            { label: "VIP", value: customer.payingCustomers > 0 ? (customer.segmentCounts.vip / customer.payingCustomers) * 100 : 10, display: formatNumber(customer.segmentCounts.vip) },
            { label: "At Risk", value: customer.payingCustomers > 0 ? (customer.segmentCounts.at_risk / customer.payingCustomers) * 100 : 10, display: formatNumber(customer.segmentCounts.at_risk) },
          ]
        : [
            { label: "New", value: 10, display: "—" },
            { label: "Active", value: 10, display: "—" },
            { label: "VIP", value: 10, display: "—" },
            { label: "At Risk", value: 10, display: "—" },
          ],
    },
    signals: [
      customer ? `当前高价值客户占比为 ${formatPercent(customer.highValueShare)}。` : "需要先生成客户价值层结果。",
      customer ? `当前已分层 ${formatNumber(customer.payingCustomers)} 位有购买客户。 ` : "当前暂无可用客户分层基线。",
    ],
    actionHint: "客户价值模块后面很适合接 AI retention 建议，比如召回、复购和高价值维护。",
  };

  const channelModule: BusinessModule = {
    key: "channel",
    title: "渠道分析",
    subtitle: "复用现有渠道经营层，把收入、利润和客户质量放进同一张卡",
    source: channel || ads ? "estimated" : "pending",
    summary: channel || ads
      ? ads
        ? "渠道模块现在既能展示经营渠道收入/利润，也能补充广告平台 spend，虽然两者还没完全一一映射，但已经能一起看。"
        : "渠道经营层已经能输出收入、贡献利润和客户质量，是当前最像商业洞察底座的一块数据。"
      : "当前还没有拿到渠道经营结果，后续会优先接入。",
    metrics: [
      { label: "可归因收入占比", value: formatPercent(channel?.attributedRevenueShare) },
      { label: "最高收入渠道", value: topRevenueChannel?.label ?? "—" },
      { label: "最高利润渠道", value: topProfitChannel?.label ?? "—" },
      { label: "Top 投放平台", value: topAdsPlatform ? topAdsPlatform.platform : "—" },
    ],
    chart: {
      title: "渠道经营预览",
      kind: "table",
      items: (channel?.channels.slice(0, 4) ?? []).map((item) => ({
        label: item.label,
        value: Math.max(10, item.revenue),
        display: formatCurrency(item.revenue, currency),
        note: `利润率 ${formatPercent(item.contributionMarginPercent)} / 复购 ${formatPercent(item.customers.repeatCustomerShare)}`,
      })),
    },
    signals: [
      channel ? `当前已识别 ${formatNumber(channel.channels.length)} 个主要渠道。` : "渠道归因结果暂不可用。",
      ads
        ? `广告平台 spend 已接入：${ads.platformSummaries.map((item) => `${item.platform} ${formatCurrency(item.spend, currency)}`).join(" / ")}`
        : channel
          ? "当前 ROI 仍未包含广告投放成本，因此更适合作为经营渠道判断。"
          : "广告与归因层仍需继续补齐。",
    ],
    actionHint: ads ? "下一步是把广告平台 spend 尽量映射到 Google / Facebook / Instagram / TikTok 等经营渠道键值。" : "等广告成本接入后，这个模块就能从经营渠道视图升级成完整 ROI 视图。",
  };

  const siteExperienceModule: BusinessModule = {
    key: "siteExperience",
    title: "站点体验",
    subtitle: "把首页速度、稳定性和 SEO 风险纳入每日经营洞察，判断它是否在拖累转化",
    source: pageSpeedReport ? "real" : pageSpeed?.url ? "estimated" : "pending",
    summary: pageSpeedReport
      ? `当前已接入 ${pageSpeed?.strategy ?? "mobile"} 端的 PageSpeed 实验室数据，可以直接把站点体验当成每日经营判断的一部分。`
      : pageSpeed?.error
        ? "已识别店铺主域名，但本次未成功拿到 PageSpeed 结果，先保留站点体验模块结构。"
        : pageSpeed?.url
          ? "当前已经拿到可分析的店铺主域名，后续可继续稳定接入 PageSpeed 结果。"
          : "当前还没有可分析的店铺主域名，站点体验模块先保留占位。",
    metrics: [
      { label: "性能分", value: formatScore(pageSpeedPerformance?.score) },
      { label: "LCP", value: pageSpeedLcp?.displayValue ?? "—" },
      { label: "TBT", value: pageSpeedTbt?.displayValue ?? "—" },
      { label: "SEO", value: formatScore(pageSpeedSeo?.score) },
    ],
    chart: {
      title: "对象优先级",
      kind: "table",
      items: siteExperienceObjects,
    },
    signals: [
      pageSpeedReport
        ? `当前共有 ${formatNumber(pageSpeedPoorMetrics.length)} 个核心指标处于较差区间，${formatNumber(pageSpeedWarningMetrics.length)} 个指标仍有改善空间，CLS 为 ${pageSpeedCls?.displayValue ?? "—"}。`
        : pageSpeed?.error
          ? `PageSpeed 当前读取失败：${pageSpeed.error}`
          : "还没有拿到可用的 PageSpeed 结果。",
      topLandingPageUrl
        ? `${topLandingPath} 是当前主要 landing page，可以继续深钻这个页面的体验表现。`
        : "当前还没有可直接深钻的 landing page 页面对象。",
      pageSpeedLcp?.displayValue
        ? `如果首页或主 landing page 的 LCP 偏慢，广告和自然流量进来后会更容易流失。`
        : "当前还无法判断首屏加载是否在影响访客停留。",
      pageSpeedTbt?.displayValue
        ? `如果脚本阻塞时间偏高，访客在点击、滚动和结账时的体验会更卡，通常会直接拖低转化。`
        : "当前还无法判断脚本阻塞是否在影响交互体验。",
      pageSpeedTopOpportunity
        ? `当前最值得先修的是「${pageSpeedTopOpportunity.title}」。`
        : "当前没有明显的高优先级体验修复项。",
      pageSpeedReport
        ? `分析地址为 ${pageSpeedReport.finalUrl || pageSpeedReport.requestedUrl}。`
        : pageSpeed?.url
          ? `默认分析地址为 ${pageSpeed.url}。`
          : "待补店铺主域名后再做站点体验分析。",
    ],
    actionHint: pageSpeedReport
      ? "建议把站点体验和转化漏斗一起看，先确认速度问题是不是在拖累站内转化。"
      : "接入 PageSpeed 后，这个模块会成为判断‘为什么流量来了但没转化’的重要补充证据。",
  };

  const sharedModules = [
    trafficModule,
    siteExperienceModule,
    costModule,
    conversionModule,
    afterSalesModule,
    profitModule,
    productModule,
    customerModule,
    channelModule,
  ];

  const overallBusinessRoi =
    totalAdsSpend > 0 ? operatingProfitAfterAds / totalAdsSpend : null;
  const roiGrade = gradeBusinessRoiValue(overallBusinessRoi);
  const riskItems = diagnosis.items.filter((item) => item.status === "risk");
  const watchItems = diagnosis.items.filter((item) => item.status === "watch");
  const primaryConcern = riskItems[0] ?? watchItems[0] ?? null;
  const focusArea = primaryConcern
    ? diagnosisFocusLabel(primaryConcern.key)
    : overallBusinessRoi != null && overallBusinessRoi < 0
      ? "投放效率"
      : "利润扩张";
  const connectedSignals = [
    diagnosis.hasData,
    diagnosis.summaryMetrics.hasPixelData,
    Boolean(ga4?.connected),
    Boolean(ads),
    Boolean(channel),
    Boolean(customer),
    Boolean(pageSpeedReport),
  ].filter(Boolean).length;

  const reportActions: ReportRecommendedAction[] = [];
  if (diagnosis.summaryMetrics.riskSkuCount > 0) {
    reportActions.push(
      buildRecommendedAction({
        key: "inventory_risk",
        title: "先处理高风险 SKU",
        roiLayerLabel: "短期 ROI",
        summary: `当前已有 ${formatNumber(diagnosis.summaryMetrics.riskSkuCount)} 个高风险 SKU，潜在损失约 ${formatCurrency(diagnosis.summaryMetrics.estimatedInventoryLoss, currency)}。`,
        action: "优先补货、调投放或限制缺货商品继续消耗流量。",
        tone: diagnosis.summaryMetrics.estimatedInventoryLoss > 0 ? "negative" : "warning",
        targetModuleKeys: ["productInventory"],
        taskCandidate: {
          problemKey: "inventory_risk",
          sourceType: "rule",
          priority: "P0",
          quadrant: "q1",
          dueWindow: "today",
          ownerRole: "供应链/采购",
          primaryObjectId: "risk_sku",
          primaryObjectType: "inventory_cluster",
          objective: "用补货、限量或替代 SKU 方案控制缺货损失。",
          impactMetrics: ["可售天数", "缺货率", "保住的 GMV"],
          estimatedLift: "预计保护未来 7 天销售额，减少断货造成的收入流失。",
          confidence: "high",
          riskEnvironment: "库存供给",
          whyNow: `高风险 SKU 已经对应 ${formatCurrency(diagnosis.summaryMetrics.estimatedInventoryLoss, currency)} 的潜在损失，不先处理会继续漏损销售。`,
          roiImpactSummary: "先止住缺货和错配流量，直接保护短期 ROI。",
        },
        href: buildInsightsChartsHref({
          group: "merchandising_ops",
          card: "inventory_flow",
          extra: {
            focusCard: "inventory_flow",
            focusLabel: topInventoryRisk?.sku,
          },
        }),
      }),
    );
  }
  if (
    diagnosis.summaryMetrics.refundRateDelta > 0 ||
    diagnosis.summaryMetrics.carrierIssueCount > 0
  ) {
    const focusSku = topRefundSku?.sku;
    reportActions.push(
      buildRecommendedAction({
        key: "after_sales_risk",
        title: "先止住退款与履约损耗",
        roiLayerLabel: "短期 ROI",
        summary: `退款率正在恶化 ${formatSignedPercentPoint(diagnosis.summaryMetrics.refundRateDelta)}，${diagnosis.summaryMetrics.carrierIssueCount > 0 ? `同时有 ${formatNumber(diagnosis.summaryMetrics.carrierIssueCount)} 个物流异常对象。` : "已经开始侵蚀利润。"}`
          ,
        action: focusSku
          ? `优先复盘 ${focusSku} 与相关异常订单，确认退款、履约或物流问题来自哪里。`
          : "优先排查高退款对象、超时订单和物流异常链路。",
        tone:
          diagnosis.summaryMetrics.refundRateDelta > 1 || diagnosis.summaryMetrics.carrierIssueCount > 0
            ? "negative"
            : "warning",
        targetModuleKeys: ["afterSales", "productInventory"],
        taskCandidate: {
          problemKey: "after_sales_risk",
          sourceType: "rule",
          priority:
            diagnosis.summaryMetrics.refundRateDelta > 1 ||
            diagnosis.summaryMetrics.carrierIssueCount > 0
              ? "P0"
              : "P1",
          quadrant: "q1",
          dueWindow: "48h",
          ownerRole: "运营/售后",
          primaryObjectId: focusSku ?? "refund_fulfillment",
          primaryObjectType: focusSku ? "sku" : "risk_cluster",
          objective: "复盘退款异常并修正商品、物流或售后策略。",
          impactMetrics: ["退款率", "差评风险", "复购率"],
          estimatedLift: "若根因处理到位，预计 1~2 周内退款风险下降 5%~10%。",
          confidence:
            diagnosis.summaryMetrics.refundRateDelta > 1 ||
            diagnosis.summaryMetrics.carrierIssueCount > 0
              ? "high"
              : "medium",
          riskEnvironment: "售后与履约",
          whyNow: `退款和履约问题已经在扩大损耗，${diagnosis.summaryMetrics.carrierIssueCount > 0 ? "而且还有物流异常对象需要同步处理。" : "如果继续放大，会直接侵蚀利润。"}`
            ,
          roiImpactSummary: "先止住退款和履约损耗，保护短期利润与 ROI。",
        },
        href: buildInsightsChartsHref({
          group: "merchandising_ops",
          card: "fulfillment_refund",
          extra: {
            focusCard: "fulfillment_refund",
            focusLabel: focusSku,
          },
        }),
      }),
    );
  }
  if (
    diagnosis.summaryMetrics.conversionRate7d != null &&
    diagnosis.summaryMetrics.conversionRatePrev7d != null &&
    diagnosis.summaryMetrics.conversionRate7d <= diagnosis.summaryMetrics.conversionRatePrev7d
  ) {
    reportActions.push(
      buildRecommendedAction({
        key: "conversion_repair",
        title: "先修站内转化链路",
        roiLayerLabel: "回收速度",
        summary: `当前 CVR 没有好转，${ga4TopLanding ? `${normalizeGa4Key(ga4TopLanding.key, "/")} 承接页` : "核心商品页"} 需要优先复盘。`,
        action: "先看漏斗掉点、支付成功率和 landing page 承接，而不是继续盲目加流量。",
        tone: "warning",
        targetModuleKeys: ["conversion"],
        taskCandidate: {
          problemKey: "conversion_repair",
          sourceType: "rule",
          priority: "P1",
          quadrant: "q1",
          dueWindow: "today",
          ownerRole: "运营/站点",
          primaryObjectId: ga4TopLanding?.key ?? "conversion_funnel",
          primaryObjectType: ga4TopLanding ? "landing_page" : "flow",
          objective: "先拆清流量和转化问题，再决定是优化渠道、商品页还是站内路径。",
          impactMetrics: ["会话数", "转化率", "支付成功率"],
          estimatedLift: "预计带动关键漏斗指标改善 3%~8%。",
          confidence: ga4TopLanding ? "high" : "medium",
          riskEnvironment: "站内转化",
          whyNow: "当前回收速度已经被站内转化链路拖慢，继续加流量只会放大低转化问题。",
          roiImpactSummary: "先修漏斗承接和支付成功率，再决定是否继续扩量。",
        },
        href: buildInsightsChartsHref({ group: "conversion", card: "funnel" }),
      }),
    );
  }
  if (ads && topAdsPlatform) {
    const shouldStopLoss = topAdsPlatform.roas != null && topAdsPlatform.roas < 1;
    reportActions.push(
      buildRecommendedAction({
        key: "ads_budget",
        title:
          shouldStopLoss
            ? `压缩 ${topAdsPlatform.platform} 低效投放`
            : `把预算集中到 ${topAdsPlatform.platform}`,
        roiLayerLabel: "短期 ROI",
        summary:
          shouldStopLoss
            ? `当前平台 ROAS 只有 ${formatNumber(topAdsPlatform.roas, 2)}，已经开始稀释经营利润。`
            : `${topAdsPlatform.platform} 当前仍是最值得优先看的投放平台。`,
        action:
          shouldStopLoss
            ? "先关掉低效广告组，再把预算回收到更稳的渠道和对象。"
            : "优先把预算集中到高质量广告组，减少低质量流量对利润的稀释。",
        tone: shouldStopLoss ? "negative" : "warning",
        targetModuleKeys: ["channel", "profit"],
        taskCandidate: {
          problemKey: shouldStopLoss ? "ad_burn" : "budget_reallocation",
          sourceType: "hybrid",
          priority: shouldStopLoss ? "P0" : "P1",
          quadrant: shouldStopLoss ? "q1" : "q3",
          dueWindow: shouldStopLoss ? "today" : "this_week",
          ownerRole: "运营/投放",
          primaryObjectId: topAdsPlatform.platform,
          primaryObjectType: "ad_platform",
          objective: shouldStopLoss
            ? "压缩低效投放，把预算回收到更稳的渠道和对象。"
            : "把预算集中到高质量广告组和更稳的渠道对象。",
          impactMetrics: ["ROAS", "经营利润", "渠道效率"],
          estimatedLift: shouldStopLoss
            ? "先止住低效预算消耗，再把预算回收到更稳的渠道对象。"
            : "预计改善稳定回收，并减少低质量流量对利润的稀释。",
          confidence: topAdsPlatform.roas != null ? "high" : "medium",
          riskEnvironment: "投放效率",
          whyNow: shouldStopLoss
            ? `${topAdsPlatform.platform} 当前已经开始以低效率消耗预算，需要先止损。`
            : `${topAdsPlatform.platform} 已经表现出更高的质量，可以开始做结构性预算倾斜。`,
          roiImpactSummary: shouldStopLoss
            ? "先关停低效投放，直接修复短期 ROI。"
            : "把预算集中到高质量广告组，更容易放大稳定回收。",
        },
        href: buildInsightsChartsHref({ group: "roi", card: "channel_roi" }),
      }),
    );
  }
  if (pageSpeedPerformance?.score != null && pageSpeedPerformance.score < 90) {
    const isCriticalExperienceIssue = pageSpeedPerformance.score < 50;
    reportActions.push(
      buildRecommendedAction({
        key: "site_experience",
        title: "先修站点体验问题",
        roiLayerLabel: "回收速度",
        summary:
          pageSpeedTopOpportunity
            ? `当前最值得先修的是「${pageSpeedTopOpportunity.title}」，站点体验已经在拖累转化。`
            : `当前移动端性能分只有 ${formatScore(pageSpeedPerformance.score)}，体验已经进入经营判断。`,
        action: "先复盘首页速度、阻塞资源和关键体验问题，再判断是否拖累站内转化。",
        tone: isCriticalExperienceIssue ? "negative" : "warning",
        targetModuleKeys: ["siteExperience", "conversion"],
        taskCandidate: {
          problemKey: "site_experience",
          sourceType: "hybrid",
          priority: isCriticalExperienceIssue ? "P1" : "P2",
          quadrant: isCriticalExperienceIssue ? "q1" : "q3",
          dueWindow: isCriticalExperienceIssue ? "today" : "this_week",
          ownerRole: "运营/前端",
          primaryObjectId: topLandingPath ?? "storefront_experience",
          primaryObjectType: topLandingPath ? "landing_page" : "experience_surface",
          objective: "优先处理关键站点体验问题，避免主要页面继续漏损转化。",
          impactMetrics: ["PageSpeed 性能分", "LCP", "站内转化率"],
          estimatedLift: "若关键体验问题被修复，通常会先改善主要承接页的转化表现。",
          confidence: pageSpeedTopOpportunity ? "high" : "medium",
          riskEnvironment: "站点体验",
          whyNow: pageSpeedTopOpportunity
            ? `「${pageSpeedTopOpportunity.title}」已经成为当前最明显的体验瓶颈。`
            : "站点体验已经进入经营判断，继续放着不管会拖慢回收。",
          roiImpactSummary: "站点体验会直接影响 landing page 承接和回收速度。",
        },
        href: buildInsightsChartsHref({
          group: "conversion",
          card: "site_experience",
          extra: {
              pageSpeedUrl: primaryStorefrontUrl,
          },
        }),
      }),
    );
  }
  if (topLandingPageUrl) {
    reportActions.push(
      buildRecommendedAction({
        key: "landing_experience",
        title: "单独复盘主要 Landing Page",
        roiLayerLabel: "回收速度",
        summary: `${topLandingPath} 当前承接了主要流量，需要单独确认页面体验是否在漏损转化。`,
        action: "优先检查首屏速度、关键信息承接和交互阻塞，确认这条链路是否在掉量。",
        tone: "warning",
        targetModuleKeys: ["siteExperience", "conversion", "traffic"],
        taskCandidate: {
          problemKey: "landing_experience",
          sourceType: "hybrid",
          priority: "P1",
          quadrant: "q3",
          dueWindow: "this_week",
          ownerRole: "运营/前端",
          primaryObjectId: topLandingPath ?? "top_landing_page",
          primaryObjectType: "landing_page",
          objective: "单独复盘主要 landing page 的承接问题，优先优化最核心的入口页面。",
          impactMetrics: ["Landing Page 会话数", "Landing Page 转化率", "首屏速度"],
          estimatedLift: "主要承接页优化通常最容易先抬升回收速度。",
          confidence: "medium",
          riskEnvironment: "站内转化",
          whyNow: `${topLandingPath} 已经是当前主要承接页，优先级足够高，值得单独复盘。`,
          roiImpactSummary: "主要承接页体验改善最容易先抬升回收速度。",
        },
        href: buildInsightsChartsHref({
          group: "conversion",
          card: "landing_page",
          extra: {
            landingPage: topLandingPath,
            pageSpeedUrl: topLandingPageUrl,
            focusCard: "landing_page",
            focusLabel: topLandingPath,
          },
        }),
      }),
    );
  }
  if (reportActions.length === 0) {
    reportActions.push(
      buildRecommendedAction({
        key: "growth_focus",
        title: "放大利润与高价值客群",
        roiLayerLabel: customer ? "长期价值" : "短期 ROI",
        summary: "当前没有明显的紧急止损项，可以把精力放在更稳的增长动作上。",
        action: customer
          ? "优先围绕高价值客户、复购和高质量渠道做放大。"
          : "优先围绕利润更稳的渠道和商品做结构优化。",
        tone: "positive",
        targetModuleKeys: customer ? ["customerValue", "channel"] : ["profit", "channel"],
        taskCandidate: {
          problemKey: "growth_focus",
          sourceType: "hybrid",
          priority: "P2",
          quadrant: "q3",
          dueWindow: "this_week",
          ownerRole: customer ? "运营/CRM" : "运营",
          primaryObjectId: customer ? "high_value_customers" : "profit_structure",
          primaryObjectType: customer ? "customer_segment" : "profit_cluster",
          objective: customer
            ? "围绕高价值客户、复购和高质量渠道做结构性放大。"
            : "围绕利润更稳的渠道和商品做结构优化。",
          impactMetrics: customer
            ? ["高价值客户占比", "复购率", "渠道利润"]
            : ["经营利润", "渠道质量", "商品利润"],
          estimatedLift: customer
            ? "预计改善长期价值和更稳的预算回收。"
            : "预计改善整体经营质量，并减少资源错配。",
          confidence: customer ? "medium" : "low",
          riskEnvironment: customer ? "客户价值增长" : "利润结构优化",
          whyNow: "当前没有明显的紧急止损项，可以开始做结构优化和增长放大。",
          roiImpactSummary: customer
            ? "围绕高价值客户和复购经营，更容易放大长期 ROI。"
            : "把资源向更稳的利润渠道和商品倾斜，改善整体经营质量。",
        },
        href: buildInsightsChartsHref({ group: "roi", card: "channel_roi" }),
      }),
    );
  }

  const reportFocus = [
    primaryConcern
      ? `当前最该盯的是 ${focusArea}：${primaryConcern.reasoning[0] ?? primaryConcern.evidence[0] ?? primaryConcern.name}。`
      : overallBusinessRoi != null
        ? `当前经营 ROI 为 ${formatSignedPercent(overallBusinessRoi * 100)}，先围绕利润扩张和预算分配做判断。`
        : "广告成本还没有完整映射到经营渠道，因此当前 ROI 先作为方向性参考。",
    topProfitChannel
      ? `${topProfitChannel.label} 当前贡献利润最高，为 ${formatCurrency(topProfitChannel.contributionProfit, currency)}。`
      : "当前还没有足够的渠道利润对比样本。",
    pageSpeedPerformance?.score != null
      ? `站点体验当前性能分为 ${formatScore(pageSpeedPerformance.score)}，${pageSpeedPoorMetrics.length > 0 ? `其中 ${pageSpeedPoorMetrics[0]?.title ?? "核心指标"} 已经进入较差区间。` : "暂未看到明显的性能爆雷。"}`
      : "站点体验结果暂不可用，当前日报先以利润和漏斗为主。",
    customer
      ? `高价值客户占比 ${formatPercent(customer.highValueShare)}，平均动态 LTV 为 ${formatCurrency(customer.averageDynamicLtv, currency)}。`
      : "客户价值层还在补齐中，当前日报先以利润和漏斗为主。",
  ];

  const reportInsights: InsightListItem[] = diagnosis.items
    .filter((item) => item.status !== "healthy")
    .slice(0, 4)
    .map((item) => ({
      title: item.name,
      confidence: mapInsightConfidence(item.evidence.length, item.reasoning.length),
      metric: Object.keys(item.metrics).slice(0, 2).join(" / ") || "经营诊断",
      detail: item.reasoning[0] ?? item.evidence[0] ?? "建议进入详情继续排查。",
      tone: mapInsightTone(item.status),
      targetKey:
        item.key === "traffic_anomaly"
          ? "traffic"
          : item.key === "conversion_health"
            ? "conversion"
            : item.key === "refund_health"
              ? "afterSales"
              : item.key === "inventory_health"
                ? "productInventory"
                : item.key === "sales_trend"
                  ? "profit"
                  : item.key === "product_operations"
                    ? "productInventory"
                    : item.key === "fulfillment_health" || item.key === "logistics_anomaly"
                      ? "afterSales"
                      : undefined,
      href:
        item.key === "traffic_anomaly" ||
        item.key === "conversion_health" ||
        item.key === "refund_health" ||
        item.key === "inventory_health" ||
        item.key === "fulfillment_health" ||
        item.key === "logistics_anomaly"
          ? item.key === "traffic_anomaly"
            ? buildInsightsChartsHref({ group: "acquisition", card: "traffic_scale" })
            : item.key === "conversion_health"
              ? buildInsightsChartsHref({ group: "conversion", card: "funnel" })
              : item.key === "inventory_health"
                ? buildInsightsChartsHref({
                    group: "merchandising_ops",
                    card: "inventory_flow",
                    extra: {
                      focusCard: "inventory_flow",
                      focusLabel: topInventoryRisk?.sku,
                    },
                  })
                : buildInsightsChartsHref({
                    group: "merchandising_ops",
                    card: "fulfillment_refund",
                    extra: {
                      focusCard: "fulfillment_refund",
                      focusLabel: topRefundSku?.sku,
                    },
                  })
          : undefined,
    }));

  if (pageSpeedPerformance?.score != null && pageSpeedPerformance.score < 90) {
    reportInsights.unshift({
      title:
        pageSpeedPerformance.score < 50
          ? "站点体验正在拖累站内转化"
          : "站点体验还有明显优化空间",
      confidence: pageSpeedPoorMetrics.length > 0 ? "高" : "中",
      metric: `性能分 ${formatScore(pageSpeedPerformance.score)} / LCP ${pageSpeedLcp?.displayValue ?? "—"}`,
      detail:
        pageSpeedTopOpportunity?.description ??
        "建议进入 PageSpeed 详情，先确认首页速度和阻塞资源是否在影响经营结果。",
      tone: pageSpeedPerformance.score < 50 ? "critical" : "warning",
      targetKey: "siteExperience",
      href: buildInsightsChartsHref({
        group: "conversion",
        card: "site_experience",
        extra: {
          pageSpeedUrl: primaryStorefrontUrl,
        },
      }),
    });
  }

  if (topLandingPageHref && topLandingPath) {
    reportInsights.unshift({
      title: "主要 landing page 需要单独检查体验",
      confidence: "中",
      metric: `主 landing page ${topLandingPath}`,
      detail: "这个页面承接了当前最多流量，建议单独用 PageSpeed 复盘其首屏和交互体验。",
      tone: "info",
      targetKey: "siteExperience",
      href: buildInsightsChartsHref({
        group: "conversion",
        card: "landing_page",
        extra: {
          landingPage: topLandingPath,
          pageSpeedUrl: topLandingPageUrl,
          focusCard: "landing_page",
          focusLabel: topLandingPath,
        },
      }),
    });
  }

  const reportDrilldowns: DrilldownEntry[] = [
    {
      key: "refund",
      title: "退款详情",
      detail: topRefundSku
        ? `先看 ${topRefundSku.sku} 的退款金额、原因聚类与关联售后异常。`
        : "看异常退款订单、退款 SKU 和退款原因聚类。",
      badge: topRefundSku ? `${topRefundSku.sku} / ${formatPercent(diagnosis.summaryMetrics.refundRate30d)}` : `${formatPercent(diagnosis.summaryMetrics.refundRate30d)} 退款率`,
      href: buildInsightsChartsHref({
        group: "merchandising_ops",
        card: "fulfillment_refund",
        extra: {
          focusCard: "fulfillment_refund",
          focusLabel: topRefundSku?.sku,
        },
      }),
    },
    {
      key: "inventory",
      title: "库存详情",
      detail: topInventoryRisk
        ? `先看 ${topInventoryRisk.sku} 的可售天数与预计损失，再判断补货或限流。`
        : "看风险 SKU、可售天数和预计损失。",
      badge: topInventoryRisk ? `${topInventoryRisk.sku} 优先` : `${formatNumber(diagnosis.summaryMetrics.riskSkuCount)} 个风险 SKU`,
      href: buildInsightsChartsHref({
        group: "merchandising_ops",
        card: "inventory_flow",
        extra: {
          focusCard: "inventory_flow",
          focusLabel: topInventoryRisk?.sku,
        },
      }),
    },
    {
      key: "fulfillment",
      title: "履约与物流",
      detail: "看超时未发货、物流异常和关联售后问题。",
      badge: `${formatNumber(diagnosis.summaryMetrics.overdueOrderCount + diagnosis.summaryMetrics.carrierIssueCount)} 个异常对象`,
      href: buildInsightsChartsHref({
        group: "merchandising_ops",
        card: "fulfillment_refund",
      }),
    },
    {
      key: "channel",
      title: "渠道 ROI",
      detail: topProfitChannel
        ? `优先看 ${topProfitChannel.label} 的利润表现，再决定是否继续放大。`
        : "看收入、利润和值得继续投的渠道。",
      badge: topProfitChannel ? `${topProfitChannel.label} 最稳` : "经营复盘",
      href: buildInsightsChartsHref({
        group: "roi",
        card: "channel_roi",
        extra: {
          focusCard: "channel_roi",
          focusLabel: topProfitChannel?.label,
        },
      }),
    },
    {
      key: "pagespeed",
      title: "站点体验 / PageSpeed",
      detail: "看移动端性能、SEO 和最值得先修的体验问题。",
      badge:
        pageSpeedPerformance?.score != null
          ? `性能 ${formatScore(pageSpeedPerformance.score)}`
          : pageSpeed?.error
            ? "读取异常"
            : "待分析",
      href: buildInsightsChartsHref({
        group: "conversion",
        card: "site_experience",
        extra: {
            pageSpeedUrl: primaryStorefrontUrl,
        },
      }),
    },
    ...(topLandingPageHref && topLandingPath
      ? [
          {
            key: "landing-pagespeed",
            title: "Top Landing 体验",
            detail: `直接检查 ${topLandingPath} 的首屏与交互体验，确认主要承接页是否在漏损流量。`,
            badge: "对象深钻",
            href: buildInsightsChartsHref({
              group: "conversion",
              card: "landing_page",
              extra: {
                landingPage: topLandingPath,
                pageSpeedUrl: topLandingPageUrl,
                focusCard: "landing_page",
                focusLabel: topLandingPath,
              },
            }),
          } satisfies DrilldownEntry,
        ]
      : []),
  ];

  const insightByTargetKey = new Map<string, InsightListItem>();
  reportInsights.forEach((item) => {
    if (item.targetKey && !insightByTargetKey.has(item.targetKey)) {
      insightByTargetKey.set(item.targetKey, item);
    }
  });

  const moduleByKey = new Map(sharedModules.map((item) => [item.key, item]));
  const conversionRoiModule = moduleByKey.get("conversion");
  const siteExperienceRoiModule = moduleByKey.get("siteExperience");
  const customerValueRoiModule = moduleByKey.get("customerValue");
  const channelRoiModuleForReport = moduleByKey.get("channel");

  const paybackTone =
    insightByTargetKey.get("conversion")?.tone ?? insightByTargetKey.get("siteExperience")?.tone;
  const lifetimeTone =
    insightByTargetKey.get("customerValue")?.tone ?? insightByTargetKey.get("channel")?.tone;
  const shortTermRoiAssessment = buildShortTermRoiAssessment({
    overallBusinessRoi,
    hasAds: Boolean(ads),
    hasChannel: Boolean(channel),
    hasDiagnosis: diagnosis.hasData,
  });
  const paybackRoiAssessment = buildPaybackRoiAssessment({
    conversionSource: conversionRoiModule?.source,
    siteExperienceSource: siteExperienceRoiModule?.source,
    ga4Connected: Boolean(ga4?.connected),
  });
  const lifetimeRoiAssessment = buildLifetimeRoiAssessment({
    customerSource: customerValueRoiModule?.source,
    channelSource: channelRoiModuleForReport?.source,
  });

  const reportRoiLayers: ReportRoiLayerCard[] = [
    {
      key: "short_term",
      title: "短期 ROI",
      value:
        overallBusinessRoi != null
          ? `${roiGrade.label} / ${formatSignedPercent(overallBusinessRoi * 100)}`
          : "待接广告成本",
      detail:
        overallBusinessRoi != null
          ? `经营利润 ${formatCurrency(operatingProfitAfterAds, currency)}`
          : "当前只能先读贡献利润与渠道质量",
      dataQuality: shortTermRoiAssessment.dataQuality,
      confidence: shortTermRoiAssessment.confidence,
      tone: roiGrade.tone,
    },
    {
      key: "payback",
      title: "回收速度",
      value:
        paybackTone === "critical"
          ? "Slow"
          : paybackTone === "warning"
            ? "Normal"
            : "Fast",
      detail:
        conversionRoiModule && siteExperienceRoiModule
          ? `${conversionRoiModule.metrics[0]?.label ?? "CVR"} ${conversionRoiModule.metrics[0]?.value ?? "—"} / ${siteExperienceRoiModule.metrics[0]?.label ?? "性能分"} ${siteExperienceRoiModule.metrics[0]?.value ?? "—"}`
          : conversionRoiModule
            ? `${conversionRoiModule.metrics[0]?.label ?? "CVR"} ${conversionRoiModule.metrics[0]?.value ?? "—"}`
            : "先看转化漏斗和站点体验是否拖慢回收。",
      dataQuality: paybackRoiAssessment.dataQuality,
      confidence: paybackRoiAssessment.confidence,
      tone: mapInsightToneToReportTone(paybackTone),
    },
    {
      key: "lifetime",
      title: "长期价值",
      value:
        customerValueRoiModule?.source === "pending"
          ? "待补客户价值"
          : lifetimeTone === "critical"
            ? "Low"
            : lifetimeTone === "warning"
              ? "Medium"
              : "High",
      detail:
        customerValueRoiModule && channelRoiModuleForReport
          ? `${customerValueRoiModule.metrics[0]?.label ?? "复购率"} ${customerValueRoiModule.metrics[0]?.value ?? "—"} / ${channelRoiModuleForReport.metrics[1]?.label ?? "最高收入渠道"} ${channelRoiModuleForReport.metrics[1]?.value ?? "—"}`
          : customerValueRoiModule
            ? `${customerValueRoiModule.metrics[0]?.label ?? "复购率"} ${customerValueRoiModule.metrics[0]?.value ?? "—"}`
            : "客户价值层未完全就绪，先用渠道质量做方向判断。",
      dataQuality: lifetimeRoiAssessment.dataQuality,
      confidence: lifetimeRoiAssessment.confidence,
      tone: mapInsightToneToReportTone(lifetimeTone),
    },
  ];

  const factorCards: FactorDiagnosisCard[] = sharedModules.map((module) => {
    const linkedInsight = insightByTargetKey.get(module.key);
    const tone =
      linkedInsight?.tone ??
      (module.source === "pending"
        ? "warning"
        : module.source === "estimated"
          ? "warning"
          : "info");

    return {
      key: module.key,
      title: getFactorTitle(module.key),
      statusLabel: getFactorStatusLabel(tone),
      roiLayerLabel: getFactorRoiLayerLabel(module.key),
      summary: linkedInsight?.title ?? module.summary,
      evidence: module.metrics.slice(0, 2).map((metric) => `${metric.label} ${metric.value}`),
      comparison: buildFactorComparison(module),
      impactPath: buildFactorImpactPath(module.key),
      action: linkedInsight?.detail ?? module.actionHint,
      source: module.source,
      tone: mapInsightToneToReportTone(tone),
      href: linkedInsight?.href ?? getModuleDrilldownHref(module.key),
    };
  });

  const reportTaskPipeline = buildReportTaskCandidatePipeline(reportActions);
  const reportGenerationTrace = buildReportGenerationTrace({
    modules: sharedModules,
    factorCards,
    actions: reportActions,
    insights: reportInsights,
  });

  const report: SnapshotReport = {
    summary:
      ads && overallBusinessRoi != null
        ? `当前日报已经可以围绕 ROI 来读：先看经营利润，再看 ${focusArea} 是否拖累 ROI。`
        : "当前日报已经可以围绕利润和关键环节来读，广告成本进一步映射后会升级成更完整的 ROI 口径。",
    cards: [
      {
        label: "经营 ROI",
        value:
          overallBusinessRoi != null
            ? `${roiGrade.label} / ${formatSignedPercent(overallBusinessRoi * 100)}`
            : "待接广告成本",
        detail:
          overallBusinessRoi != null
            ? `经营利润 ${formatCurrency(operatingProfitAfterAds, currency)}`
            : "当前只能先读贡献利润与渠道质量",
        tone: roiGrade.tone,
      },
      {
        label: "当前卡点",
        value: focusArea,
        detail:
          primaryConcern?.reasoning[0] ??
          primaryConcern?.evidence[0] ??
          "当前没有明显的单点故障，优先看利润结构。",
        tone: riskItems.length > 0 ? "negative" : watchItems.length > 0 ? "warning" : "neutral",
      },
      {
        label: "数据可信度",
        value: connectedSignals >= 4 ? "高" : connectedSignals >= 2 ? "中" : "低",
        detail: `已接入 ${connectedSignals} 个关键数据信号`,
        tone: reportToneFromConfidence(connectedSignals),
      },
    ],
    roiLayers: reportRoiLayers,
    factorCards,
    insights: reportInsights.length > 0 ? reportInsights.slice(0, 4) : mockReport7d.insights,
    drilldowns: reportDrilldowns,
    focus: reportFocus,
    actions: reportActions.slice(0, 4),
    taskPipeline: reportTaskPipeline,
    generationTrace: reportGenerationTrace,
    narratives: [
      {
        title: "风险",
        body: primaryConcern
          ? `${focusArea} 是当前的首要风险点。${primaryConcern.evidence[0] ?? primaryConcern.reasoning[0] ?? "建议优先处理该环节。"}`
          : overallBusinessRoi != null && overallBusinessRoi < 0
            ? `当前广告投入后经营利润为 ${formatCurrency(operatingProfitAfterAds, currency)}，ROI 已转负，优先控制低效投放。`
            : "当前没有出现明显的单点爆雷，更多是结构优化问题。",
      },
      {
        title: "机会",
        body: topProfitChannel
          ? `${topProfitChannel.label} 是当前最稳的利润来源。${customer ? `同时高价值客户占比为 ${formatPercent(customer.highValueShare)}，适合围绕复购和高质量渠道继续放大。` : "可以优先把预算和资源向这类高质量渠道倾斜。"}`
          : ga4TopLanding
            ? `${normalizeGa4Key(ga4TopLanding.key, "/")} 已经是当前主要 landing page，优化这条链路通常最容易先撬动整体转化。`
            : "当前最现实的机会是先把已有真实数据整理成稳定日报，再逐步上 AI 洞察。",
      },
      {
        title: "建议动作",
        body: reportActions
          .slice(0, 2)
          .map((item) => item.action)
          .join(" "),
      },
    ],
    charts: [
      {
        title: "ROI 拆解",
        kind: "bars",
        items: [
          { label: "收入", value: 100, display: formatCurrency(channel?.totalRevenue ?? diagnosis.summaryMetrics.revenue30d, currency) },
          {
            label: "货品成本",
            value: clampChartShare(
              channel?.totalRevenue ? (totalCogs / channel.totalRevenue) * 100 : null,
            ),
            display: formatCurrency(totalCogs, currency),
          },
          {
            label: "售后/支付/折扣",
            value: clampChartShare(
              channel?.totalRevenue
                ? ((totalPaymentFees + totalDiscountCost + totalRefundLoss) / channel.totalRevenue) * 100
                : null,
            ),
            display: formatCurrency(totalPaymentFees + totalDiscountCost + totalRefundLoss, currency),
          },
          {
            label: "广告花费",
            value: clampChartShare(
              channel?.totalRevenue ? (totalAdsSpend / channel.totalRevenue) * 100 : null,
            ),
            display: formatCurrency(totalAdsSpend, currency),
          },
          {
            label: "经营利润",
            value: clampChartShare(
              channel?.totalRevenue
                ? (Math.abs(operatingProfitAfterAds) / channel.totalRevenue) * 100
                : null,
            ),
            display: formatCurrency(operatingProfitAfterAds, currency),
            note: operatingProfitAfterAds >= 0 ? "扣广告后" : "已转负",
          },
        ],
      },
      {
        title: "渠道优先级",
        kind: "table",
        items: (channel?.channels.slice(0, 4) ?? []).map((item) => ({
          label: item.label,
          value: Math.max(10, item.revenue),
          display: formatCurrency(item.revenue, currency),
          note:
            item.roi.businessRoi != null
              ? `利润 ${formatCurrency(item.contributionProfit, currency)} / ROI ${formatSignedPercent(item.roi.businessRoi * 100)}`
              : `利润 ${formatCurrency(item.contributionProfit, currency)} / ${item.roi.confidence} 置信度`,
        })),
      },
    ],
  };

  return {
    "7d": {
      summary:
        "当前页面已经开始接入 Spark 现有的真实经营数据：转化、售后、利润、客户价值和渠道层优先落地，缺失来源继续保留占位。",
      metricAccent: "先接真实数据，再逐步压缩成 AI 可消费的模块摘要。",
      topMetrics: [
        { label: "近 7 天销售额", value: formatCurrency(diagnosis.summaryMetrics.salesAmount7d, currency), unit: diagnosis.summaryMetrics.salesGrowthRate != null ? `较上期 ${diagnosis.summaryMetrics.salesGrowthRate >= 0 ? "+" : ""}${formatNumber(diagnosis.summaryMetrics.salesGrowthRate, 1)}%` : "上期暂无基线" },
        { label: ads ? "经营利润" : "贡献利润", value: formatCurrency(ads ? operatingProfitAfterAds : totalContributionProfit, currency), unit: ads ? `已扣 ${ads.rangeDays} 天广告花费` : channel?.totalRevenue ? `利润率 ${formatPercent((totalContributionProfit / channel.totalRevenue) * 100)}` : "来自近 30 天渠道层" },
        { label: "整体转化率", value: formatPercent(diagnosis.summaryMetrics.conversionRate7d), unit: `支付成功率 ${formatPercent(diagnosis.summaryMetrics.paymentSuccessRate7d)}` },
        { label: "退款率", value: formatPercent(diagnosis.summaryMetrics.refundRate30d), unit: `物流异常 ${formatNumber(diagnosis.summaryMetrics.carrierIssueCount)} 单` },
        { label: "高风险 SKU", value: formatNumber(diagnosis.summaryMetrics.riskSkuCount), unit: `预计损失 ${formatCurrency(diagnosis.summaryMetrics.estimatedInventoryLoss, currency)}` },
      ],
      coverage: [
        { label: "Shopify 订单/退款/库存", value: diagnosis.hasData ? "已接入" : "暂无数据", source: diagnosis.hasData ? "real" : "pending" },
        { label: "Pixel 漏斗", value: diagnosis.summaryMetrics.hasPixelData ? "已接入" : "未检测到", source: diagnosis.summaryMetrics.hasPixelData ? "real" : "estimated" },
        { label: "GA4 来源/页面", value: ga4?.connected ? `已接入 ${ga4.propertyCount} 个属性` : ga4?.error ? "连接异常" : "未连接", source: ga4?.connected ? "real" : "estimated" },
        { label: "广告花费", value: ads ? `已接入 ${ads.platformSummaries.length} 个平台` : "未连接", source: ads ? "real" : "estimated" },
        { label: "站点体验 / PageSpeed", value: pageSpeedPerformance?.score != null ? `性能 ${formatScore(pageSpeedPerformance.score)}` : pageSpeed?.error ? "读取异常" : pageSpeed?.url ? "待分析" : "未识别店铺域名", source: pageSpeedReport ? "real" : pageSpeed?.url ? "estimated" : "pending" },
        { label: "客户价值层", value: customer ? "已接入" : "待生成", source: customer ? "real" : "pending" },
        { label: "渠道经营层", value: channel ? "已接入" : "待生成", source: channel ? "estimated" : "pending" },
      ],
      highlights: [
        "售后、利润、客户价值和渠道模块已经优先切到真实数据。",
        ga4?.connected ? "流量模块已经接入 GA4 的来源与 landing page 维度。" : "流量与转化目前先复用 Pixel / diagnosis 口径，来源维度还未完整。",
        pageSpeedPerformance?.score != null ? `站点体验模块已接入移动端 PageSpeed，当前性能分 ${formatScore(pageSpeedPerformance.score)}。` : "站点体验模块已预留，后续会稳定接入 PageSpeed 结果。",
        ads ? "广告花费已经并入成本和利润判断，但渠道映射仍是近似版。" : "成本与渠道还属于半真实数据，因为广告花费暂未并入。",
      ],
      nextSteps: [
        "把站点体验和转化漏斗联动起来，判断速度是否在拖累站内转化。",
        "继续把流量模块接到 GA4 更多维度。",
        "把广告 spend 进一步映射到经营渠道层。",
        "再基于这些真实模块摘要生成 AI 风险、机会和动作建议。",
      ],
      report,
      modules: sharedModules,
    },
    "30d": {
      summary:
        "30 天视角更适合看结构：渠道、利润、客户价值和售后当前比流量来源更成熟，因此先优先展示这些已有真实层。",
      metricAccent: "短周期看波动，长周期看结构；当前真实数据优先支持结构层。",
      topMetrics: [
        { label: "近 30 天销售额", value: formatCurrency(diagnosis.summaryMetrics.revenue30d, currency), unit: `${formatNumber(diagnosis.summaryMetrics.orderCount30d)} 单 / AOV ${formatCurrency(diagnosis.summaryMetrics.aov30d, currency)}` },
        { label: ads ? "经营利润" : "贡献利润", value: formatCurrency(ads ? operatingProfitAfterAds : totalContributionProfit, currency), unit: ads ? `广告花费 ${formatCurrency(totalAdsSpend, currency)}` : channel?.totalRevenue ? `利润率 ${formatPercent((totalContributionProfit / channel.totalRevenue) * 100)}` : "—" },
        { label: "退款率", value: formatPercent(diagnosis.summaryMetrics.refundRate30d), unit: `较上期 ${diagnosis.summaryMetrics.refundRateDelta >= 0 ? "+" : ""}${formatNumber(diagnosis.summaryMetrics.refundRateDelta, 1)}pp` },
        { label: "高价值客户占比", value: formatPercent(customer?.highValueShare), unit: `平均 LTV ${formatCurrency(customer?.averageDynamicLtv, currency)}` },
        { label: "可归因收入占比", value: formatPercent(channel?.attributedRevenueShare), unit: topRevenueChannel ? `最高收入渠道 ${topRevenueChannel.label}` : "—" },
      ],
      coverage: [
        { label: "Shopify 订单/退款/库存", value: diagnosis.hasData ? "已接入" : "暂无数据", source: diagnosis.hasData ? "real" : "pending" },
        { label: "Pixel 漏斗", value: diagnosis.summaryMetrics.hasPixelData ? "已接入（当前仍偏 7 天）" : "未检测到", source: diagnosis.summaryMetrics.hasPixelData ? "real" : "estimated" },
        { label: "GA4 来源/页面", value: ga4?.connected ? `已接入 ${ga4.propertyCount} 个属性` : ga4?.error ? "连接异常" : "未连接", source: ga4?.connected ? "real" : "estimated" },
        { label: "广告花费", value: ads ? `已接入 ${ads.platformSummaries.length} 个平台` : "未连接", source: ads ? "real" : "estimated" },
        { label: "站点体验 / PageSpeed", value: pageSpeedPerformance?.score != null ? `性能 ${formatScore(pageSpeedPerformance.score)}` : pageSpeed?.error ? "读取异常" : pageSpeed?.url ? "待分析" : "未识别店铺域名", source: pageSpeedReport ? "real" : pageSpeed?.url ? "estimated" : "pending" },
        { label: "客户价值层", value: customer ? "已接入" : "待生成", source: customer ? "real" : "pending" },
        { label: "渠道经营层", value: channel ? "已接入" : "待生成", source: channel ? "estimated" : "pending" },
      ],
      highlights: [
        "当前 30 天页最有价值的是真实的利润、渠道和客户价值层。",
        pageSpeedPerformance?.score != null ? `站点体验也已进入结构判断，当前移动端性能分 ${formatScore(pageSpeedPerformance.score)}。` : "站点体验已纳入结构视图，但当前还没拿到稳定结果。",
        ads ? "广告 spend 已进入利润判断，但渠道级净利润仍需要更细的归因映射。" : ga4?.connected ? "流量模块已开始具备来源结构，但广告花费仍未完整。" : "流量来源与广告花费仍未完整，因此结构判断优先于细颗粒归因。",
        "页面已经开始摆脱纯 mock，进入真实数据 + 占位混合阶段。",
      ],
      nextSteps: [
        "把站点体验问题和 landing page / 渠道质量做关联分析。",
        "继续补齐 GA4 更多维度与广告 spend 的渠道映射。",
        "增强商品层，把销量、利润和退款统一进商品视图。",
        "最后再把 AI 洞察改成真正由模块摘要生成。",
      ],
      report: {
        ...report,
        summary:
          ads && overallBusinessRoi != null
            ? `30 天更适合看 ROI 结构。当前经营 ROI 为 ${formatSignedPercent(overallBusinessRoi * 100)}，重点看利润被哪个环节长期侵蚀。`
            : "30 天更适合看利润、渠道和客户价值结构，广告成本完整映射后再升级为长期 ROI 视图。",
      },
      modules: sharedModules.map((item) =>
        item.key === "traffic" || item.key === "conversion"
          ? {
              ...item,
              summary: `${item.summary} 当前长周期页面仍复用较短窗口的行为数据作为补充。`,
            }
          : item,
      ),
    },
  };
}
