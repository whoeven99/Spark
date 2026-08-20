import type { CSSProperties, ReactNode } from "react";
import { useEmbeddedNavigate } from "../../hooks/useEmbeddedNavigate";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { useFeatureView } from "../../lib/featureTrack";
import type { TodayMetricDetail, TodayMetricStatus } from "../../lib/todayMetricModules";
import {
  mobilePageContentStyle,
  pageAccentBadgeStyle,
  pageColorTokens,
  pageContentStyle,
  pageHintTextStyle,
  pageIntroBannerStyle,
  pageMetaTextStyle,
  pageMetricLabelStyle,
  pageMetricValueStyle,
  PageHeaderNav,
  PageMetricCard,
  PageSurface,
  pageSectionHeaderRowStyle,
  pageSectionMajorTitleStyle,
  pageStatusCardStyle,
} from "./pageUiStyles";

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "0.8125rem",
};

const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "0.65rem 0.5rem",
  color: pageColorTokens.textSecondary,
  borderBottom: `1px solid ${pageColorTokens.borderSubtle}`,
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const tdStyle: CSSProperties = {
  padding: "0.65rem 0.5rem",
  borderBottom: `1px solid ${pageColorTokens.divider}`,
  color: pageColorTokens.textBody,
  verticalAlign: "top",
};

function resolveStatusTone(status: TodayMetricStatus["status"]): "success" | "warning" | "critical" {
  if (status === "healthy") return "success";
  if (status === "watch") return "warning";
  return "critical";
}

function resolveStatusLabel(status: TodayMetricStatus["status"]): string {
  if (status === "healthy") return "正常";
  if (status === "watch") return "关注";
  return "风险";
}

function TableWrap({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        width: "100%",
        overflowX: "auto",
        WebkitOverflowScrolling: "touch",
      }}
    >
      {children}
    </div>
  );
}

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

export function TodayMetricDetailPage({
  data,
}: {
  data: TodayMetricDetail;
}) {
  const { isMobile } = useResponsiveLayout();
  const navigate = useEmbeddedNavigate();
  useFeatureView("today");

  return (
    <>
      <div style={pageIntroBannerStyle({ marginBottom: "1.5rem" })}>{data.intro}</div>

      <div style={{ ...pageContentStyle, ...(isMobile ? mobilePageContentStyle : null) }}>
        <PageHeaderNav
          title={data.title}
          subtitle={data.subtitle}
          titleBarTitle={data.title}
          backLabel="返回经营"
          fallbackPath="/app/today"
          rightAction={<SurfaceButton label={data.chartLabel} onClick={() => navigate(data.chartHref)} />}
        />

        <section>
          <div
            style={
              isMobile
                ? { ...pageSectionHeaderRowStyle, flexDirection: "column", alignItems: "flex-start", gap: "0.65rem" }
                : pageSectionHeaderRowStyle
            }
          >
            <h2 style={pageSectionMajorTitleStyle}>核心摘要</h2>
            <span style={pageAccentBadgeStyle}>{data.accent}</span>
          </div>
          <PageMetricCard metrics={data.metrics} footer={data.chartHint} />
        </section>

        <PageSurface title="状态摘要">
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {data.statuses.map((item) => (
              <div key={item.label} style={pageStatusCardStyle}>
                <s-stack direction={isMobile ? "block" : "inline"} gap="base" alignItems="center">
                  <s-badge tone={resolveStatusTone(item.status)}>
                    {item.label}：{resolveStatusLabel(item.status)}
                  </s-badge>
                  <s-paragraph>{item.detail}</s-paragraph>
                </s-stack>
              </div>
            ))}
          </div>
        </PageSurface>

        {data.tables.map((table) => (
          <PageSurface key={table.title} title={table.title}>
            <TableWrap>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    {table.columns.map((column) => (
                      <th key={column} style={thStyle}>
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((row, rowIndex) => (
                    <tr key={`${table.title}-${rowIndex}`}>
                      {row.map((cell, cellIndex) => (
                        <td key={`${table.title}-${rowIndex}-${cellIndex}`} style={tdStyle}>
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </PageSurface>
        ))}

        <PageSurface title="图表入口" subtitle="当前模块的深钻统一走图表页，趋势和结构都在那里继续看。">
          <div style={chartEntryStyle}>
            <div style={{ flex: "1 1 20rem", minWidth: 0 }}>
              <div style={pageMetricLabelStyle}>对应图表</div>
              <div style={pageMetricValueStyle}>{data.chartLabel}</div>
              <div style={pageHintTextStyle}>{data.chartHint}</div>
            </div>
            <div style={chartActionRowStyle(isMobile)}>
              <SurfaceButton label={data.chartLabel} onClick={() => navigate(data.chartHref)} />
              <SurfaceButton label="返回经营首页" tone="subtle" onClick={() => navigate("/app/today")} />
            </div>
          </div>
        </PageSurface>

        <PageSurface title="结论">
          <s-unordered-list>
            {data.conclusions.map((line) => (
              <s-list-item key={line}>{line}</s-list-item>
            ))}
          </s-unordered-list>
        </PageSurface>

        <PageSurface title="说明">
          <p style={pageMetaTextStyle}>
            当前页面先服务于 Today 的界面框架调整，因此摘要数据以演示值为主；趋势深钻请直接进入对应图表页查看真实报表。
          </p>
        </PageSurface>
      </div>
    </>
  );
}

function chartActionRowStyle(isMobile: boolean): CSSProperties {
  return {
    display: "flex",
    flexDirection: isMobile ? "column" : "row",
    gap: "0.75rem",
    alignItems: isMobile ? "stretch" : "center",
  };
}

const chartEntryStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "1rem",
};
