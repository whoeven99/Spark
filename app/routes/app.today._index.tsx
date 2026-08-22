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
    const params = new URLSearchParams();
    params.set("returnTo", `${location.pathname}${location.search}`);
    if (filters.selectedCountry !== TODAY_ALL_COUNTRIES) {
      params.set("country", filters.selectedCountry);
    }
    const query = params.toString();
    return query ? `${path}?${query}` : path;
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
          summary={`当前范围：${filters.selectedCountryLabel}。这一版首页先统一回答增长质量、利润结果和回报效率。`}
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
                <div style={pageMetricLabelStyle}>收入</div>
                <div style={pageMetricValueStyle}>{report.header.metrics.revenue}</div>
              </div>
              <div style={headerMetricTileStyle}>
                <div style={pageMetricLabelStyle}>估算利润</div>
                <div style={pageMetricValueStyle}>{report.header.metrics.estimatedProfit}</div>
              </div>
              <div style={headerMetricTileStyle}>
                <div style={pageMetricLabelStyle}>估算利润率</div>
                <div style={pageMetricValueStyle}>{report.header.metrics.estimatedProfitMargin}</div>
              </div>
              <div style={headerMetricTileStyle}>
                <div style={pageMetricLabelStyle}>短期经营回报</div>
                <div style={pageMetricValueStyle}>{report.header.metrics.shortTermReturn}</div>
              </div>
            </div>
          </div>
          <div style={headerMetaRowStyle}>
            <span style={pageHintTextStyle}>数据新鲜度：{report.header.dataFreshness}</span>
            <span style={pageHintTextStyle}>数据置信度：{report.header.dataConfidence}</span>
          </div>
        </PageSurface>

        <PageSurface title="一级经营问题" subtitle="首页只保留 3 个正式入口，先收敛问题，再进对象分析。">
          <div style={cardGridStyle(isMobile, 3)}>
            {report.metricCards.map((card) => (
              <div key={card.key} style={pageStatusCardStyle}>
                <div style={cardHeaderStyle}>
                  <div style={pageMetricLabelStyle}>{card.label}</div>
                  <span style={metricSourceStyle}>{card.source === "estimated" ? "估算" : "已实现"}</span>
                </div>
                <div style={pageMetricValueStyle}>{card.value}</div>
                <div style={deltaTextStyle(card.tone)}>{card.delta}</div>
                <div style={subMetricRowStyle}>
                  {card.subMetrics.map((item) => (
                    <div key={item.label} style={subMetricChipStyle}>
                      <span style={subMetricLabelStyle}>{item.label}</span>
                      <strong style={subMetricValueStyle}>{item.value}</strong>
                    </div>
                  ))}
                </div>
                <p style={summaryTextStyle}>{card.summary}</p>
                <div style={cardActionRowStyle(isMobile)}>
                  <SurfaceButton label="查看详情" onClick={() => navigate(buildDetailPath(card.href))} />
                </div>
              </div>
            ))}
          </div>
        </PageSurface>

        <PageSurface title="为什么会这样" subtitle="这一层不展开长报告，只给出当前最需要记住的三条判断。">
          <div style={cardGridStyle(isMobile, 3)}>
            {report.reasonCards.map((card) => (
              <div key={card.key} style={reasonCardStyle}>
                <span style={{ ...reasonLabelStyle, ...reasonToneStyle(card.tone) }}>{card.label}</span>
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

        <PageSurface title="长期质量补充" subtitle="这里不再假装输出完整三层 ROI，只保留短期结果、长期信号和回收期数据状态。">
          <div style={cardGridStyle(isMobile, 3)}>
            {report.roiSummary.cards.map((card) => (
              <div key={card.key} style={pageStatusCardStyle}>
                <div style={cardHeaderStyle}>
                  <div style={pageMetricLabelStyle}>{card.label}</div>
                  <span style={metricSourceStyle}>{card.statusLabel}</span>
                </div>
                <div style={pageMetricValueStyle}>{card.value}</div>
                <div style={roiMetaStyle}>
                  数据质量：{card.dataQuality} / 置信度：{card.confidence}
                </div>
                <p style={summaryTextStyle}>{card.summary}</p>
                <div style={cardActionRowStyle(isMobile)}>
                  <SurfaceButton label="查看回报效率页" onClick={() => navigate(buildDetailPath(card.href))} />
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

const subMetricRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "0.6rem",
};

const subMetricChipStyle: CSSProperties = {
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  borderRadius: pageColorTokens.radiusControl,
  background: pageColorTokens.surfaceSubtle,
  padding: "0.65rem 0.75rem",
  display: "grid",
  gap: "0.2rem",
};

const subMetricLabelStyle: CSSProperties = {
  color: pageColorTokens.textFootnote,
  fontSize: "0.72rem",
};

const subMetricValueStyle: CSSProperties = {
  color: pageColorTokens.textPrimary,
  fontSize: "0.82rem",
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

const reasonMetaStyle: CSSProperties = {
  color: pageColorTokens.textFootnote,
  fontSize: "0.78rem",
};

const roiMetaStyle: CSSProperties = {
  color: pageColorTokens.textFootnote,
  fontSize: "0.78rem",
  marginTop: "0.35rem",
};
