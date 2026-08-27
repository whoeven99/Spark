import { describe, expect, it } from "vitest";
import {
  localizeAnalysisPage,
  localizeCountryOption,
  localizeDecisionReport,
  localizeReasonCard,
  localizeSelectedCountryLabel,
  localizeTodayHeader,
  localizeTodayOverviewReport,
  tx,
} from "../../../app/lib/todayCopy";
import type {
  TodayAnalysisPageReport,
  TodayDecisionReport,
  TodayHeader,
  TodayOverviewReport,
  TodayReasonCard,
} from "../../../app/lib/todayReportTypes";

function createTranslate(dictionary: Record<string, string>) {
  return (key: string, options?: Record<string, unknown>) => {
    const template = dictionary[key] ?? (typeof options?.defaultValue === "string" ? options.defaultValue : key);
    return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(options?.[name] ?? ""));
  };
}

const liveHeader = {
  status: "watch",
  statusLabel: "需要关注",
  summary: "最近 7 天仍然为正，但利润质量已经开始走弱，不能只看规模增长。",
  primaryBottleneck: "退款损耗正在直接侵蚀利润。",
  biggestOpportunity: "复购基础相对稳，适合继续放大健康对象。",
  dataFreshness: "近 7 天订单与退款快照",
  dataConfidence: "medium",
  copySource: "live",
  bottleneckKey: "refund",
  opportunityKey: "repeat",
  metrics: {
    revenue: "$1",
    estimatedProfit: "$1",
    estimatedProfitMargin: "10%",
    shortTermReturn: "1.2x",
  },
} satisfies TodayHeader;

describe("tx", () => {
  it("uses the dictionary value and interpolates params", () => {
    const t = createTranslate({ "today.decision.revenue.subtitle": "Scope: {{country}}." });
    expect(tx(t, "today.decision.revenue.subtitle", "当前查看范围：全部地区。", { country: "US" })).toBe(
      "Scope: US.",
    );
  });

  it("falls back to the server Chinese string when the key is missing", () => {
    const t = createTranslate({});
    expect(tx(t, "today.missing", "收入")).toBe("收入");
  });
});

describe("localizeTodayHeader", () => {
  it("translates live header fields by status and variant keys", () => {
    const t = createTranslate({
      "today.header.status.watch": "Needs attention",
      "today.header.summary.watch": "Profit quality is weakening.",
      "today.header.bottleneck.refund": "Refund loss is eating profit.",
      "today.header.opportunity.repeat": "Repeat purchase is a healthy base to scale.",
      "today.header.dataFreshness": "Last 7 days of orders and refunds",
    });
    const result = localizeTodayHeader(liveHeader, t);
    expect(result.statusLabel).toBe("Needs attention");
    expect(result.summary).toBe("Profit quality is weakening.");
    expect(result.primaryBottleneck).toBe("Refund loss is eating profit.");
    expect(result.biggestOpportunity).toBe("Repeat purchase is a healthy base to scale.");
    expect(result.dataFreshness).toBe("Last 7 days of orders and refunds");
  });

  it("uses fallback copy keys when copySource is fallback", () => {
    const t = createTranslate({
      "today.header.fallback.statusLabel": "Needs attention",
      "today.header.fallback.summary": "Overview data failed to load.",
      "today.header.fallback.bottleneck": "Return efficiency is weakening.",
      "today.header.fallback.opportunity": "Start with revenue, profit, and ROI.",
      "today.header.fallback.dataFreshness": "Default analysis copy",
    });
    const result = localizeTodayHeader({ ...liveHeader, copySource: "fallback" }, t);
    expect(result.statusLabel).toBe("Needs attention");
    expect(result.summary).toBe("Overview data failed to load.");
    expect(result.dataFreshness).toBe("Default analysis copy");
  });
});

describe("localizeReasonCard", () => {
  it("translates variant copy and leaves interpolated meta alone", () => {
    const t = createTranslate({
      "today.reasonCards.growth-change.title": "Why growth changed",
      "today.reasonCards.growth-change.label.up": "Growth quality",
      "today.reasonCards.growth-change.summary.up": "Growth continues, but check object quality.",
    });
    const card = {
      key: "growth-change",
      title: "增长为什么变化",
      value: "+6%",
      label: "增长质量",
      meta: "会话 1,200 / 转化率 2.1%",
      summary: "增长还在继续，但要先确认是健康对象在支撑，还是只把规模做大。",
      tone: "blue",
      variant: "up",
    } satisfies TodayReasonCard;
    const result = localizeReasonCard(card, t);
    expect(result.title).toBe("Why growth changed");
    expect(result.label).toBe("Growth quality");
    expect(result.summary).toBe("Growth continues, but check object quality.");
    expect(result.meta).toBe("会话 1,200 / 转化率 2.1%");
  });
});

describe("localizeCountryOption", () => {
  it("translates the ALL regions option and leaves named countries", () => {
    const t = createTranslate({ "today.filters.allCountries": "All regions" });
    expect(localizeCountryOption({ key: "ALL", label: "全部地区" }, t).label).toBe("All regions");
    expect(localizeCountryOption({ key: "US", label: "United States" }, t).label).toBe("United States");
    expect(localizeSelectedCountryLabel("ALL", "全部地区", t)).toBe("All regions");
  });
});

describe("localizeTodayOverviewReport", () => {
  it("maps metric, reason, and ROI labels", () => {
    const t = createTranslate({
      "today.header.status.watch": "Needs attention",
      "today.header.summary.watch": "Watch",
      "today.header.bottleneck.refund": "Refunds",
      "today.header.opportunity.repeat": "Repeat",
      "today.header.dataFreshness": "Fresh",
      "today.metricCards.revenue.label": "Revenue",
      "today.metricCards.revenue.summary": "See if the pie grew.",
      "today.reasonCards.growth-change.title": "Why growth changed",
      "today.reasonCards.growth-change.label.up": "Growth quality",
      "today.reasonCards.growth-change.summary.up": "Confirm healthy objects.",
      "today.roiCards.short_term.label": "Short-term ROI",
      "today.roiCards.short_term.summary": "Did the last 7 days leave a positive result?",
      "today.roiCards.status.strong": "Strong",
    });
    const report = {
      header: liveHeader,
      metricCards: [
        {
          key: "revenue",
          label: "收入",
          value: "$10",
          delta: "+6%",
          tone: "positive",
          source: "realized",
          summary: "先看盘子是否真正放大，再继续拆到具体收入对象。",
          href: "/app/today/revenue",
        },
      ],
      reasonCards: [
        {
          key: "growth-change",
          title: "增长为什么变化",
          value: "+6%",
          label: "增长质量",
          meta: "订单变化 +6% / 订单数 120",
          summary: "增长还在继续。",
          tone: "blue",
          variant: "up",
        },
      ],
      roiSummary: {
        cards: [
          {
            key: "short_term",
            label: "短期 ROI",
            statusLabel: "强",
            value: "1.9x",
            summary: "先看最近 7 天有没有留下正向经营结果。",
            dataQuality: "estimated",
            confidence: "medium",
            href: "/app/today/roi",
            statusKey: "strong",
          },
        ],
      },
    } satisfies TodayOverviewReport;
    const result = localizeTodayOverviewReport(report, t);
    expect(result.metricCards[0]?.label).toBe("Revenue");
    expect(result.reasonCards[0]?.title).toBe("Why growth changed");
    expect(result.roiSummary.cards[0]?.label).toBe("Short-term ROI");
    expect(result.roiSummary.cards[0]?.statusLabel).toBe("Strong");
  });
});

describe("localizeAnalysisPage", () => {
  it("reuses topic keys and translates card/todo copy", () => {
    const t = createTranslate({
      "today.topics.productTitle": "Product analysis",
      "today.topics.productSubtitle": "Pricing, SKU profit, inventory turns.",
      "today.topics.productSummary": "Answer three product questions first.",
      "today.analysisPages.product.principle1": "Price band must support profit.",
      "today.analysisCards.pricing.title": "Pricing analysis",
      "today.analysisCards.pricing.question": "Does the price band support conversion and profit?",
      "today.analysisCards.pricing.conclusion": "Confirm high AOV samples are repeatable.",
      "today.analysisCards.pricing.metricLabel": "AOV",
      "today.analysisCards.pricing.idea1": "Split high-AOV samples first.",
      "today.analysisTodos.price-band-aov.title": "Review high-AOV sources",
      "today.analysisTodos.price-band-aov.detail": "Open the revenue page.",
      "today.analysisTodos.price-band-aov.action": "View AOV",
      "today.analysisCards.pricing.assistantTitle": "Ask AI to refine pricing to-dos",
      "today.analysisCards.pricing.assistantDetail": "Turn this card into executable to-dos.",
      "today.analysis.refineAction": "Ask AI to refine to-dos",
    });
    const page = {
      key: "product",
      title: "产品分析",
      subtitle: "产品分析关注的是定价、单品利润和库存周转，不把产品问题混进广告或健康度里。",
      summary: "产品分析先回答三件事。",
      principles: ["定价不是只看卖不卖得动，还要看价格带是否支撑利润留存。"],
      cards: [
        {
          key: "pricing",
          title: "定价分析",
          question: "当前价格带是不是在支撑成交和利润，而不是只带来短期高客单？",
          conclusion: "先确认当前价格带带来的高客单，是不是可复制的健康样本。",
          metricLabel: "客单价",
          metricValue: "$88",
          evidence: [],
          ideas: ["先拆高客单样本，确认是不是少数异常订单把均值抬高。"],
          todos: [
            {
              key: "price-band-aov",
              title: "复核高客单来源",
              detail: "进入收入页确认高客单是不是来自少数样本订单。",
              actionLabel: "看收入 / 客单价",
              actionType: "open_report",
              payload: { path: "/app/today/revenue?focus=aov" },
            },
            {
              key: "定价分析-assistant",
              title: "把价格带进一步拆成可执行 today todo",
              detail: "把当前卡片交给 AI 进一步细化成可执行的 today todo。",
              actionLabel: "让 AI 细化 todo",
              actionType: "open_assistant",
              payload: { prompt: "keep-me" },
            },
          ],
        },
      ],
    } satisfies TodayAnalysisPageReport;
    const result = localizeAnalysisPage(page, t);
    expect(result.title).toBe("Product analysis");
    expect(result.principles[0]).toBe("Price band must support profit.");
    expect(result.cards[0]?.title).toBe("Pricing analysis");
    expect(result.cards[0]?.todos[0]?.title).toBe("Review high-AOV sources");
    expect(result.cards[0]?.todos[1]?.actionLabel).toBe("Ask AI to refine to-dos");
    expect(result.cards[0]?.todos[1]?.payload).toEqual({ prompt: "keep-me" });
  });
});

describe("localizeDecisionReport", () => {
  it("translates chrome copy and interpolates country, leaving dynamic summary", () => {
    const t = createTranslate({
      "today.decision.revenue.title": "Growth quality analysis",
      "today.decision.revenue.subtitle": "Current scope: {{country}}. Separate real growth from fake growth.",
      "today.decision.revenue.accent": "{{country}} / last 7 days",
      "today.decision.revenue.primaryQuestion": "Is recent revenue growth healthy?",
      "today.groups.top_profitable_products.title": "Top profitable products",
      "today.groups.top_profitable_products.summary": "These products keep profit.",
      "today.breakdowns.revenue-by-product.title": "Revenue by product",
      "today.breakdowns.revenue-by-product.summary": "See which products bring the money.",
    });
    const report = {
      key: "revenue",
      copyKey: "revenue",
      title: "增长质量分析",
      subtitle: "当前查看范围：全部地区。先区分真增长和假增长。",
      accent: "全部地区 / 近 7 天",
      primaryQuestion: "最近的收入增长到底是不是健康增长？",
      summary: "最近 7 天收入还在增长，但不能只看规模。",
      statuses: [],
      summaryMetrics: [],
      breakdowns: [
        {
          key: "revenue-by-product",
          title: "收入拆到商品",
          summary: "先确认钱主要从哪些商品来。",
          rows: [],
          relatedGroupKeys: [],
        },
      ],
      groups: [
        {
          key: "top_profitable_products",
          title: "Top 赚钱商品",
          tone: "positive",
          summary: "这组商品既带收入，也能留下利润。",
          items: [],
        },
      ],
      actions: [],
    } satisfies TodayDecisionReport;
    const result = localizeDecisionReport(report, t, "All regions");
    expect(result.title).toBe("Growth quality analysis");
    expect(result.subtitle).toBe("Current scope: All regions. Separate real growth from fake growth.");
    expect(result.accent).toBe("All regions / last 7 days");
    expect(result.summary).toBe("最近 7 天收入还在增长，但不能只看规模。");
    expect(result.groups[0]?.title).toBe("Top profitable products");
    expect(result.breakdowns[0]?.title).toBe("Revenue by product");
  });

  it("uses copyKey when a focus rewrite changes titles on the same breakdown key", () => {
    const t = createTranslate({
      "today.decision.revenue.orders.title": "Order scale analysis",
      "today.decision.revenue.orders.subtitle": "Current scope: {{country}}.",
      "today.decision.revenue.orders.accent": "Focus: orders",
      "today.decision.revenue.orders.primaryQuestion": "Is order growth healthy?",
      "today.breakdowns.orders-by-product.title": "Product mix behind order changes",
      "today.breakdowns.orders-by-product.summary": "Trace orders back to products.",
    });
    const report = {
      key: "revenue",
      copyKey: "revenue.orders",
      title: "订单规模分析",
      subtitle: "当前查看范围：全部地区。",
      accent: "焦点：订单数",
      primaryQuestion: "最近订单数的变化，是由健康订单在支撑吗？",
      summary: "订单数还在增长。",
      statuses: [],
      summaryMetrics: [],
      breakdowns: [
        {
          key: "revenue-by-product",
          copyKey: "orders-by-product",
          title: "订单变化对应的商品结构",
          summary: "订单规模本身不够。",
          rows: [],
          relatedGroupKeys: [],
        },
      ],
      groups: [],
      actions: [],
    } satisfies TodayDecisionReport;
    expect(localizeDecisionReport(report, t, "All regions").title).toBe("Order scale analysis");
    expect(localizeDecisionReport(report, t, "All regions").breakdowns[0]?.title).toBe(
      "Product mix behind order changes",
    );
  });
});
