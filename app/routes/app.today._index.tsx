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
import { loadTodayOverviewData } from "../server/operations/todayGeo.server";
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

type RoiTone = "positive" | "warning" | "critical";

function SurfaceButton({
  label,
  onClick,
  tone = "primary",
}: {
  label: string;
  onClick: () => void;
  tone?: "primary" | "subtle";
}) {
  const style: CSSProperties =
    tone === "primary"
      ? {
          border: `1px solid ${pageColorTokens.brandBlue}`,
          background: pageColorTokens.brandBlue,
          color: "#ffffff",
        }
      : {
          border: `1px solid ${pageColorTokens.border}`,
          background: pageColorTokens.surface,
          color: pageColorTokens.textBody,
        };

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
        fontSize: "0.8125rem",
        fontWeight: 700,
        cursor: "pointer",
        ...style,
      }}
    >
      {label}
    </button>
  );
}

function roiBadgeStyle(tone: RoiTone): CSSProperties {
  if (tone === "critical") {
    return {
      color: pageColorTokens.criticalText,
      background: pageColorTokens.criticalBg,
      border: "1px solid #f2b8ae",
    };
  }
  if (tone === "warning") {
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

export default function TodayOverview() {
  const { t } = useTranslation();
  const { isMobile } = useResponsiveLayout();
  const navigate = useEmbeddedNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const data = useLoaderData<typeof loader>();
  const { modules, roiMonitor, filters } = data;
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
    return `${path}?${params.toString()}`;
  };

  return (
    <div style={isMobile ? mobilePageContentStyle : pageContentStyle}>
      <DestinationPage
        title={t("todayDashboard.title")}
        subtitle="Today 只讨论赚钱：先看 ROI 和关键经营模块，再进入详情页判断今天是哪里在支撑或拖累赚钱结果。"
        titleBarTitle={t("nav.today")}
        backLabel={t("todayDashboard.back")}
        fallbackPath="/app"
        isMobile={isMobile}
      >
        <TodayCountryFilterCard
          options={filters.countries.map((item) => ({ key: item.key, label: item.label }))}
          activeCountry={filters.selectedCountry}
          onChange={handleCountryChange}
          summary={`当前范围：${filters.selectedCountryLabel}。这一版先支持总览 + 按国家/地区切换，帮助客户直接比较不同地区的赚钱结果。`}
          notes={filters.dataNotes}
        />

        <PageSurface
          title="核心指标"
          subtitle="首页顶部先看地区维度的赚钱效率，先判断当前范围是在承压、稳定，还是已经回到健康区间。"
        >
          <div style={moduleGridStyle(isMobile, 2)}>
            {roiMonitor.metrics.map((metric) => (
              <div key={metric.key} style={pageStatusCardStyle}>
                <div style={cardHeaderStyle}>
                  <div style={pageMetricLabelStyle}>{metric.title}</div>
                  <span style={{ ...roiBadgeBaseStyle, ...roiBadgeStyle(metric.tone) }}>{metric.deltaValue}</span>
                </div>
                <div style={metricPairStyle}>
                  <div>
                    <div style={miniHintStyle}>{metric.currentLabel}</div>
                    <div style={pageMetricValueStyle}>{metric.currentValue}</div>
                  </div>
                  <div>
                    <div style={miniHintStyle}>{metric.baselineLabel}</div>
                    <div style={secondaryMetricValueStyle}>{metric.baselineValue}</div>
                  </div>
                </div>
                <p style={summaryTextStyle}>{metric.summary}</p>
              </div>
            ))}
          </div>
          <div style={cardActionRowStyle(isMobile)}>
            <SurfaceButton label="查看 ROI 详情" onClick={() => navigate(buildDetailPath(roiMonitor.chartPath))} />
          </div>
        </PageSurface>

        <PageSurface
          title="经营模块"
          subtitle="接着再收敛成 3 个解释地区赚钱结果的经营模块：收入与订单、流量质量、转化承接。"
        >
          <div style={moduleGridStyle(isMobile, 3)}>
            {modules.map((module) => (
              <div key={module.key} style={pageStatusCardStyle}>
                <div style={cardHeaderStyle}>
                  <div style={pageMetricLabelStyle}>{module.title}</div>
                  <div style={miniHintStyle}>{module.deltaLabel}</div>
                </div>
                <div style={metricPairStyle}>
                  <div>
                    <div style={miniHintStyle}>{module.yesterdayLabel}</div>
                    <div style={pageMetricValueStyle}>{module.yesterdayValue}</div>
                  </div>
                  <div>
                    <div style={miniHintStyle}>{module.averageLabel}</div>
                    <div style={secondaryMetricValueStyle}>{module.averageValue}</div>
                  </div>
                </div>
                <div style={deltaPillStyle}>{module.deltaValue}</div>
                <p style={summaryTextStyle}>{module.summary}</p>
                <p style={pageHintTextStyle}>{module.chartHint}</p>
                <div style={cardActionRowStyle(isMobile)}>
                  <SurfaceButton label="查看模块详情" onClick={() => navigate(buildDetailPath(module.detailPath))} />
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
  return loadTodayOverviewData({
    shop: session.shop,
    admin,
    hasReadReports: hasReadReportsScope(session.scope),
    requestedCountry: url.searchParams.get("country"),
  });
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

function moduleGridStyle(isMobile: boolean, columns: number): CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr" : `repeat(${columns}, minmax(0, 1fr))`,
    gap: "1rem",
  };
}

function cardActionRowStyle(isMobile: boolean): CSSProperties {
  return {
    display: "flex",
    flexDirection: isMobile ? "column" : "row",
    gap: "0.75rem",
    marginTop: "1rem",
  };
}

const cardHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.75rem",
  marginBottom: "0.85rem",
};

const metricPairStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "0.9rem",
  alignItems: "end",
};

const miniHintStyle: CSSProperties = {
  fontSize: "0.75rem",
  color: pageColorTokens.textSecondary,
};

const secondaryMetricValueStyle: CSSProperties = {
  margin: "0.2rem 0 0",
  fontSize: "1.05rem",
  fontWeight: 700,
  color: pageColorTokens.textBody,
};

const deltaPillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  marginTop: "0.85rem",
  padding: "0.22rem 0.6rem",
  borderRadius: "999px",
  fontSize: "0.75rem",
  fontWeight: 700,
  color: pageColorTokens.brandBlue,
  background: pageColorTokens.brandBlueLight,
};

const summaryTextStyle: CSSProperties = {
  margin: "0.85rem 0 0",
  fontSize: "0.875rem",
  lineHeight: 1.55,
  color: pageColorTokens.textBody,
};

const roiBadgeBaseStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0.22rem 0.6rem",
  borderRadius: "999px",
  fontSize: "0.75rem",
  fontWeight: 700,
};
