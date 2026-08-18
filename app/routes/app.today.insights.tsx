import { useMemo, type CSSProperties } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate, useSearchParams } from "react-router";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";
import { authenticate } from "../shopify.server";
import { ensureCustomerValueLayer } from "../server/operations/customerValue.server";
import { computeOperationsDiagnosis } from "../server/operations/diagnosis.server";
import { getShopCostConfig } from "../server/operations/roi/costConfig.server";
import { computeChannelRoi } from "../server/operations/channelRoi.server";
import { fetchAdsInsights } from "../server/adsInsights/index.server";
import { emptyMetrics, type AdsInsightsPlatform } from "../server/adsInsights/types.server";
import { mergeMetrics } from "../server/adsInsights/nest.server";
import {
  queryGa4MergedByDimension,
  queryGa4MergedSummaryAndTimeSeries,
  refreshGa4AccessToken,
} from "../server/googleAnalytics/ga4Api.server";
import {
  getGa4Credential,
  setGa4Credential,
} from "../server/googleAnalytics/ga4Credentials.server";
import { DestinationFilterBar, DestinationPage } from "./component/shared/DestinationPage";
import {
  PageMetricCard,
  PageSurface,
  mobilePageContentStyle,
  pageColorTokens,
  pageContentStyle,
  pageEmptyStateStyle,
  pageFieldLabelStyle,
  pageHintTextStyle,
  pageSelectStyle,
  pageSectionHeaderRowStyle,
  pageSectionSubtitleStyle,
  pageStatusCardStyle,
} from "./page/pageUiStyles";

type PeriodKey = "7d" | "30d";
type ModuleSource = "real" | "estimated" | "pending";
type ChartKind = "bars" | "stack" | "funnel" | "table";
type ModuleFilterKey = "all" | string;

type ModuleMetric = {
  label: string;
  value: string;
  delta?: string;
};

type ChartItem = {
  label: string;
  value: number;
  display: string;
  note?: string;
};

type ModuleChart = {
  title: string;
  kind: ChartKind;
  items: ChartItem[];
};

type BusinessModule = {
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

type NarrativeCard = {
  title: string;
  body: string;
};

type ReportCardTone = "positive" | "warning" | "negative" | "neutral";

type ReportSummaryCard = {
  label: string;
  value: string;
  detail: string;
  tone: ReportCardTone;
};

type InsightItemTone = "critical" | "warning" | "info";

type InsightListItem = {
  title: string;
  confidence: "高" | "中" | "低";
  metric: string;
  detail: string;
  tone: InsightItemTone;
  targetKey?: string;
  href?: string;
};

type DrilldownEntry = {
  key: string;
  title: string;
  detail: string;
  badge: string;
  href: string;
};

type SnapshotReport = {
  summary: string;
  cards: ReportSummaryCard[];
  insights: InsightListItem[];
  drilldowns: DrilldownEntry[];
  focus: string[];
  actions: string[];
  narratives: NarrativeCard[];
  charts: ModuleChart[];
};

type Snapshot = {
  summary: string;
  metricAccent: string;
  topMetrics: Array<{ label: string; value: string; unit?: string }>;
  coverage: Array<{ label: string; value: string; source: ModuleSource }>;
  highlights: string[];
  nextSteps: string[];
  modules: BusinessModule[];
  report: SnapshotReport;
};

type LiveSnapshotData = {
  shop: string;
  generatedAt: string;
  costConfigured: boolean;
  diagnosis: Awaited<ReturnType<typeof computeOperationsDiagnosis>> | null;
  customerAggregates: Awaited<ReturnType<typeof ensureCustomerValueLayer>> | null;
  channelRoi: Awaited<ReturnType<typeof computeChannelRoi>> | null;
  ads: {
    rangeDays: 30;
    totalSpend: number;
    totalClicks: number;
    totalImpressions: number;
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
    } | null;
    channelRows: Array<{
      key: string;
      users: number;
      sessions: number;
      pageViews: number;
      revenue: number;
    }>;
    landingRows: Array<{
      key: string;
      users: number;
      sessions: number;
      pageViews: number;
      revenue: number;
    }>;
    error: string | null;
  } | null;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const now = new Date();

  try {
    const costConfig = await getShopCostConfig(session.shop);
    const diagnosis = await computeOperationsDiagnosis(session.shop, now);
    const ga4Credential = await getGa4Credential(session.shop).catch((error) => {
      console.error("[today.insights] ga4 credential load failed:", error);
      return null;
    });

    const [customerAggregates, channelRoi, ads, ga4] = await Promise.all([
      ensureCustomerValueLayer(session.shop, costConfig.defaultGrossMarginPercent, { now }).catch((error) => {
        console.error("[today.insights] customer value layer failed:", error);
        return null;
      }),
      computeChannelRoi(session.shop, costConfig, now).catch((error) => {
        console.error("[today.insights] channel roi failed:", error);
        return null;
      }),
      (async () => {
        const platforms: AdsInsightsPlatform[] = ["meta", "google", "tiktok"];
        const results = await Promise.all(
          platforms.map(async (platform) => {
            try {
              return await fetchAdsInsights({
                shop: session.shop,
                platform,
                rangeDays: 30,
                view: "structure",
              });
            } catch (error) {
              console.error(`[today.insights] ads insights failed: ${platform}`, error);
              return null;
            }
          }),
        );

        const platformSummaries = results
          .map((result, index) => {
            if (!result) return null;
            const totals = result.campaigns.reduce(
              (acc, campaign) => mergeMetrics(acc, campaign.metrics),
              emptyMetrics(),
            );
            return {
              platform: platforms[index],
              accountName: result.accountName ?? null,
              currencyCode: result.currencyCode ?? null,
              spend: totals.spend,
              clicks: totals.clicks,
              impressions: totals.impressions,
              conversionsValue: totals.conversionsValue,
              roas: totals.roas,
              campaignCount: result.campaigns.length,
            };
          })
          .filter((item): item is NonNullable<typeof item> => Boolean(item))
          .filter((item) => item.spend > 0 || item.campaignCount > 0);

        if (platformSummaries.length === 0) return null;

        const totalSpend = platformSummaries.reduce((sum, item) => sum + item.spend, 0);
        const totalClicks = platformSummaries.reduce((sum, item) => sum + item.clicks, 0);
        const totalImpressions = platformSummaries.reduce((sum, item) => sum + item.impressions, 0);
        const totalConversionsValue = platformSummaries.reduce(
          (sum, item) => sum + item.conversionsValue,
          0,
        );

        return {
          rangeDays: 30 as const,
          totalSpend,
          totalClicks,
          totalImpressions,
          totalConversionsValue,
          totalRoas: totalSpend > 0 ? totalConversionsValue / totalSpend : null,
          currencyCode:
            platformSummaries.find((item) => item.currencyCode)?.currencyCode ??
            diagnosis.summaryMetrics.currency ??
            null,
          platformSummaries,
        };
      })(),
      (async () => {
        if (!ga4Credential || ga4Credential.properties.length === 0) {
          return {
            connected: false,
            propertyCount: 0,
            startDate: null,
            endDate: null,
            summary: null,
            channelRows: [],
            landingRows: [],
            error: null,
          };
        }

        let accessToken = ga4Credential.accessToken;
        if (ga4Credential.refreshToken) {
          try {
            accessToken = await refreshGa4AccessToken(ga4Credential.refreshToken);
            await setGa4Credential(session.shop, { ...ga4Credential, accessToken });
          } catch {
            // refresh 失败时继续尝试旧 token
          }
        }

        try {
          const propertyIds = ga4Credential.properties.map((property) => property.propertyId);
          const [summaryResult, channelResult, landingResult] = await Promise.all([
            queryGa4MergedSummaryAndTimeSeries(accessToken, propertyIds, 7),
            queryGa4MergedByDimension(
              accessToken,
              propertyIds,
              7,
              "sessionDefaultChannelGroup",
              6,
            ),
            queryGa4MergedByDimension(accessToken, propertyIds, 7, "landingPage", 6),
          ]);

          return {
            connected: true,
            propertyCount: ga4Credential.properties.length,
            startDate: summaryResult.startDate,
            endDate: summaryResult.endDate,
            summary: summaryResult.summary,
            channelRows: channelResult.rows,
            landingRows: landingResult.rows,
            error: null,
          };
        } catch (error) {
          console.error("[today.insights] ga4 query failed:", error);
          return {
            connected: true,
            propertyCount: ga4Credential.properties.length,
            startDate: null,
            endDate: null,
            summary: null,
            channelRows: [],
            landingRows: [],
            error: error instanceof Error ? error.message : "GA4 查询失败",
          };
        }
      })(),
    ]);

    return {
      liveData: {
        shop: session.shop,
        generatedAt: now.toISOString(),
        costConfigured: costConfig.isConfigured,
        diagnosis,
        customerAggregates,
        channelRoi,
        ads,
        ga4,
      } satisfies LiveSnapshotData,
    };
  } catch (error) {
    console.error("[today.insights] loader failed:", error);
    return {
      liveData: null as LiveSnapshotData | null,
    };
  }
};

const periodItems: Array<{ key: PeriodKey; label: string }> = [
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
  insights: [
    {
      title: "转化下滑主要卡在站内",
      confidence: "中",
      metric: "整体转化率 / 支付成功率",
      detail: "先看漏斗掉点和核心 landing page。",
      tone: "warning",
      targetKey: "conversion",
      href: "/app/today/diagnosis?detail=risk&riskTab=insights&insightKey=conversion_health",
    },
    {
      title: "退款已开始侵蚀利润",
      confidence: "高",
      metric: "退款率 / 退款 SKU",
      detail: "优先排查高退款 SKU 和履约链路。",
      tone: "critical",
      targetKey: "afterSales",
      href: "/app/today/diagnosis?detail=risk&riskTab=insights&insightKey=refund_health",
    },
    {
      title: "渠道利润差异已经拉开",
      confidence: "中",
      metric: "渠道收入 / 渠道利润",
      detail: "优先看最赚钱渠道和值得扩量的客群。",
      tone: "info",
      targetKey: "channel",
      href: "/app/today/diagnosis?detail=value&valueTab=channels",
    },
  ],
  drilldowns: [
    { key: "refund", title: "退款详情", detail: "看异常退款订单、退款 SKU 和原因聚类", badge: "高优先", href: "/app/today/diagnosis?detail=risk&riskTab=insights&insightKey=refund_health" },
    { key: "inventory", title: "库存详情", detail: "看风险 SKU、可售天数和预计损失", badge: "对象深钻", href: "/app/today/diagnosis?detail=risk&riskTab=environment&environmentKey=inventory" },
    { key: "conversion", title: "流量/转化详情", detail: "看漏斗掉点、landing page 和渠道来源", badge: "定位卡点", href: "/app/today/diagnosis?detail=risk&riskTab=insights&insightKey=conversion_health" },
    { key: "channel", title: "渠道 ROI", detail: "看收入、利润和值得继续投的渠道", badge: "经营复盘", href: "/app/today/diagnosis?detail=value&valueTab=channels" },
  ],
  focus: [
    "先用利润、退款和库存把经营结果层看清。",
    "再把流量与渠道补到同一套口径。",
    "最后再让 AI 基于模块摘要生成报告。",
  ],
  actions: [
    "先补广告成本与渠道映射。",
    "再补 GA4 来源和 landing page 维度。",
    "最后接 AI 风险、机会和动作建议。",
  ],
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

function buildLiveSnapshots(liveData: LiveSnapshotData | null): Record<PeriodKey, Snapshot> {
  if (!liveData?.diagnosis) return mockSnapshots;

  const diagnosis = liveData.diagnosis;
  const customer = liveData.customerAggregates;
  const channel = liveData.channelRoi;
  const ads = liveData.ads;
  const ga4 = liveData.ga4;
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
  const topAdsPlatform =
    ads?.platformSummaries.slice().sort((a, b) => b.spend - a.spend)[0] ?? null;
  const ga4TopSource = ga4?.channelRows[0] ?? null;
  const ga4TopLanding = ga4?.landingRows[0] ?? null;
  const trafficSessions = ga4?.summary?.totalSessions ?? diagnosis.summaryMetrics.sessions7d;
  const trafficUsers = ga4?.summary?.totalUsers ?? null;
  const trafficPageViews = ga4?.summary?.totalPageViews ?? null;

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

  const sharedModules = [
    trafficModule,
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
  ].filter(Boolean).length;

  const reportActions: string[] = [];
  if (diagnosis.summaryMetrics.riskSkuCount > 0) {
    reportActions.push(
      `先处理 ${formatNumber(diagnosis.summaryMetrics.riskSkuCount)} 个高风险 SKU，优先保护 ${formatCurrency(diagnosis.summaryMetrics.estimatedInventoryLoss, currency)} 的潜在缺货损失。`,
    );
  }
  if (
    diagnosis.summaryMetrics.refundRateDelta > 0 ||
    diagnosis.summaryMetrics.carrierIssueCount > 0
  ) {
    const focusSku = diagnosis.detail.topRefundSkus[0]?.sku;
    reportActions.push(
      `复盘退款与履约链路${focusSku ? `，优先检查 ${focusSku}` : ""}，先止住退款率 ${formatSignedPercentPoint(diagnosis.summaryMetrics.refundRateDelta)} 的恶化。`,
    );
  }
  if (
    diagnosis.summaryMetrics.conversionRate7d != null &&
    diagnosis.summaryMetrics.conversionRatePrev7d != null &&
    diagnosis.summaryMetrics.conversionRate7d <= diagnosis.summaryMetrics.conversionRatePrev7d
  ) {
    reportActions.push(
      `检查 ${ga4TopLanding ? `${normalizeGa4Key(ga4TopLanding.key, "/")} 落地页` : "核心商品页"} 的转化链路，优先提升站内转化而不是继续盲目加流量。`,
    );
  }
  if (ads && topAdsPlatform) {
    reportActions.push(
      topAdsPlatform.roas != null && topAdsPlatform.roas < 1
        ? `压缩 ${topAdsPlatform.platform} 的低效投放，当前平台 ROAS 只有 ${formatNumber(topAdsPlatform.roas, 2)}。`
        : `把预算优先集中到 ${topAdsPlatform.platform} 的高质量广告组，减少低质量流量稀释经营利润。`,
    );
  }
  if (reportActions.length === 0) {
    reportActions.push("当前没有明显的紧急止损项，可以把精力放在利润扩张和高价值客户经营上。");
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
          ? `/app/today/diagnosis?detail=risk&riskTab=insights&insightKey=${item.key}`
          : undefined,
    }));

  const reportDrilldowns: DrilldownEntry[] = [
    {
      key: "refund",
      title: "退款详情",
      detail: "看异常退款订单、退款 SKU 和退款原因聚类。",
      badge: `${formatPercent(diagnosis.summaryMetrics.refundRate30d)} 退款率`,
      href: "/app/today/diagnosis?detail=risk&riskTab=insights&insightKey=refund_health",
    },
    {
      key: "inventory",
      title: "库存详情",
      detail: "看风险 SKU、可售天数和预计损失。",
      badge: `${formatNumber(diagnosis.summaryMetrics.riskSkuCount)} 个风险 SKU`,
      href: "/app/today/diagnosis?detail=risk&riskTab=environment&environmentKey=inventory",
    },
    {
      key: "fulfillment",
      title: "履约与物流",
      detail: "看超时未发货、物流异常和关联售后问题。",
      badge: `${formatNumber(diagnosis.summaryMetrics.overdueOrderCount + diagnosis.summaryMetrics.carrierIssueCount)} 个异常对象`,
      href: "/app/today/diagnosis?detail=risk&riskTab=environment&environmentKey=fulfillment",
    },
    {
      key: "channel",
      title: "渠道 ROI",
      detail: "看收入、利润和值得继续投的渠道。",
      badge: topProfitChannel ? `${topProfitChannel.label} 最稳` : "经营复盘",
      href: "/app/today/diagnosis?detail=value&valueTab=channels",
    },
  ];

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
    insights: reportInsights.length > 0 ? reportInsights : mockReport7d.insights,
    drilldowns: reportDrilldowns,
    focus: reportFocus,
    actions: reportActions,
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
        body: reportActions.slice(0, 2).join(" "),
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
        { label: "客户价值层", value: customer ? "已接入" : "待生成", source: customer ? "real" : "pending" },
        { label: "渠道经营层", value: channel ? "已接入" : "待生成", source: channel ? "estimated" : "pending" },
      ],
      highlights: [
        "售后、利润、客户价值和渠道模块已经优先切到真实数据。",
        ga4?.connected ? "流量模块已经接入 GA4 的来源与 landing page 维度。" : "流量与转化目前先复用 Pixel / diagnosis 口径，来源维度还未完整。",
        ads ? "广告花费已经并入成本和利润判断，但渠道映射仍是近似版。" : "成本与渠道还属于半真实数据，因为广告花费暂未并入。",
      ],
      nextSteps: [
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
        { label: "客户价值层", value: customer ? "已接入" : "待生成", source: customer ? "real" : "pending" },
        { label: "渠道经营层", value: channel ? "已接入" : "待生成", source: channel ? "estimated" : "pending" },
      ],
      highlights: [
        "当前 30 天页最有价值的是真实的利润、渠道和客户价值层。",
        ads ? "广告 spend 已进入利润判断，但渠道级净利润仍需要更细的归因映射。" : ga4?.connected ? "流量模块已开始具备来源结构，但广告花费仍未完整。" : "流量来源与广告花费仍未完整，因此结构判断优先于细颗粒归因。",
        "页面已经开始摆脱纯 mock，进入真实数据 + 占位混合阶段。",
      ],
      nextSteps: [
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

const pageStyles = {
  page: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "1rem",
  },
  heroGrid: (isMobile: boolean): CSSProperties => ({
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1.7fr) minmax(280px, 0.9fr)",
    gap: "1rem",
    alignItems: "stretch",
  }),
  coverageList: {
    display: "grid",
    gap: "0.65rem",
  } as CSSProperties,
  overviewGrid: (isMobile: boolean): CSSProperties => ({
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1.25fr) minmax(280px, 0.95fr)",
    gap: "1rem",
    alignItems: "start",
  }),
  controlCard: {
    ...pageStatusCardStyle,
    display: "grid",
    gap: "0.75rem",
    padding: "0.95rem",
  } as CSSProperties,
  controlGrid: (isMobile: boolean): CSSProperties => ({
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) minmax(0, 1fr)",
    gap: "0.85rem",
  }),
  helperList: {
    display: "grid",
    gap: "0.5rem",
  } as CSSProperties,
  helperItem: {
    display: "flex",
    gap: "0.55rem",
    alignItems: "flex-start",
    fontSize: 12,
    lineHeight: 1.55,
    color: pageColorTokens.textBody,
  } as CSSProperties,
  helperDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: pageColorTokens.brandGreen,
    marginTop: 6,
    flexShrink: 0,
  } as CSSProperties,
  coverageItem: {
    ...pageStatusCardStyle,
    display: "grid",
    gap: "0.25rem",
    padding: "0.8rem 0.9rem",
  } as CSSProperties,
  coverageLabel: {
    fontSize: 12,
    color: pageColorTokens.textSecondary,
  } as CSSProperties,
  coverageValue: {
    fontSize: 14,
    fontWeight: 700,
    color: pageColorTokens.textPrimary,
  } as CSSProperties,
  moduleGrid: {
    display: "grid",
    gap: "1rem",
  } as CSSProperties,
  moduleToolbar: (isMobile: boolean): CSSProperties => ({
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) auto",
    gap: "0.85rem",
    alignItems: "end",
    marginBottom: "1rem",
  }),
  moduleCounts: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: "0.45rem",
    alignItems: "center",
    justifyContent: "flex-end",
  } as CSSProperties,
  countBadge: (tone: ModuleSource): CSSProperties => ({
    borderRadius: 999,
    padding: "0.22rem 0.55rem",
    fontSize: 11,
    fontWeight: 700,
    border: `1px solid ${
      tone === "real" ? "#a7f3d0" : tone === "estimated" ? "#c7d2fe" : "#fed7aa"
    }`,
    color: tone === "real" ? "#047857" : tone === "estimated" ? "#3730a3" : "#9a3412",
    background: tone === "real" ? "#ecfdf5" : tone === "estimated" ? "#eef2ff" : "#fff7ed",
  }),
  moduleHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.75rem",
    flexWrap: "wrap" as const,
    marginBottom: "0.85rem",
  } as CSSProperties,
  sourceBadge: (source: ModuleSource): CSSProperties => {
    const tone =
      source === "real"
        ? { color: "#0f766e", background: "#ecfeff", border: "#a5f3fc", label: "真实数据" }
        : source === "estimated"
          ? { color: "#2952d8", background: "#eef2ff", border: "#c7d2fe", label: "估算/待接入" }
          : { color: "#9a3412", background: "#fff7ed", border: "#fed7aa", label: "占位" };
    return {
      display: "inline-flex",
      alignItems: "center",
      padding: "0.2rem 0.55rem",
      borderRadius: 999,
      fontSize: 11,
      fontWeight: 700,
      color: tone.color,
      background: tone.background,
      border: `1px solid ${tone.border}`,
      whiteSpace: "nowrap",
    };
  },
  moduleSummary: {
    margin: 0,
    fontSize: 13,
    lineHeight: 1.6,
    color: pageColorTokens.textBody,
  } as CSSProperties,
  moduleContent: (isMobile: boolean): CSSProperties => ({
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1.2fr) minmax(260px, 0.95fr)",
    gap: "1rem",
    alignItems: "stretch",
  }),
  metricGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(132px, 1fr))",
    gap: "0.6rem",
    marginTop: "0.85rem",
  } as CSSProperties,
  metricItem: {
    border: `1px solid ${pageColorTokens.borderSubtle}`,
    borderRadius: pageColorTokens.radiusControl,
    background: pageColorTokens.surfaceMuted,
    padding: "0.75rem",
    display: "grid",
    gap: "0.2rem",
  } as CSSProperties,
  metricLabel: {
    fontSize: 11,
    color: pageColorTokens.textSecondary,
  } as CSSProperties,
  metricValue: {
    fontSize: 18,
    lineHeight: 1.1,
    fontWeight: 700,
    color: pageColorTokens.textPrimary,
  } as CSSProperties,
  metricDelta: {
    fontSize: 11,
    color: pageColorTokens.brandBlueDark,
    fontWeight: 600,
  } as CSSProperties,
  chartCard: {
    border: `1px solid ${pageColorTokens.borderSubtle}`,
    borderRadius: pageColorTokens.radiusControl,
    background: "#fbfcfd",
    padding: "0.85rem",
    display: "grid",
    gap: "0.65rem",
  } as CSSProperties,
  chartTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: pageColorTokens.textBody,
  } as CSSProperties,
  chartRow: {
    display: "grid",
    gridTemplateColumns: "92px minmax(0, 1fr) auto",
    gap: "0.55rem",
    alignItems: "center",
  } as CSSProperties,
  chartLabel: {
    fontSize: 12,
    color: pageColorTokens.textBody,
  } as CSSProperties,
  chartTrack: {
    position: "relative" as const,
    height: 8,
    borderRadius: 999,
    background: pageColorTokens.divider,
    overflow: "hidden",
  },
  chartBar: (kind: ChartKind, value: number): CSSProperties => ({
    width: `${Math.max(10, Math.min(100, value))}%`,
    height: "100%",
    borderRadius: 999,
    background:
      kind === "funnel"
        ? "linear-gradient(90deg, #2952d8 0%, #4070f4 100%)"
        : kind === "stack"
          ? "linear-gradient(90deg, #007a5a 0%, #00a67c 100%)"
          : "linear-gradient(90deg, #7c3aed 0%, #4070f4 100%)",
  }),
  chartValue: {
    fontSize: 12,
    fontWeight: 700,
    color: pageColorTokens.textPrimary,
  } as CSSProperties,
  insightList: {
    display: "grid",
    gap: "0.75rem",
  } as CSSProperties,
  insightItem: (tone: InsightItemTone): CSSProperties => ({
    borderRadius: pageColorTokens.radiusControl,
    border: `1px solid ${
      tone === "critical"
        ? "#fecaca"
        : tone === "warning"
          ? "#fed7aa"
          : "#c7d2fe"
    }`,
    background:
      tone === "critical"
        ? "#fef2f2"
        : tone === "warning"
          ? "#fff7ed"
          : "#eef2ff",
    padding: "0.8rem 0.9rem",
    display: "grid",
    gap: "0.35rem",
  }),
  insightHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.75rem",
    flexWrap: "wrap" as const,
  } as CSSProperties,
  insightTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: pageColorTokens.textPrimary,
  } as CSSProperties,
  insightMeta: {
    display: "flex",
    gap: "0.45rem",
    flexWrap: "wrap" as const,
    alignItems: "center",
  } as CSSProperties,
  insightBadge: (tone: InsightItemTone): CSSProperties => ({
    borderRadius: 999,
    padding: "0.18rem 0.5rem",
    fontSize: 11,
    fontWeight: 700,
    color:
      tone === "critical"
        ? "#b91c1c"
        : tone === "warning"
          ? "#9a3412"
          : "#3730a3",
    background:
      tone === "critical"
        ? "#fee2e2"
        : tone === "warning"
          ? "#ffedd5"
          : "#e0e7ff",
  }),
  insightMetric: {
    fontSize: 11,
    color: pageColorTokens.textSecondary,
    fontWeight: 600,
  } as CSSProperties,
  drilldownGrid: (isMobile: boolean): CSSProperties => ({
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
    gap: "0.75rem",
  }),
  drilldownCard: {
    border: `1px solid ${pageColorTokens.borderSubtle}`,
    borderRadius: pageColorTokens.radiusControl,
    background: "#ffffff",
    padding: "0.9rem",
    display: "grid",
    gap: "0.35rem",
    cursor: "pointer",
  } as CSSProperties,
  drilldownTitleRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.75rem",
  } as CSSProperties,
  drilldownTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: pageColorTokens.textPrimary,
  } as CSSProperties,
  drilldownBadge: {
    borderRadius: 999,
    padding: "0.18rem 0.5rem",
    fontSize: 11,
    fontWeight: 700,
    color: pageColorTokens.brandBlueDark,
    background: pageColorTokens.brandBlueLight,
  } as CSSProperties,
  drilldownDetail: {
    fontSize: 12,
    lineHeight: 1.5,
    color: pageColorTokens.textBody,
  } as CSSProperties,
  tableList: {
    display: "grid",
    gap: "0.55rem",
  } as CSSProperties,
  tableItem: {
    border: `1px solid ${pageColorTokens.borderSubtle}`,
    borderRadius: pageColorTokens.radiusControl,
    background: "#ffffff",
    padding: "0.7rem 0.8rem",
    display: "grid",
    gap: "0.2rem",
  } as CSSProperties,
  tableTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: "0.65rem",
    alignItems: "center",
  } as CSSProperties,
  tableNote: {
    fontSize: 11,
    color: pageColorTokens.textSecondary,
  } as CSSProperties,
  signalList: {
    display: "grid",
    gap: "0.45rem",
    marginTop: "0.85rem",
  } as CSSProperties,
  signalItem: {
    display: "flex",
    gap: "0.5rem",
    alignItems: "flex-start",
    fontSize: 12,
    lineHeight: 1.5,
    color: pageColorTokens.textBody,
  } as CSSProperties,
  signalDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: pageColorTokens.brandBlue,
    marginTop: 6,
    flexShrink: 0,
  } as CSSProperties,
  aiGrid: (isMobile: boolean): CSSProperties => ({
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
    gap: "0.75rem",
  }),
  reportCardGrid: (isMobile: boolean): CSSProperties => ({
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
    gap: "0.75rem",
  }),
  reportCard: (tone: ReportCardTone): CSSProperties => ({
    borderRadius: pageColorTokens.radiusControl,
    border: `1px solid ${
      tone === "positive"
        ? "#a7f3d0"
        : tone === "warning"
          ? "#fed7aa"
          : tone === "negative"
            ? "#fecaca"
            : pageColorTokens.borderSubtle
    }`,
    background:
      tone === "positive"
        ? "#ecfdf5"
        : tone === "warning"
          ? "#fff7ed"
          : tone === "negative"
            ? "#fef2f2"
            : pageColorTokens.surfaceMuted,
    padding: "0.9rem",
    display: "grid",
    gap: "0.25rem",
  }),
  reportCardLabel: {
    fontSize: 12,
    color: pageColorTokens.textSecondary,
  } as CSSProperties,
  reportCardValue: {
    fontSize: 22,
    lineHeight: 1.1,
    fontWeight: 760,
    color: pageColorTokens.textPrimary,
  } as CSSProperties,
  reportCardDetail: {
    fontSize: 12,
    lineHeight: 1.5,
    color: pageColorTokens.textBody,
  } as CSSProperties,
  reportContentGrid: (isMobile: boolean): CSSProperties => ({
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1.15fr) minmax(300px, 0.85fr)",
    gap: "1rem",
    alignItems: "start",
  }),
  aiCard: {
    border: `1px dashed ${pageColorTokens.borderInput}`,
    borderRadius: pageColorTokens.radiusControl,
    background: pageColorTokens.surfaceMuted,
    padding: "0.95rem",
    display: "grid",
    gap: "0.45rem",
  } as CSSProperties,
  aiTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: pageColorTokens.textPrimary,
  } as CSSProperties,
  aiBody: {
    fontSize: 12,
    lineHeight: 1.55,
    color: pageColorTokens.textSecondary,
  } as CSSProperties,
};

function SourceBadge({ source }: { source: ModuleSource }) {
  const label =
    source === "real" ? "真实数据" : source === "estimated" ? "估算/待接入" : "占位";
  return <span style={pageStyles.sourceBadge(source)}>{label}</span>;
}

function ModuleChartPreview({ chart }: { chart: ModuleChart }) {
  if (chart.kind === "table") {
    return (
      <div style={pageStyles.chartCard}>
        <div style={pageStyles.chartTitle}>{chart.title}</div>
        <div style={pageStyles.tableList}>
          {chart.items.map((item) => (
            <div key={`${chart.title}-${item.label}`} style={pageStyles.tableItem}>
              <div style={pageStyles.tableTop}>
                <strong style={pageStyles.chartLabel}>{item.label}</strong>
                <span style={pageStyles.chartValue}>{item.display}</span>
              </div>
              {item.note ? <div style={pageStyles.tableNote}>{item.note}</div> : null}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyles.chartCard}>
      <div style={pageStyles.chartTitle}>{chart.title}</div>
      {chart.items.map((item) => (
        <div key={`${chart.title}-${item.label}`} style={pageStyles.chartRow}>
          <span style={pageStyles.chartLabel}>{item.label}</span>
          <div style={pageStyles.chartTrack}>
            <div style={pageStyles.chartBar(chart.kind, item.value)} />
          </div>
          <span style={pageStyles.chartValue}>{item.display}</span>
        </div>
      ))}
    </div>
  );
}

function BusinessModuleCard({
  module,
  isMobile,
}: {
  module: BusinessModule;
  isMobile: boolean;
}) {
  return (
    <PageSurface title={module.title} subtitle={module.subtitle}>
      <div style={pageStyles.moduleHeader}>
        <p style={pageStyles.moduleSummary}>{module.summary}</p>
        <SourceBadge source={module.source} />
      </div>

      <div style={pageStyles.moduleContent(isMobile)}>
        <div>
          <div style={pageStyles.metricGrid}>
            {module.metrics.map((metric) => (
              <div key={`${module.key}-${metric.label}`} style={pageStyles.metricItem}>
                <span style={pageStyles.metricLabel}>{metric.label}</span>
                <span style={pageStyles.metricValue}>{metric.value}</span>
                <span style={pageStyles.metricDelta}>{metric.delta ?? "—"}</span>
              </div>
            ))}
          </div>

          <div style={pageStyles.signalList}>
            {module.signals.map((signal) => (
              <div key={`${module.key}-${signal}`} style={pageStyles.signalItem}>
                <span style={pageStyles.signalDot} />
                <span>{signal}</span>
              </div>
            ))}
          </div>

          <p style={pageHintTextStyle}>{module.actionHint}</p>
        </div>

        <ModuleChartPreview chart={module.chart} />
      </div>
    </PageSurface>
  );
}

function ReportSummaryCardView({ card }: { card: ReportSummaryCard }) {
  return (
    <div style={pageStyles.reportCard(card.tone)}>
      <span style={pageStyles.reportCardLabel}>{card.label}</span>
      <span style={pageStyles.reportCardValue}>{card.value}</span>
      <span style={pageStyles.reportCardDetail}>{card.detail}</span>
    </div>
  );
}

export default function TodayBusinessInsights() {
  const { liveData } = useLoaderData<typeof loader>();
  const { isMobile } = useResponsiveLayout();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const period = searchParams.get("period") === "30d" ? "30d" : "7d";
  const moduleFilter = (searchParams.get("module") as ModuleFilterKey | null) ?? "all";
  const snapshots = useMemo(() => buildLiveSnapshots(liveData), [liveData]);
  const snapshot = useMemo(() => snapshots[period], [period, snapshots]);
  const filteredModules = useMemo(
    () => (moduleFilter === "all" ? snapshot.modules : snapshot.modules.filter((item) => item.key === moduleFilter)),
    [moduleFilter, snapshot.modules],
  );
  const moduleOptions = useMemo(
    () => [{ key: "all", label: "查看全部模块" }, ...snapshot.modules.map((item) => ({ key: item.key, label: item.title }))],
    [snapshot.modules],
  );
  const moduleSourceCounts = useMemo(
    () => ({
      real: snapshot.modules.filter((item) => item.source === "real").length,
      estimated: snapshot.modules.filter((item) => item.source === "estimated").length,
      pending: snapshot.modules.filter((item) => item.source === "pending").length,
    }),
    [snapshot.modules],
  );

  const currentReturnTo = useMemo(() => {
    const next = new URLSearchParams();
    next.set("period", period);
    if (moduleFilter !== "all") next.set("module", moduleFilter);
    const query = next.toString();
    return `/app/today/insights${query ? `?${query}` : ""}`;
  }, [moduleFilter, period]);

  const buildDetailHref = (href: string) => {
    const [path, query = ""] = href.split("?");
    const next = new URLSearchParams(query);
    next.set("returnTo", currentReturnTo);
    return `${path}?${next.toString()}`;
  };

  const handleModuleChange = (nextKey: string) => {
    const next = new URLSearchParams(searchParams);
    if (nextKey === "all") {
      next.delete("module");
    } else {
      next.set("module", nextKey);
    }
    setSearchParams(next, { replace: true });
    if (nextKey === "all" || typeof document === "undefined") return;
    window.requestAnimationFrame(() => {
      document.getElementById(`module-${nextKey}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  return (
    <div style={isMobile ? mobilePageContentStyle : pageContentStyle}>
      <DestinationPage
        title="商业洞察"
        subtitle="把经营数据整理成一份围绕 ROI 的日报，再往下展开各模块细节。"
        backLabel="返回首页"
        fallbackPath="/app"
        isMobile={isMobile}
      >
        <div style={pageStyles.page}>
          <PageSurface
            title="经营总览"
            subtitle="先把经营结果、数据覆盖和 ROI 阅读入口放到同一屏里。"
          >
            <div style={pageStyles.heroGrid(isMobile)}>
              <PageMetricCard
                accent={snapshot.metricAccent}
                metrics={snapshot.topMetrics}
                footer={snapshot.summary}
              />

              <div style={pageStyles.coverageList}>
                {snapshot.coverage.map((item) => (
                  <div key={item.label} style={pageStyles.coverageItem}>
                    <div style={pageSectionHeaderRowStyle}>
                      <span style={pageStyles.coverageLabel}>{item.label}</span>
                      <SourceBadge source={item.source} />
                    </div>
                    <div style={pageStyles.coverageValue}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ height: "1rem" }} />

            <div style={pageStyles.overviewGrid(isMobile)}>
              <div style={pageStyles.controlCard}>
                <DestinationFilterBar
                  label="时间范围"
                  items={periodItems}
                  active={period}
                  onChange={(next) => {
                    const params = new URLSearchParams(searchParams);
                    params.set("period", next);
                    params.delete("module");
                    setSearchParams(params, { replace: true });
                  }}
                />

                <div>
                  <label htmlFor="insights-module-select" style={pageFieldLabelStyle}>
                    聚焦模块
                  </label>
                  <select
                    id="insights-module-select"
                    value={moduleFilter}
                    style={{ ...pageSelectStyle(false), marginTop: 0 }}
                    onChange={(event) => handleModuleChange(event.target.value)}
                  >
                    {moduleOptions.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={pageStyles.controlCard}>
                <div style={pageFieldLabelStyle}>本页重点</div>
                <div style={pageStyles.helperList}>
                  {snapshot.highlights.map((item) => (
                    <div key={item} style={pageStyles.helperItem}>
                      <span style={pageStyles.helperDot} />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </PageSurface>

          <PageSurface
            title="ROI 日报"
            subtitle="日报先回答：ROI 是否健康、卡在哪个环节、今天先做什么。"
          >
            <p style={{ ...pageSectionSubtitleStyle, margin: "0 0 1rem" }}>{snapshot.report.summary}</p>

            <div style={pageStyles.reportCardGrid(isMobile)}>
              {snapshot.report.cards.map((card) => (
                <ReportSummaryCardView key={card.label} card={card} />
              ))}
            </div>

            <div style={{ height: "1rem" }} />

            <div style={pageStyles.reportContentGrid(isMobile)}>
              <div style={pageStyles.helperList}>
                <div style={pageFieldLabelStyle}>本次判断依据</div>
                {snapshot.report.focus.map((item) => (
                  <div key={item} style={pageStyles.helperItem}>
                    <span style={pageStyles.helperDot} />
                    <span>{item}</span>
                  </div>
                ))}

                <div style={{ height: "0.5rem" }} />
                <div style={pageFieldLabelStyle}>今日优先动作</div>
                {snapshot.report.actions.map((item) => (
                  <div key={item} style={pageStyles.helperItem}>
                    <span style={pageStyles.helperDot} />
                    <span>{item}</span>
                  </div>
                ))}
              </div>

              <div style={pageStyles.moduleGrid}>
                {snapshot.report.charts.map((chart) => (
                  <ModuleChartPreview key={chart.title} chart={chart} />
                ))}
              </div>
            </div>
          </PageSurface>

          <PageSurface
            title="关键洞察"
            subtitle="首页先看洞察列表，详情解释和对象排查再往下深钻。"
          >
            <div style={pageStyles.insightList}>
              {snapshot.report.insights.map((item) => (
                <button
                  key={`${item.title}-${item.metric}`}
                  type="button"
                  style={pageStyles.insightItem(item.tone)}
                  onClick={() => {
                    if (item.href) {
                      navigate(buildDetailHref(item.href));
                      return;
                    }
                    if (item.targetKey) handleModuleChange(item.targetKey);
                  }}
                >
                  <div style={pageStyles.insightHeader}>
                    <span style={pageStyles.insightTitle}>{item.title}</span>
                    <div style={pageStyles.insightMeta}>
                      <span style={pageStyles.insightMetric}>{item.metric}</span>
                      <span style={pageStyles.insightBadge(item.tone)}>{item.confidence}置信</span>
                    </div>
                  </div>
                  <span style={pageStyles.drilldownDetail}>{item.detail}</span>
                </button>
              ))}
            </div>
          </PageSurface>

          <PageSurface
            title="深钻入口"
            subtitle="列表负责快速判断，详情负责展开对象、原因、ROI 影响和任务。"
          >
            <div style={pageStyles.drilldownGrid(isMobile)}>
              {snapshot.report.drilldowns.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  style={pageStyles.drilldownCard}
                  onClick={() => navigate(buildDetailHref(item.href))}
                >
                  <div style={pageStyles.drilldownTitleRow}>
                    <span style={pageStyles.drilldownTitle}>{item.title}</span>
                    <span style={pageStyles.drilldownBadge}>{item.badge}</span>
                  </div>
                  <span style={pageStyles.drilldownDetail}>{item.detail}</span>
                </button>
              ))}
            </div>
          </PageSurface>

          <PageSurface
            title="模块化数据视图"
            subtitle="先把流量、成本、转化、售后、利润等经营模块分开展示，后续 AI 只需要读取模块摘要，不直接吞原始杂乱数据。"
          >
            <div style={pageStyles.moduleToolbar(isMobile)}>
              <p style={{ ...pageSectionSubtitleStyle, margin: 0 }}>
                当前展示 {filteredModules.length} / {snapshot.modules.length} 个模块，页面阅读顺序会尽量保持“先结果、再原因、再动作”的单栏节奏。
              </p>
              <div style={pageStyles.moduleCounts}>
                <span style={pageStyles.countBadge("real")}>真实数据 {moduleSourceCounts.real}</span>
                <span style={pageStyles.countBadge("estimated")}>待接入 {moduleSourceCounts.estimated}</span>
                <span style={pageStyles.countBadge("pending")}>占位 {moduleSourceCounts.pending}</span>
              </div>
            </div>

            <div style={pageStyles.moduleGrid}>
              {filteredModules.map((module) => (
                <div key={module.key} id={`module-${module.key}`}>
                  <BusinessModuleCard module={module} isMobile={isMobile} />
                </div>
              ))}
            </div>
          </PageSurface>

          <PageSurface
            title="日报结论"
            subtitle="这里已经开始基于上面的真实数据摘要输出风险、机会和建议动作。"
          >
            <div style={pageStyles.aiGrid(isMobile)}>
              {snapshot.report.narratives.map((item) => (
                <div key={item.title} style={pageStyles.aiCard}>
                  <div style={pageStyles.aiTitle}>{item.title}</div>
                  <div style={pageStyles.aiBody}>{item.body}</div>
                </div>
              ))}
            </div>
          </PageSurface>

          <div style={pageEmptyStateStyle}>
            <strong>当前页面是第一版前端展示骨架</strong>
            <span style={pageSectionSubtitleStyle}>
              {liveData
                ? `当前已基于 ${liveData.shop} 的现有数据能力接入部分真实模块，剩余缺口会继续逐步替换占位。`
                : "当前还没拿到可用的真实数据，所以页面先退回到前端骨架。"}
            </span>
            <span style={{ ...pageSectionSubtitleStyle, marginTop: 0 }}>
              当前建议的实现顺序：{snapshot.nextSteps.join(" -> ")}
            </span>
          </div>
        </div>
      </DestinationPage>
    </div>
  );
}
