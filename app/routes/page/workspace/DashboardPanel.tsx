/** 工作台经营看板 Panel（从 WorkspaceAppShellPage 拆出）。 */
import { useResponsiveLayout } from "../../../hooks/useResponsiveLayout";
import type { WorkspaceDashboardSnapshot } from "../../../lib/workspaceDashboardTypes";
import {
  alertItemStyle,
  alertListStyle,
  barFillStyle,
  barGroupStyle,
  barTrackStyle,
  bulletStyle,
  chartLabelStyle,
  chartRowStyle,
  chartStyle,
  dashboardSectionTitleRowStyle,
  ghostButtonStyle,
  legendItemStyle,
  listColumnStyle,
  metricDeltaStyle,
  metricGridStyle,
  metricLabelStyle,
  metricValueStyle,
  mobileChartRowStyle,
  mobileMetricGridStyle,
  mobileSectionHeaderStyle,
  mobileSurfaceCardStyle,
  mobileTrendLegendStyle,
  mobileTwoColumnStyle,
  mutedMetaStyle,
  panelStackStyle,
  pendingIntegrationBadgeSmallStyle,
  pendingIntegrationBadgeStyle,
  sectionHeaderStyle,
  sectionTextStyle,
  sectionTitleSmallStyle,
  sectionTitleStyle,
  shopifyUi,
  suggestionItemStyle,
  summaryItemStyle,
  surfaceCardStyle,
  trendLegendStyle,
  twoColumnStyle,
} from "./styles";

function DashboardSectionTitle({
  title,
  pendingIntegration = false,
}: {
  title: string;
  pendingIntegration?: boolean;
}) {
  return (
    <div style={dashboardSectionTitleRowStyle}>
      <div style={sectionTitleStyle}>{title}</div>
      {pendingIntegration ? <span style={pendingIntegrationBadgeStyle}>待接入</span> : null}
    </div>
  );
}

function DashboardMetricLabel({
  label,
  pendingIntegration = false,
}: {
  label: string;
  pendingIntegration?: boolean;
}) {
  return (
    <div style={dashboardSectionTitleRowStyle}>
      <div style={metricLabelStyle}>{label}</div>
      {pendingIntegration ? <span style={pendingIntegrationBadgeSmallStyle}>待接入</span> : null}
    </div>
  );
}

export function DashboardPanel({
  snapshot,
  onOpenDailyOps,
  onOpenTasks,
}: {
  snapshot: WorkspaceDashboardSnapshot;
  onOpenDailyOps: () => void;
  onOpenTasks: () => void;
}) {
  const { isMobile } = useResponsiveLayout();
  const snapshotMeta =
    snapshot.hasData && snapshot.snapshotDate
      ? `快照 ${snapshot.snapshotDate}${snapshot.generatedAt ? ` · 更新 ${new Date(snapshot.generatedAt).toLocaleString()}` : ""}`
      : null;

  return (
    <div style={panelStackStyle}>
      {!snapshot.hasData && snapshot.emptyMessage ? (
        <div style={{ ...sectionTextStyle, color: "#6d7175", marginBottom: 4 }}>
          {snapshot.emptyMessage}
        </div>
      ) : null}
      {snapshotMeta ? (
        <div style={{ ...mutedMetaStyle, marginBottom: 4 }}>{snapshotMeta}</div>
      ) : null}
      <div style={isMobile ? mobileMetricGridStyle : metricGridStyle}>
        {snapshot.metrics.map((metric) => (
          <article key={metric.label} style={isMobile ? mobileSurfaceCardStyle : surfaceCardStyle}>
            <DashboardMetricLabel
              label={metric.label}
              pendingIntegration={metric.pendingIntegration}
            />
            <div style={metricValueStyle}>{metric.value}</div>
            <div style={metricDeltaStyle(metric.tone)}>{metric.delta}</div>
          </article>
        ))}
      </div>

      <div style={isMobile ? mobileTwoColumnStyle : twoColumnStyle}>
        <section style={isMobile ? mobileSurfaceCardStyle : surfaceCardStyle}>
          <div style={isMobile ? mobileSectionHeaderStyle : sectionHeaderStyle}>
            <div>
              <DashboardSectionTitle title="经营提醒" />
              <div style={sectionTextStyle}>优先处理影响销售、库存和退款的核心问题。</div>
            </div>
            <button type="button" style={ghostButtonStyle} onClick={onOpenDailyOps}>
              查看全部
            </button>
          </div>
          <div style={alertListStyle}>
            {snapshot.alerts.length === 0 ? (
              <div style={sectionTextStyle}>暂无需要优先处理的风险项。</div>
            ) : (
              snapshot.alerts.map((alert) => (
                <div key={`${alert.title}-${alert.detail}`} style={alertItemStyle(alert.tone)}>
                  <div style={sectionTitleSmallStyle}>{alert.title}</div>
                  <div style={sectionTextStyle}>{alert.detail}</div>
                </div>
              ))
            )}
          </div>
        </section>

        <section style={isMobile ? mobileSurfaceCardStyle : surfaceCardStyle}>
          <div style={isMobile ? mobileSectionHeaderStyle : sectionHeaderStyle}>
            <div>
              <DashboardSectionTitle title="关键趋势" pendingIntegration />
              <div style={sectionTextStyle}>今天、昨天和 7 天均值的简化对比。</div>
            </div>
            <div style={isMobile ? mobileTrendLegendStyle : trendLegendStyle}>
              <span style={legendItemStyle(shopifyUi.primary)}>Today</span>
              <span style={legendItemStyle("#47c1af")}>Yesterday</span>
              <span style={legendItemStyle("#b4e6d3")}>7d Avg</span>
            </div>
          </div>
          <div style={chartStyle}>
            {[
              { label: "销售额", values: [88, 74, 66] },
              { label: "订单", values: [72, 68, 61] },
              { label: "转化", values: [49, 54, 57] },
            ].map((group) => (
              <div key={group.label} style={isMobile ? mobileChartRowStyle : chartRowStyle}>
                <div style={chartLabelStyle}>{group.label}</div>
                <div style={barGroupStyle}>
                  {group.values.map((value, index) => (
                    <div key={`${group.label}-${value}`} style={barTrackStyle}>
                      <div
                        style={{
                          ...barFillStyle,
                          width: `${value}%`,
                          background: index === 0 ? shopifyUi.primary : index === 1 ? "#47c1af" : "#b4e6d3",
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div style={isMobile ? mobileTwoColumnStyle : twoColumnStyle}>
        <section style={isMobile ? mobileSurfaceCardStyle : surfaceCardStyle}>
          <div style={isMobile ? mobileSectionHeaderStyle : sectionHeaderStyle}>
            <div>
              <DashboardSectionTitle title="AI 自动化执行摘要" />
              <div style={sectionTextStyle}>
                展示任务列表最近记录；Playbook 定时执行
                <span style={pendingIntegrationBadgeSmallStyle}>待接入</span>
              </div>
            </div>
            <button type="button" style={ghostButtonStyle} onClick={onOpenTasks}>
              查看任务列表
            </button>
          </div>
          <div style={listColumnStyle}>
            {snapshot.recentTaskSummaries.length === 0 ? (
              <div style={sectionTextStyle}>暂无近期任务记录。</div>
            ) : (
              snapshot.recentTaskSummaries.map((item) => (
                <div key={item.id} style={summaryItemStyle}>
                  <div style={sectionTitleSmallStyle}>{item.title}</div>
                  <div style={sectionTextStyle}>{item.result}</div>
                </div>
              ))
            )}
          </div>
        </section>

        <section style={isMobile ? mobileSurfaceCardStyle : surfaceCardStyle}>
          <div style={isMobile ? mobileSectionHeaderStyle : sectionHeaderStyle}>
            <div>
              <DashboardSectionTitle title="经营建议" />
              <div style={sectionTextStyle}>基于当前店铺数据和任务结果生成的建议。</div>
            </div>
            <button type="button" style={ghostButtonStyle} onClick={onOpenDailyOps}>
              查看每日待办
            </button>
          </div>
          <div style={listColumnStyle}>
            {snapshot.suggestions.map((item) => (
              <div key={item} style={suggestionItemStyle}>
                <span style={bulletStyle} />
                <span style={sectionTextStyle}>{item}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
