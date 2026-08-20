import type { CSSProperties } from "react";
import type { HeadersFunction } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useTranslation } from "react-i18next";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";
import { useEmbeddedNavigate } from "../hooks/useEmbeddedNavigate";
import { useFeatureView } from "../lib/featureTrack";
import { getTodayOverviewModules, getTodayRoiMonitor } from "../lib/todayMetricModules";
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
  const modules = getTodayOverviewModules();
  const roiMonitor = getTodayRoiMonitor();
  useFeatureView("today");

  return (
    <div style={isMobile ? mobilePageContentStyle : pageContentStyle}>
      <DestinationPage
        title={t("todayDashboard.title")}
        subtitle="Today 首页先只保留经营状态和投资回报率监测两个模块：先看概括，再进入详情或图表。"
        titleBarTitle={t("nav.today")}
        backLabel={t("todayDashboard.back")}
        fallbackPath="/app"
        isMobile={isMobile}
      >
        <PageSurface
          title="经营状态"
          subtitle="基于已知数据先看流量、转化、订单三个模块。卡片暂时展示昨日值和 7 日均值的对比。"
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
                  <SurfaceButton label="查看详情" tone="subtle" onClick={() => navigate(module.detailPath)} />
                  <SurfaceButton label="查看图表" onClick={() => navigate(module.chartPath)} />
                </div>
              </div>
            ))}
          </div>
        </PageSurface>

        <PageSurface
          title="投资回报率监测"
          subtitle="把原来的 ROI 三层摘要和影响 ROI 的 Top 3 因子合并成一个模块，首页先直接看短期和长期结果。"
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

          <div style={factorBlockStyle}>
            <div style={factorHeaderStyle(isMobile)}>
              <div>
                <div style={pageMetricLabelStyle}>影响 ROI 的 Top 3 因子</div>
                <div style={pageHintTextStyle}>先告诉你当前 ROI 是被哪些环节拖住，而不是把判断拆散到多个区域。</div>
              </div>
              <div style={cardActionRowStyle(isMobile)}>
                <SurfaceButton label="查看 ROI 图表" onClick={() => navigate(roiMonitor.chartPath)} />
                <SurfaceButton label="查看 ROI 报告" tone="subtle" onClick={() => navigate(roiMonitor.reportPath)} />
              </div>
            </div>

            <div style={factorListStyle}>
              {roiMonitor.factors.map((factor) => (
                <div key={factor.title} style={factorItemStyle}>
                  <span style={{ ...roiBadgeBaseStyle, ...roiBadgeStyle(factor.tone) }}>
                    {factor.tone === "critical" ? "优先处理" : "继续跟进"}
                  </span>
                  <div style={{ flex: "1 1 0", minWidth: 0 }}>
                    <div style={factorTitleStyle}>{factor.title}</div>
                    <div style={pageHintTextStyle}>{factor.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </PageSurface>
      </DestinationPage>
    </div>
  );
}

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

function factorHeaderStyle(isMobile: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: isMobile ? "flex-start" : "center",
    justifyContent: "space-between",
    flexDirection: isMobile ? "column" : "row",
    gap: "1rem",
    marginBottom: "1rem",
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

const factorBlockStyle: CSSProperties = {
  marginTop: "1.25rem",
  paddingTop: "1.25rem",
  borderTop: `1px solid ${pageColorTokens.divider}`,
};

const factorListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.85rem",
};

const factorItemStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: "0.85rem",
  padding: "0.95rem 1rem",
  borderRadius: pageColorTokens.radiusControl,
  border: `1px solid ${pageColorTokens.border}`,
  background: pageColorTokens.surfaceMuted,
};

const factorTitleStyle: CSSProperties = {
  fontSize: "0.9rem",
  fontWeight: 700,
  color: pageColorTokens.textPrimary,
};
