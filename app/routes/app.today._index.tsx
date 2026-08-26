import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData, useLocation, useSearchParams } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useTranslation } from "react-i18next";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";
import { useEmbeddedNavigate } from "../hooks/useEmbeddedNavigate";
import { useFeatureView } from "../lib/featureTrack";
import { hasReadReportsScope } from "../lib/shopifyReports";
import { TODAY_ALL_COUNTRIES } from "../lib/todayGeo.shared";
import { authenticate } from "../shopify.server";
import { loadTodayOverviewReportData } from "../server/operations/todayGeo.server";
import type { ValueLayerResponse } from "./api.today-value-layer";
import {
  mobilePageContentStyle,
  pageColorTokens,
  pageContentStyle,
  pageHintTextStyle,
  PageSurface,
} from "./page/pageUiStyles";
import { DestinationPage } from "./component/shared/DestinationPage";
import { MetricHintLabel } from "./component/shared/MetricHintLabel";
import { TodayCountryFilterCard } from "./component/today/TodayCountryFilterCard";

function SurfaceButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 36,
        padding: "0.55rem 0.9rem",
        borderRadius: pageColorTokens.radiusControl,
        border: `1px solid ${pageColorTokens.brandBlue}`,
        background: pageColorTokens.brandBlue,
        color: "#ffffff",
        fontSize: "0.8125rem",
        fontWeight: 700,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

function badgeStyle(status: "healthy" | "watch" | "risk"): CSSProperties {
  if (status === "risk") {
    return {
      color: pageColorTokens.criticalText,
      background: pageColorTokens.criticalBg,
      border: "1px solid #f2b8ae",
    };
  }
  if (status === "watch") {
    return {
      color: "#9a5b00",
      background: pageColorTokens.warningBg,
      border: "1px solid #f1d58d",
    };
  }
  return {
    color: pageColorTokens.brandGreenDark,
    background: pageColorTokens.brandGreenLight,
    border: "1px solid rgba(0, 128, 96, 0.2)",
  };
}

function reasonToneStyle(tone: "blue" | "green" | "orange" | "red"): CSSProperties {
  if (tone === "red") return { background: pageColorTokens.criticalBg, color: pageColorTokens.criticalText };
  if (tone === "orange") return { background: pageColorTokens.warningBg, color: "#9a5b00" };
  if (tone === "green") return { background: pageColorTokens.brandGreenLight, color: pageColorTokens.brandGreenDark };
  return { background: pageColorTokens.brandBlueLight, color: pageColorTokens.brandBlueDark };
}

export default function TodayOverview() {
  const { t } = useTranslation();
  const { isMobile } = useResponsiveLayout();
  const navigate = useEmbeddedNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const data = useLoaderData<typeof loader>();
  const { filters, report } = data;
  const valueFetcher = useFetcher<ValueLayerResponse>();
  const lastValuePathRef = useRef<string | null>(null);
  useFeatureView("today");
  const reportConclusionItems = [
    { label: "主要瓶颈", detail: report.header.primaryBottleneck },
    { label: "最大机会", detail: report.header.biggestOpportunity },
    ...report.reasonCards.slice(0, 3).map((card) => ({
      label: card.label,
      detail: card.summary,
    })),
  ];
  const coreMetricItems = [
    ...report.metricCards.map((card) => ({
      key: card.key,
      label: card.label,
      value: card.value,
      delta: card.delta,
      tone: card.tone,
      href: card.href,
      hint: getTodayMetricCardExplanation(card.key),
    })),
    ...report.roiSummary.cards.map((card) => ({
      key: card.key,
      label: card.label,
      value: card.value,
      delta: card.summary,
      tone: "warning" as const,
      href: card.href,
      hint: getTodayRoiSummaryExplanation(card.key),
    })),
  ];
  const valuePath = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.selectedCountry !== TODAY_ALL_COUNTRIES) {
      params.set("country", filters.selectedCountry);
    }
    const query = params.toString();
    return query ? `/api/today-value-layer?${query}` : "/api/today-value-layer";
  }, [filters.selectedCountry]);
  const valueLayer = valueFetcher.data?.ok ? valueFetcher.data.value : null;
  const customerLtvValue = valueLayer
    ? formatCurrencyValue(valueLayer.customers.averageDynamicLtv, valueLayer.channels.currency)
    : valueFetcher.state !== "idle"
      ? "加载中"
      : "待补";
  const analysisCards = data.analysisOverviewCards.map((card) => ({
    ...card,
    metricValue: card.key === "customer_value" && customerLtvValue !== "待补" ? customerLtvValue : card.metricValue,
  }));

  useEffect(() => {
    if (lastValuePathRef.current === valuePath) return;
    lastValuePathRef.current = valuePath;
    valueFetcher.load(valuePath);
  }, [valueFetcher, valuePath]);

  const handleCountryChange = (country: string) => {
    const params = new URLSearchParams(searchParams);
    if (country === TODAY_ALL_COUNTRIES) {
      params.delete("country");
    } else {
      params.set("country", country);
    }
    setSearchParams(params, { replace: true, preventScrollReset: true });
  };

  const buildDetailPath = (path: string) => {
    const [pathname, rawSearch] = path.split("?");
    const params = new URLSearchParams(rawSearch ?? "");
    params.set("returnTo", `${location.pathname}${location.search}`);
    if (filters.selectedCountry !== TODAY_ALL_COUNTRIES) {
      params.set("country", filters.selectedCountry);
    }
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  };

  return (
    <div style={isMobile ? mobilePageContentStyle : pageContentStyle}>
      <DestinationPage
        title={t("todayDashboard.title")}
        subtitle="Today 先回答赚没赚钱、为什么会这样、下一步先看哪个对象。"
        titleBarTitle={t("nav.today")}
        backLabel={t("todayDashboard.back")}
        fallbackPath="/app"
        isMobile={isMobile}
        chromeless
      >
        <TodayCountryFilterCard
          options={filters.countries.map((item) => ({ key: item.key, label: item.label }))}
          activeCountry={filters.selectedCountry}
          onChange={handleCountryChange}
          notes={filters.dataNotes}
        />

        <PageSurface title="经营报告" subtitle="首页先给出经营主结论；具体数据判断继续进入下一级报告和对象页展开。">
          <div style={reportOverviewGridStyle(isMobile)}>
            <div style={headerMainCardStyle}>
              <span style={{ ...statusBadgeStyle, ...badgeStyle(report.header.status) }}>{report.header.statusLabel}</span>
              <div style={headerTitleStyle}>当前经营主结论</div>
              <div style={headerLeadSummaryStyle}>{report.header.summary}</div>
            </div>

            <div style={reportConclusionListStyle}>
              {reportConclusionItems.map((item) => (
                <div key={`${item.label}-${item.detail}`} style={reportConclusionItemStyle}>
                  <div style={reportConclusionLabelStyle}>{item.label}</div>
                  <div style={headerNotesStyle}>{item.detail}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={headerMetaRowStyle}>
            <span style={pageHintTextStyle}>数据新鲜度：{report.header.dataFreshness}</span>
            <span style={pageHintTextStyle}>数据置信度：{report.header.dataConfidence}</span>
          </div>
        </PageSurface>

        <PageSurface title="核心经营指标" subtitle="首页先保留核心经营卡，并直接进入对应的 B 报告。">
          <div style={coreMetricListStyle}>
            {coreMetricItems.map((item) => (
              <div key={item.key} style={coreMetricRowStyle(isMobile)}>
                <div style={coreMetricMainStyle}>
                  <MetricHintLabel
                    as="div"
                    style={coreMetricLabelStyle}
                    text={item.label}
                    content={item.hint}
                  />
                  <div style={coreMetricValueStyle}>{item.value}</div>
                  <div style={coreMetricDeltaStyle(item.tone)}>{item.delta}</div>
                </div>
                <div style={coreMetricActionStyle(isMobile)}>
                  <SurfaceButton label="进入分析" onClick={() => navigate(buildDetailPath(item.href))} />
                </div>
              </div>
            ))}
          </div>
        </PageSurface>

        <PageSurface title="分项报告" subtitle="不同数据方向的结论继续在下一级报告里展开，这里只保留当前焦点和入口。">
          <div style={cardGridStyle(isMobile, 3)}>
            {report.reasonCards.map((card) => (
              <div key={card.key} style={reasonCardStyle}>
                <MetricHintLabel
                  as="span"
                  style={{ ...reasonLabelStyle, ...reasonToneStyle(card.tone) }}
                  text={card.label}
                  content={getTodayReasonCardExplanation(card.key)}
                />
                <strong style={reasonTitleStyle}>{card.title}</strong>
                <div style={reasonValueStyle}>{card.value}</div>
                <div style={reasonMetaStyle}>{card.meta}</div>
                <p style={summaryTextStyle}>{card.summary}</p>
                {card.href ? (
                  <div style={cardActionRowStyle(isMobile)}>
                    <SurfaceButton label="进入报告" onClick={() => navigate(buildDetailPath(card.href!))} />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </PageSurface>

        <PageSurface title="专题分析" subtitle="这组卡片强调的是指标 + 分析结论，用来继续下钻到更完整的详情报告，不和健康度卡片混用。">
          <div style={analysisCardGridStyle(isMobile)}>
            {analysisCards.map((card) => (
              <div key={card.key} style={analysisCardStyle}>
                <div style={analysisCardHeaderStyle}>
                  <strong style={analysisCardTitleStyle}>{card.title}</strong>
                </div>
                <div style={analysisQuestionLabelStyle}>问题</div>
                <p style={analysisQuestionTextStyle}>{card.question}</p>
                <div style={analysisMetricLabelStyle}>{card.metricLabel}</div>
                <div style={analysisMetricValueStyle}>{card.metricValue}</div>
                <div style={analysisConclusionLabelStyle}>分析结论</div>
                <p style={summaryTextStyle}>{card.conclusion}</p>
                <div style={analysisTodoMetaStyle}>已整理 {card.todoCount} 条可执行 todo</div>
                <div style={cardActionRowStyle(isMobile)}>
                  <SurfaceButton label="进入详情报告" onClick={() => navigate(buildDetailPath(card.href))} />
                </div>
              </div>
            ))}
          </div>
        </PageSurface>

      </DestinationPage>
    </div>
  );
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  return loadTodayOverviewReportData({
    shop: session.shop,
    admin,
    hasReadReports: hasReadReportsScope(session.scope),
    requestedCountry: url.searchParams.get("country"),
  });
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

function cardGridStyle(isMobile: boolean, columns: number): CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr" : `repeat(${columns}, minmax(0, 1fr))`,
    gap: "1rem",
  };
}

function analysisCardGridStyle(isMobile: boolean): CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
    gap: "1rem",
  };
}

function reportOverviewGridStyle(isMobile: boolean): CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1.1fr) minmax(0, 0.9fr)",
    gap: "1rem",
  };
}

function cardActionRowStyle(isMobile: boolean): CSSProperties {
  return {
    display: "flex",
    flexDirection: isMobile ? "column" : "row",
    gap: "0.75rem",
    marginTop: "0.85rem",
  };
}

const statusBadgeStyle: CSSProperties = {
  display: "inline-flex",
  width: "fit-content",
  alignItems: "center",
  padding: "0.28rem 0.6rem",
  borderRadius: 999,
  fontSize: "0.75rem",
  fontWeight: 700,
};

const headerMainCardStyle: CSSProperties = {
  display: "grid",
  gap: "0.8rem",
  padding: "1rem",
  borderRadius: pageColorTokens.radiusCard,
  border: `1px solid ${pageColorTokens.border}`,
  background: pageColorTokens.surfaceSubtle,
};

const headerTitleStyle: CSSProperties = {
  fontSize: "0.8rem",
  fontWeight: 700,
  color: pageColorTokens.textSecondary,
  letterSpacing: "0.02em",
};

const headerLeadSummaryStyle: CSSProperties = {
  fontSize: "1.2rem",
  fontWeight: 760,
  color: pageColorTokens.textPrimary,
  lineHeight: 1.35,
};

const headerNotesStyle: CSSProperties = {
  color: pageColorTokens.textSecondary,
  fontSize: "0.875rem",
  lineHeight: 1.65,
};

const reportConclusionListStyle: CSSProperties = {
  display: "grid",
  gap: "0.75rem",
};

const reportConclusionItemStyle: CSSProperties = {
  padding: "0.9rem",
  borderRadius: pageColorTokens.radiusControl,
  border: `1px solid ${pageColorTokens.border}`,
  background: pageColorTokens.surfaceSubtle,
  display: "grid",
  gap: "0.3rem",
};

const reportConclusionLabelStyle: CSSProperties = {
  fontSize: "0.78rem",
  fontWeight: 700,
  color: pageColorTokens.textFootnote,
};

const headerMetaRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.75rem 1rem",
  marginTop: "0.9rem",
};

const coreMetricListStyle: CSSProperties = {
  display: "grid",
  gap: "0.75rem",
};

function coreMetricRowStyle(isMobile: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: isMobile ? "stretch" : "center",
    justifyContent: "space-between",
    flexDirection: isMobile ? "column" : "row",
    gap: isMobile ? "0.9rem" : "1rem",
    padding: isMobile ? "0.95rem" : "0.9rem 1rem",
    border: `1px solid ${pageColorTokens.border}`,
    borderRadius: pageColorTokens.radiusControl,
    background: pageColorTokens.surfaceSubtle,
  };
}

const coreMetricMainStyle: CSSProperties = {
  display: "grid",
  gap: "0.22rem",
  minWidth: 0,
  flex: "1 1 auto",
};

const coreMetricLabelStyle: CSSProperties = {
  fontSize: "0.95rem",
  fontWeight: 760,
  color: pageColorTokens.textPrimary,
};

const coreMetricValueStyle: CSSProperties = {
  fontSize: "1.6rem",
  fontWeight: 780,
  color: pageColorTokens.textPrimary,
  lineHeight: 1.15,
};

function coreMetricDeltaStyle(tone: "positive" | "neutral" | "warning" | "negative"): CSSProperties {
  return {
    fontSize: "0.95rem",
    fontWeight: 800,
    color:
      tone === "negative"
        ? pageColorTokens.critical
        : tone === "warning"
          ? pageColorTokens.warning
          : tone === "positive"
            ? pageColorTokens.brandGreen
            : pageColorTokens.textSecondary,
  };
}

function coreMetricActionStyle(isMobile: boolean): CSSProperties {
  return {
    flexShrink: 0,
    alignSelf: isMobile ? "stretch" : "center",
  };
}

const summaryTextStyle: CSSProperties = {
  margin: 0,
  color: pageColorTokens.textSecondary,
  fontSize: "0.84rem",
  lineHeight: 1.6,
};

const reasonCardStyle: CSSProperties = {
  border: `1px solid ${pageColorTokens.border}`,
  borderRadius: pageColorTokens.radiusCard,
  background: pageColorTokens.surfaceSubtle,
  padding: "1rem",
  display: "grid",
  gap: "0.5rem",
};

const analysisCardStyle: CSSProperties = {
  border: `1px solid ${pageColorTokens.border}`,
  borderRadius: pageColorTokens.radiusCard,
  background: pageColorTokens.surfaceSubtle,
  padding: "1rem",
  display: "grid",
  gap: "0.42rem",
};

const analysisCardHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.75rem",
};

const analysisCardTitleStyle: CSSProperties = {
  fontSize: "1rem",
  color: pageColorTokens.textPrimary,
};

const analysisQuestionLabelStyle: CSSProperties = {
  fontSize: "0.78rem",
  fontWeight: 700,
  color: pageColorTokens.textSecondary,
};

const analysisQuestionTextStyle: CSSProperties = {
  margin: 0,
  color: pageColorTokens.textPrimary,
  fontSize: "0.88rem",
  fontWeight: 650,
  lineHeight: 1.55,
};

const analysisMetricLabelStyle: CSSProperties = {
  fontSize: "0.78rem",
  fontWeight: 700,
  color: pageColorTokens.textFootnote,
};

const analysisMetricValueStyle: CSSProperties = {
  fontSize: "1.4rem",
  fontWeight: 780,
  color: pageColorTokens.textPrimary,
  lineHeight: 1.2,
};

const analysisConclusionLabelStyle: CSSProperties = {
  fontSize: "0.78rem",
  fontWeight: 700,
  color: pageColorTokens.textSecondary,
  marginTop: "0.15rem",
};

const analysisTodoMetaStyle: CSSProperties = {
  color: pageColorTokens.textFootnote,
  fontSize: "0.78rem",
  fontWeight: 700,
};

const reasonLabelStyle: CSSProperties = {
  display: "inline-flex",
  width: "fit-content",
  alignItems: "center",
  padding: "0.28rem 0.6rem",
  borderRadius: 999,
  fontSize: "0.75rem",
  fontWeight: 700,
};

const reasonTitleStyle: CSSProperties = {
  fontSize: "0.95rem",
  color: pageColorTokens.textPrimary,
};

const reasonValueStyle: CSSProperties = {
  fontSize: "1.35rem",
  fontWeight: 760,
  color: pageColorTokens.textPrimary,
};

function getTodayMetricCardExplanation(
  key: "revenue" | "cost" | "profit" | "profit_margin" | "orders" | "aov",
): string {
  if (key === "revenue") {
    return "收入 = 近 7 天非取消订单的 totalPrice 求和。";
  }
  if (key === "cost") {
    return [
      "成本 = 估算成本。",
      "估算成本 = 估算 COGS + 折扣 + 支付手续费 + 退款损耗。",
      "估算 COGS = subtotal × (1 - 默认毛利率)。",
    ].join("\n");
  }
  if (key === "profit") {
    return [
      "利润 = 收入 - 估算成本。",
      "这里是经营估算口径，不是会计结账口径。",
    ].join("\n");
  }
  if (key === "profit_margin") {
    return "利润率 = 利润 / 收入，用来判断规模增长有没有真正转成赚钱质量。";
  }
  if (key === "orders") {
    return "订单数 = 近 7 天非取消订单数量。";
  }
  return "客单价 = 收入 / 订单数。";
}

function getTodayReasonCardExplanation(key: string): string {
  if (key === "growth-change") {
    return "增长变化 = (近 7 天收入 - 可比基线收入) / 可比基线收入。";
  }
  if (key === "profit-erosion") {
    return "利润侵蚀优先看两类损耗：退款占比 = 退款损耗 / 收入，折扣占比 = 折扣 / 收入；页面展示的是当前更值得优先盯的那一项。";
  }
  return "回报效率 = 短期经营回报 = 收入 / 估算成本。";
}

function getTodayRoiSummaryExplanation(key: "short_term" | "payback" | "lifetime"): string {
  if (key === "short_term") {
    return "短期 ROI = 近 7 天收入 / 近 7 天估算投入成本。";
  }
  if (key === "payback") {
    return "回收期 ROI 需要 CAC 和 cohort 回收窗口。当前数据还没接入，所以先展示缺口而不伪造结果。";
  }
  return "长期 ROI 需要长期回收与复购收益口径。当前只保留说明，避免把不完整数据当成结论。";
}

const reasonMetaStyle: CSSProperties = {
  color: pageColorTokens.textFootnote,
  fontSize: "0.78rem",
};

function formatCurrencyValue(value: number, currencyCode: string | null | undefined): string {
  if (!Number.isFinite(value)) return "—";
  if (!currencyCode) return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(value);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: 0,
  }).format(value);
}
