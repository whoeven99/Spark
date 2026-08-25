import type { CSSProperties } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useLocation, useSearchParams } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useTranslation } from "react-i18next";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";
import { useEmbeddedNavigate } from "../hooks/useEmbeddedNavigate";
import { useFeatureView } from "../lib/featureTrack";
import { hasReadReportsScope } from "../lib/shopifyReports";
import { TODAY_ALL_COUNTRIES } from "../lib/todayGeo.shared";
import { authenticate } from "../shopify.server";
import { loadTodayOverviewReportData } from "../server/operations/todayGeo.server";
import {
  mobilePageContentStyle,
  pageColorTokens,
  pageContentStyle,
  pageHintTextStyle,
  pageMetricLabelStyle,
  pageMetricValueStyle,
  PageSurface,
  pageStatusCardStyle,
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
  useFeatureView("today");

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
          summary={`当前范围：${filters.selectedCountryLabel}。这一版首页先统一回答收入、成本、利润、利润率、订单数和客单价。`}
          notes={filters.dataNotes}
        />

        <PageSurface title="经营状态头部" subtitle="先判断最近 7 天是在健康增长、需要关注，还是已经进入盈利压力。">
          <div style={headerGridStyle(isMobile)}>
            <div style={headerMainCardStyle}>
              <span style={{ ...statusBadgeStyle, ...badgeStyle(report.header.status) }}>{report.header.statusLabel}</span>
              <div style={headerTitleStyle}>{report.header.summary}</div>
              <div style={headerNotesStyle}>
                <strong>主要瓶颈：</strong>
                {report.header.primaryBottleneck}
              </div>
              <div style={headerNotesStyle}>
                <strong>最大机会：</strong>
                {report.header.biggestOpportunity}
              </div>
            </div>

            <div style={headerMetricGridStyle}>
              <div style={headerMetricTileStyle}>
                <MetricHintLabel
                  as="div"
                  style={pageMetricLabelStyle}
                  text="收入"
                  content={getTodayHeaderMetricExplanation("revenue")}
                />
                <div style={pageMetricValueStyle}>{report.header.metrics.revenue}</div>
              </div>
              <div style={headerMetricTileStyle}>
                <MetricHintLabel
                  as="div"
                  style={pageMetricLabelStyle}
                  text="估算利润"
                  content={getTodayHeaderMetricExplanation("estimatedProfit")}
                />
                <div style={pageMetricValueStyle}>{report.header.metrics.estimatedProfit}</div>
              </div>
              <div style={headerMetricTileStyle}>
                <MetricHintLabel
                  as="div"
                  style={pageMetricLabelStyle}
                  text="估算利润率"
                  content={getTodayHeaderMetricExplanation("estimatedProfitMargin")}
                />
                <div style={pageMetricValueStyle}>{report.header.metrics.estimatedProfitMargin}</div>
              </div>
              <div style={headerMetricTileStyle}>
                <MetricHintLabel
                  as="div"
                  style={pageMetricLabelStyle}
                  text="短期经营回报"
                  content={getTodayHeaderMetricExplanation("shortTermReturn")}
                />
                <div style={pageMetricValueStyle}>{report.header.metrics.shortTermReturn}</div>
              </div>
            </div>
          </div>
          <div style={headerMetaRowStyle}>
            <span style={pageHintTextStyle}>数据新鲜度：{report.header.dataFreshness}</span>
            <span style={pageHintTextStyle}>数据置信度：{report.header.dataConfidence}</span>
          </div>
        </PageSurface>

        <PageSurface title="核心经营指标" subtitle="首页先保留 6 张经营卡，直接进入对应的 B 报告。">
          <div style={cardGridStyle(isMobile, 3)}>
            {report.metricCards.map((card) => (
              <div key={card.key} style={pageStatusCardStyle}>
                <div style={cardHeaderStyle}>
                  <MetricHintLabel
                    as="div"
                    style={pageMetricLabelStyle}
                    text={card.label}
                    content={getTodayMetricCardExplanation(card.key)}
                  />
                  <span style={metricSourceStyle}>{card.source === "estimated" ? "估算" : "已实现"}</span>
                </div>
                <div style={pageMetricValueStyle}>{card.value}</div>
                <div style={deltaTextStyle(card.tone)}>{card.delta}</div>
                {card.summary ? <p style={summaryTextStyle}>{card.summary}</p> : null}
                <div style={cardActionRowStyle(isMobile)}>
                  <SurfaceButton label="进入分析" onClick={() => navigate(buildDetailPath(card.href))} />
                </div>
              </div>
            ))}
          </div>
        </PageSurface>

        <PageSurface title="为什么会这样" subtitle="这一层不展开长报告，只给出当前最需要记住的三条判断。">
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
                    <SurfaceButton label="继续看对象" onClick={() => navigate(buildDetailPath(card.href!))} />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </PageSurface>

        <PageSurface title="ROI 三层摘要" subtitle="这里固定展示短期、回收期、长期三层，不再把长期价值混成首页补充块。">
          <div style={cardGridStyle(isMobile, 3)}>
            {report.roiSummary.cards.map((card) => (
              <div key={card.key} style={pageStatusCardStyle}>
                <div style={cardHeaderStyle}>
                  <MetricHintLabel
                    as="div"
                    style={pageMetricLabelStyle}
                    text={card.label}
                    content={getTodayRoiSummaryExplanation(card.key)}
                  />
                  <span style={metricSourceStyle}>{card.statusLabel}</span>
                </div>
                <div style={pageMetricValueStyle}>{card.value}</div>
                <div style={roiMetaStyle}>
                  数据质量：{card.dataQuality} / 置信度：{card.confidence}
                </div>
                <p style={summaryTextStyle}>{card.summary}</p>
                <div style={cardActionRowStyle(isMobile)}>
                  <SurfaceButton label="查看 ROI 页" onClick={() => navigate(buildDetailPath(card.href))} />
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

function headerGridStyle(isMobile: boolean): CSSProperties {
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

const headerMetricGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "0.75rem",
};

const headerMetricTileStyle: CSSProperties = {
  padding: "0.9rem",
  borderRadius: pageColorTokens.radiusControl,
  border: `1px solid ${pageColorTokens.border}`,
  background: pageColorTokens.surfaceSubtle,
};

const headerMetaRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.75rem 1rem",
  marginTop: "0.9rem",
};

const cardHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.75rem",
  marginBottom: "0.5rem",
};

const metricSourceStyle: CSSProperties = {
  color: pageColorTokens.textFootnote,
  fontSize: "0.75rem",
  fontWeight: 700,
};

const summaryTextStyle: CSSProperties = {
  margin: 0,
  color: pageColorTokens.textSecondary,
  fontSize: "0.84rem",
  lineHeight: 1.6,
};

function deltaTextStyle(tone: "positive" | "neutral" | "warning" | "negative"): CSSProperties {
  return {
    marginTop: "0.35rem",
    fontSize: "0.8rem",
    fontWeight: 700,
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

const reasonCardStyle: CSSProperties = {
  border: `1px solid ${pageColorTokens.border}`,
  borderRadius: pageColorTokens.radiusCard,
  background: pageColorTokens.surfaceSubtle,
  padding: "1rem",
  display: "grid",
  gap: "0.5rem",
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

function getTodayHeaderMetricExplanation(
  key: "revenue" | "estimatedProfit" | "estimatedProfitMargin" | "shortTermReturn",
): string {
  if (key === "revenue") {
    return "收入 = 近 7 天非取消订单的 totalPrice 求和。";
  }
  if (key === "estimatedProfit") {
    return [
      "估算利润 = 收入 - 估算成本。",
      "估算成本 = 估算 COGS + 折扣 + 支付手续费 + 退款损耗。",
      "估算 COGS = subtotal × (1 - 默认毛利率)。",
    ].join("\n");
  }
  if (key === "estimatedProfitMargin") {
    return "估算利润率 = 估算利润 / 收入。";
  }
  return "短期经营回报 = 收入 / 估算成本，用来看最近 7 天有没有留下正向经营结果。";
}

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

const roiMetaStyle: CSSProperties = {
  color: pageColorTokens.textFootnote,
  fontSize: "0.78rem",
  marginTop: "0.35rem",
};
