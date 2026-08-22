import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useLoaderData, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { authenticate } from "../shopify.server";
import { useFeatureView } from "../lib/featureTrack";
import { resolveHealthMonitorDetail } from "../lib/healthMonitorAiDetail";
import { resolvePageSpeedLocale } from "../lib/pageSpeedLocales";
import { buildWorkspaceChatPrefillPath } from "../lib/workspaceChatPrefill";
import {
  HEALTH_MONITORS,
  buildHealthMonitorRecords,
  getHealthMonitorGroupsFromRecords,
  getHealthMonitorSummary,
  type HealthMonitorRecord,
  type HealthMonitorStatus,
} from "../lib/healthMonitorData";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";
import { useEmbeddedNavigate } from "../hooks/useEmbeddedNavigate";
import { ensureDailySnapshot } from "../server/operations/dailyInspection.server";
import { fetchShopLocalesPayload } from "../server/productImprove/shopLocalesFetcher.server";
import { fetchShopBasicInfo } from "../server/shopify/fetchShopBasicInfo.server";
import { DestinationPage, type DestinationActionCard } from "./component/shared/DestinationPage";
import { PageSpeedInsightsContent } from "./page/PageSpeedInsightsPage";
import {
  mobilePageContentStyle,
  pageContentStyle,
  pageHintTextStyle,
  pageColorTokens,
  PageHeaderNav,
  PageSurface,
} from "./page/pageUiStyles";

type ViewMode = "overview" | "detail";
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const [shopInfo, shopLocales] = await Promise.all([
    fetchShopBasicInfo(admin).catch(() => null),
    fetchShopLocalesPayload(admin, `[HealthMonitor] shop=${session.shop}`),
  ]);
  const myshopifyDomain = shopInfo?.myshopifyDomain?.trim() || session.shop;
  const pageSpeedDefaults = {
    defaultUrl: `https://${myshopifyDomain}`,
    defaultReportLocale: resolvePageSpeedLocale(shopLocales.defaultTargetLanguage),
  };

  try {
    const snapshot = await ensureDailySnapshot(session.shop);
    return {
      monitors: buildHealthMonitorRecords({
        metrics: snapshot.metrics,
        overview: {
          salesGrowthRate: snapshot.overview.salesGrowthRate,
          sessions7d: snapshot.overview.sessions7d,
          conversionRate7d: snapshot.overview.conversionRate7d,
        },
        environments: snapshot.environments,
        items: snapshot.items,
        detail: snapshot.detail,
      }),
      pageSpeedDefaults,
      usingFallback: false,
      fallbackMessage: null,
    };
  } catch (error) {
    console.error(
      "[health-monitor] Failed to load daily snapshot, falling back to demo data.",
      error,
    );
    return {
      monitors: buildHealthMonitorRecords(),
      pageSpeedDefaults,
      usingFallback: true,
      fallbackMessage: "当前展示的是演示数据，真实健康度快照暂时不可用。",
    };
  }
};

function resolveHealthMonitorView(value: string | null): ViewMode {
  if (value === "detail") return value;
  return "overview";
}

function resolveHealthMonitorId(
  value: string | null,
  monitors: HealthMonitorRecord[],
): string {
  if (value && monitors.some((item) => item.id === value)) return value;
  return monitors[0]?.id ?? "conversion-health";
}

export default function AppHealthMonitor() {
  const { monitors, pageSpeedDefaults, usingFallback, fallbackMessage } = useLoaderData<typeof loader>();
  const { t } = useTranslation();
  const { isMobile } = useResponsiveLayout();
  const navigate = useEmbeddedNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const returnTo = searchParams.get("returnTo")?.trim() || undefined;
  useFeatureView("health-monitor");

  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    resolveHealthMonitorView(searchParams.get("view")),
  );
  const [selectedMonitorId, setSelectedMonitorId] = useState<string>(() =>
    resolveHealthMonitorId(searchParams.get("monitor"), monitors),
  );

  const groupedMonitors = useMemo(
    () => getHealthMonitorGroupsFromRecords(monitors),
    [monitors],
  );

  const selectedMonitor =
    monitors.find((item) => item.id === selectedMonitorId) ?? monitors[0] ?? HEALTH_MONITORS[0];
  const selectedDetail = useMemo(() => resolveHealthMonitorDetail(selectedMonitor), [selectedMonitor]);

  const monitoringSummary = useMemo(() => getHealthMonitorSummary(monitors), [monitors]);
  const overviewReturnPath = useMemo(() => {
    const params = new URLSearchParams(searchParams);
    params.set("view", "overview");
    params.delete("monitor");
    const query = params.toString();
    return `/app/health-monitor${query ? `?${query}` : ""}`;
  }, [searchParams]);

  useEffect(() => {
    setViewMode(resolveHealthMonitorView(searchParams.get("view")));
    setSelectedMonitorId(resolveHealthMonitorId(searchParams.get("monitor"), monitors));
  }, [monitors, searchParams]);

  const syncHealthMonitorSearch = (next: {
    view: ViewMode;
    monitor?: string;
  }) => {
    const params = new URLSearchParams(searchParams);
    params.set("view", next.view);
    if (next.monitor) {
      params.set("monitor", next.monitor);
    } else {
      params.delete("monitor");
    }
    setSearchParams(params, { replace: true, preventScrollReset: true });
  };

  const actions: DestinationActionCard[] = [
    {
      key: "overview",
      title: "总体判断",
      detail: "直接看本次检查进度和全部健康项，不再拆额外一层。",
      badge: "首页",
      active: viewMode === "overview",
      onClick: () => syncHealthMonitorSearch({ view: "overview" }),
    },
    {
      key: "detail",
      title: "结论详情",
      detail: `${selectedMonitor.title} 的问题、论据、解决办法和 AI 入口。`,
      badge: statusLabel(selectedMonitor.status),
      active: viewMode === "detail",
      onClick: () =>
        syncHealthMonitorSearch({ view: "detail", monitor: selectedMonitor.id }),
    },
  ];

  return (
    <div style={isMobile ? mobilePageContentStyle : pageContentStyle}>
      {viewMode === "detail" ? (
        <>
          <PageHeaderNav
            title={selectedMonitor.title}
            subtitle="这是 Health Monitor 的统一详情模板。你可以在这里切换不同健康项，查看同一套结构化结论。"
            eyebrow={selectedMonitor.group}
            titleBarTitle={`${t("nav.healthMonitor")} · ${selectedMonitor.title}`}
            backLabel="返回健康度总览"
            fallbackPath="/app/health-monitor?view=overview"
            returnTo={overviewReturnPath}
            rightAction={
              <label style={detailSwitcherWrapStyle}>
                <span style={detailSwitcherLabelStyle}>切换健康项</span>
                <select
                  value={selectedMonitorId}
                  onChange={(event) =>
                    syncHealthMonitorSearch({ view: "detail", monitor: event.target.value })
                  }
                  style={detailSwitcherSelectStyle}
                >
                  {groupedMonitors.map((group) => (
                    <optgroup key={group.title} label={group.title}>
                      {group.items.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.title} · {statusLabel(item.status)}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
            }
          />

          {usingFallback ? (
            <PageSurface
              title="当前为演示数据"
              subtitle={fallbackMessage ?? "真实健康度快照暂时不可用，页面已自动切换到兜底数据。"}
            >
              <div style={fallbackBannerStyle}>
                <strong style={fallbackBannerTitleStyle}>已跳过实时数据加载</strong>
                <p style={fallbackBannerTextStyle}>
                  当前先保证 Health Monitor 页面可访问，后续再继续处理数据库或快照链路。
                </p>
              </div>
            </PageSurface>
          ) : null}

          <DetailSection
            monitor={selectedMonitor}
            detail={selectedDetail}
            pageSpeedDefaults={pageSpeedDefaults}
            onOpenAi={() =>
              navigate(
                buildWorkspaceChatPrefillPath({
                  prompt: selectedDetail.result.aiChatPrompt,
                  constraints: [
                    `当前 AI 语境：Health Monitor / ${selectedMonitor.title}`,
                    "只回答可信度、达标性、异常原因和处理优先级，不切回经营总览语境。",
                  ],
                }),
              )
            }
          />
        </>
      ) : (
        <DestinationPage
          title={t("nav.healthMonitor")}
          subtitle="Health Monitor 只回答两件事：这些结果是否可信，以及这些关键指标是否达标。"
          titleBarTitle={t("nav.healthMonitor")}
          backLabel={returnTo ? "返回上一级" : "返回首页"}
          fallbackPath="/app"
          returnTo={returnTo}
          isMobile={isMobile}
          actions={actions}
        >
          {usingFallback ? (
            <PageSurface
              title="当前为演示数据"
              subtitle={fallbackMessage ?? "真实健康度快照暂时不可用，页面已自动切换到兜底数据。"}
            >
              <div style={fallbackBannerStyle}>
                <strong style={fallbackBannerTitleStyle}>已跳过实时数据加载</strong>
                <p style={fallbackBannerTextStyle}>
                  当前先保证 Health Monitor 页面可访问，后续再继续处理数据库或快照链路。
                </p>
              </div>
            </PageSurface>
          ) : null}

          <OverviewSection
            groups={groupedMonitors}
            summary={monitoringSummary}
            onOpenDetail={(monitorId) => {
              syncHealthMonitorSearch({ view: "detail", monitor: monitorId });
            }}
          />
        </DestinationPage>
      )}
    </div>
  );
}

function OverviewSection({
  groups,
  summary,
  onOpenDetail,
}: {
  groups: Array<{ title: string; items: HealthMonitorRecord[] }>;
  summary: ReturnType<typeof getHealthMonitorSummary>;
  onOpenDetail: (monitorId: string) => void;
}) {
  return (
    <PageSurface
      title="总体判断"
      subtitle="概览页直接包含本次检查进度和全部健康项。监测项不多时，留在同一页更顺手。"
    >
      <div style={stackStyle}>
        <div style={summaryGridStyle}>
          <section style={summaryTileStyle}>
            <div style={groupHeaderStyle}>
              <h3 style={groupTitleStyle}>检查进度</h3>
              <span style={pageHintTextStyle}>{summary.progress}%</span>
            </div>
            <div style={summaryTileValueStyle}>
              {summary.completed}/{summary.total}
            </div>
          </section>

          {summary.groups.map((group) => (
            <section key={group.title} style={summaryTileStyle}>
              <div style={groupHeaderStyle}>
                <h3 style={groupTitleStyle}>{group.title}</h3>
                <span style={statusBadgeStyle(group.status)}>{statusLabel(group.status)}</span>
              </div>
              <div style={overviewMetricRowStyle}>
                <span style={summaryTileLabelStyle}>风险 {group.riskCount}</span>
                <span style={summaryTileLabelStyle}>关注 {group.watchCount}</span>
                <span style={summaryTileLabelStyle}>正常 {group.goodCount}</span>
              </div>
            </section>
          ))}
        </div>

        {groups.map((group) => (
          <section key={group.title} style={groupCardStyle}>
            <div style={groupHeaderStyle}>
              <h3 style={groupTitleStyle}>{group.title}</h3>
              <span style={pageHintTextStyle}>{group.items.length} 个监测项</span>
            </div>
            <div style={monitorListStyle}>
              {group.items.map((item) => (
                <div key={item.id} style={dashboardRowStyle}>
                  <div>
                    <div style={dashboardTitleStyle}>{item.title}</div>
                    <div style={dashboardMetaStyle}>{item.summary}</div>
                  </div>
                  <div style={dashboardValueStyle}>{item.value}</div>
                  <span style={statusBadgeStyle(item.status)}>{statusLabel(item.status)}</span>
                  <button
                    type="button"
                    style={linkButtonStyle}
                    onClick={() => onOpenDetail(item.id)}
                  >
                    查看结论
                  </button>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </PageSurface>
  );
}

function DetailSection({
  monitor,
  detail,
  pageSpeedDefaults,
  onOpenAi,
}: {
  monitor: HealthMonitorRecord;
  detail: ReturnType<typeof resolveHealthMonitorDetail>;
  pageSpeedDefaults: {
    defaultUrl: string;
    defaultReportLocale: ReturnType<typeof resolvePageSpeedLocale>;
  };
  onOpenAi: () => void;
}) {
  return (
    <div style={stackStyle}>
      <PageSurface
        title="报告内容"
        subtitle="先看这份健康度报告本身：观察窗口、核心指标、基准比较和数据可信度。"
      >
        <div style={reportSummaryGridStyle}>
          <div style={reportSummaryCardStyle}>
            <span style={reportSummaryLabelStyle}>当前状态</span>
            <div style={reportSummaryValueRowStyle}>
              <span style={statusBadgeStyle(monitor.status)}>{statusLabel(monitor.status)}</span>
            </div>
          </div>
          <div style={reportSummaryCardStyle}>
            <span style={reportSummaryLabelStyle}>{detail.input.coreMetric.label}</span>
            <strong style={reportSummaryValueStyle}>{detail.input.coreMetric.value}</strong>
          </div>
          <div style={reportSummaryCardStyle}>
            <span style={reportSummaryLabelStyle}>{detail.input.benchmark.label}</span>
            <strong style={reportSummaryValueStyle}>{detail.input.benchmark.value}</strong>
            {detail.input.benchmark.delta ? (
              <span style={reportSummaryHintStyle}>
                {benchmarkDirectionLabel(detail.input.benchmark.direction)} {detail.input.benchmark.delta}
              </span>
            ) : null}
          </div>
          <div style={reportSummaryCardStyle}>
            <span style={reportSummaryLabelStyle}>观察窗口</span>
            <strong style={reportSummaryValueStyle}>{detail.input.timeWindow.label}</strong>
          </div>
          <div style={reportSummaryCardStyle}>
            <span style={reportSummaryLabelStyle}>数据质量</span>
            <strong style={reportSummaryValueStyle}>{scoringLabel(detail.input.scoring.dataQuality)}</strong>
          </div>
          <div style={reportSummaryCardStyle}>
            <span style={reportSummaryLabelStyle}>结论可信度</span>
            <strong style={reportSummaryValueStyle}>{scoringLabel(detail.input.scoring.confidence)}</strong>
          </div>
        </div>

        <div style={reportSummaryNarrativeStyle}>
          <strong style={reportSummaryNarrativeTitleStyle}>报告摘要</strong>
          <p style={reportSummaryNarrativeTextStyle}>{monitor.summary}</p>
        </div>

        <div style={reportSectionGridStyle}>
          <section style={reportSectionCardStyle}>
            <strong style={reportSectionTitleStyle}>核心信号</strong>
            <div style={reportFactListStyle}>
              {detail.input.facts.slice(0, 3).map((fact) => (
                <div key={fact.label} style={reportFactItemStyle}>
                  <span style={reportFactLabelStyle}>{fact.label}</span>
                  <span style={reportFactValueStyle}>{fact.value}</span>
                </div>
              ))}
            </div>
          </section>

          <section style={reportSectionCardStyle}>
            <strong style={reportSectionTitleStyle}>判断依据</strong>
            <div style={reportTraceListStyle}>
              {detail.input.generationTrace.rulesApplied.map((entry) => (
                <div key={entry} style={reportTraceItemStyle}>
                  {entry}
                </div>
              ))}
              {detail.input.generationTrace.benchmarkComparisons.map((entry) => (
                <div key={entry} style={reportTraceItemStyle}>
                  {entry}
                </div>
              ))}
              {detail.input.possibleCauses?.slice(0, 1).map((entry) => (
                <div key={entry} style={reportTraceItemStyle}>
                  初步判断：{entry}
                </div>
              ))}
            </div>
          </section>
        </div>

        {monitor.id === "page-performance" ? (
          <div style={reportEmbeddedSectionStyle}>
            <strong style={reportSummaryNarrativeTitleStyle}>报告明细</strong>
            <PageSpeedInsightsContent
              defaultUrl={pageSpeedDefaults.defaultUrl}
              defaultReportLocale={pageSpeedDefaults.defaultReportLocale}
              initialStrategy="mobile"
              source="health-monitor"
              label={monitor.title}
              showHeader={false}
              showHint={false}
              embedded
              hideUrlInput
              hideLocaleInput
              autorun
            />
          </div>
        ) : null}
        <div style={reportBlockStyle}>
          <strong style={reportSectionTitleStyle}>问题判断</strong>
          <div style={detailCalloutStyle}>
            <p style={detailLeadStyle}>{detail.result.problem}</p>
          </div>
        </div>

        <div style={reportBlockStyle}>
          <strong style={reportSectionTitleStyle}>数据论据</strong>
          <div style={evidenceListStyle}>
            {detail.result.evidenceSummary.map((entry) => (
              <div key={entry.label} style={evidenceItemStyle}>
                <strong style={evidenceLabelStyle}>{entry.label}</strong>
                <span style={evidenceValueStyle}>{entry.summary}</span>
              </div>
            ))}
          </div>
        </div>

        {detail.input.affectedObjects && detail.input.affectedObjects.length > 0 ? (
          <div style={reportBlockStyle}>
            <strong style={reportSectionTitleStyle}>关键对象</strong>
            <div style={objectListStyle}>
              {detail.input.affectedObjects.map((object) => (
                <div key={`${object.type}-${object.name}`} style={objectItemStyle}>
                  <div style={objectHeaderStyle}>
                    <strong style={objectNameStyle}>{object.name}</strong>
                    <span style={objectTypeStyle}>{objectTypeLabel(object.type)}</span>
                  </div>
                  <p style={objectSummaryStyle}>{object.summary ?? "—"}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div style={reportBlockStyle}>
          <strong style={reportSectionTitleStyle}>解决办法</strong>
          <div style={actionListStyle}>
            {detail.result.actions.map((action) => (
              <div key={action.title} style={actionItemStyle}>
                <strong style={actionTitleStyle}>
                  {action.title}
                  <span style={actionPriorityStyle}>{action.priority}</span>
                </strong>
                <span style={actionDetailStyle}>{action.detail}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={reportBlockStyle}>
          <strong style={reportSectionTitleStyle}>报告操作</strong>
          <div style={aiMetaPanelStyle}>
            <strong style={evidenceLabelStyle}>和 AI 聊聊</strong>
            <pre style={aiPromptStyle}>{detail.result.aiChatPrompt}</pre>
          </div>
          <div style={buttonRowStyle}>
            <button type="button" style={primaryButtonStyle} onClick={onOpenAi}>
              带着这份报告去和 AI 聊
            </button>
          </div>
        </div>
      </PageSurface>
    </div>
  );
}

function statusLabel(status: HealthMonitorStatus): string {
  if (status === "risk") return "风险";
  if (status === "watch") return "关注";
  return "正常";
}

function objectTypeLabel(type: string): string {
  if (type === "order") return "订单";
  if (type === "sku") return "SKU";
  if (type === "page") return "页面";
  if (type === "landing_page") return "落地页";
  if (type === "campaign") return "广告";
  if (type === "channel") return "渠道";
  return "对象";
}

function scoringLabel(value: "high" | "medium" | "low") {
  if (value === "high") return "高";
  if (value === "medium") return "中";
  return "低";
}

function benchmarkDirectionLabel(value: "better" | "worse" | "flat") {
  if (value === "better") return "相对更好";
  if (value === "worse") return "相对更差";
  return "基本持平";
}

function statusBadgeStyle(status: HealthMonitorStatus): CSSProperties {
  if (status === "risk") {
    return {
      ...baseStatusBadgeStyle,
      color: pageColorTokens.criticalText,
      background: pageColorTokens.criticalBg,
      border: `1px solid ${pageColorTokens.criticalBg}`,
    };
  }
  if (status === "watch") {
    return {
      ...baseStatusBadgeStyle,
      color: "#8a6500",
      background: pageColorTokens.warningBg,
      border: `1px solid ${pageColorTokens.warningBg}`,
    };
  }
  return {
    ...baseStatusBadgeStyle,
    color: pageColorTokens.brandGreenDark,
    background: pageColorTokens.brandGreenLight,
    border: `1px solid ${pageColorTokens.brandGreenGlow}`,
  };
}

const stackStyle: CSSProperties = {
  display: "grid",
  gap: "1rem",
};

const groupCardStyle: CSSProperties = {
  border: `1px solid ${pageColorTokens.border}`,
  borderRadius: pageColorTokens.radiusControl,
  background: pageColorTokens.surfaceMuted,
  padding: "1rem",
  display: "grid",
  gap: "0.85rem",
};

const groupHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.75rem",
  flexWrap: "wrap",
};

const groupTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "1rem",
  fontWeight: 760,
  color: pageColorTokens.textPrimary,
};

const monitorListStyle: CSSProperties = {
  display: "grid",
  gap: "0.65rem",
};

const dashboardRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.4fr) minmax(110px, 0.6fr) auto auto",
  gap: "0.75rem",
  alignItems: "center",
  padding: "0.85rem 0",
  borderBottom: `1px dashed ${pageColorTokens.border}`,
};

const dashboardTitleStyle: CSSProperties = {
  fontSize: "0.9rem",
  fontWeight: 700,
  color: pageColorTokens.textPrimary,
};

const dashboardMetaStyle: CSSProperties = {
  marginTop: "0.2rem",
  fontSize: "0.75rem",
  color: pageColorTokens.textSecondary,
};

const dashboardValueStyle: CSSProperties = {
  fontSize: "0.85rem",
  color: pageColorTokens.textSecondary,
  textAlign: "right",
};

const baseStatusBadgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 56,
  padding: "0.28rem 0.6rem",
  borderRadius: 999,
  fontSize: "0.75rem",
  fontWeight: 760,
  whiteSpace: "nowrap",
};

const detailSwitcherWrapStyle: CSSProperties = {
  display: "grid",
  gap: "0.35rem",
  minWidth: 220,
};

const detailSwitcherLabelStyle: CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 700,
  color: pageColorTokens.textSecondary,
};

const detailSwitcherSelectStyle: CSSProperties = {
  minHeight: 40,
  borderRadius: pageColorTokens.radiusControl,
  border: `1px solid ${pageColorTokens.borderInput}`,
  background: pageColorTokens.surface,
  color: pageColorTokens.textPrimary,
  fontSize: "0.875rem",
  padding: "0 0.75rem",
  fontFamily: "inherit",
};

const buttonRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.75rem",
};

const primaryButtonStyle: CSSProperties = {
  border: `1px solid ${pageColorTokens.brandBlue}`,
  background: pageColorTokens.brandBlue,
  color: "#ffffff",
  borderRadius: pageColorTokens.radiusControl,
  padding: "0.7rem 1rem",
  fontSize: "0.875rem",
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryButtonStyle: CSSProperties = {
  border: `1px solid ${pageColorTokens.border}`,
  background: pageColorTokens.surface,
  color: pageColorTokens.textPrimary,
  borderRadius: pageColorTokens.radiusControl,
  padding: "0.7rem 1rem",
  fontSize: "0.875rem",
  fontWeight: 700,
  cursor: "pointer",
};

const linkButtonStyle: CSSProperties = {
  border: "none",
  background: "transparent",
  color: pageColorTokens.brandBlue,
  padding: 0,
  fontSize: "0.8125rem",
  fontWeight: 700,
  cursor: "pointer",
};

const summaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: "0.75rem",
};

const summaryTileStyle: CSSProperties = {
  border: `1px solid ${pageColorTokens.border}`,
  borderRadius: pageColorTokens.radiusControl,
  padding: "0.9rem",
  background: pageColorTokens.surfaceMuted,
  display: "grid",
  gap: "0.35rem",
};

const summaryTileLabelStyle: CSSProperties = {
  fontSize: "0.75rem",
  color: pageColorTokens.textSecondary,
};

const summaryTileValueStyle: CSSProperties = {
  fontSize: "1.35rem",
  fontWeight: 800,
  color: pageColorTokens.textPrimary,
};

const overviewMetricRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.75rem",
};

const reportSummaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: "0.75rem",
};

const reportSummaryCardStyle: CSSProperties = {
  display: "grid",
  gap: "0.35rem",
  padding: "0.95rem 1rem",
  borderRadius: pageColorTokens.radiusControl,
  border: `1px solid ${pageColorTokens.border}`,
  background: pageColorTokens.surfaceMuted,
};

const reportSummaryLabelStyle: CSSProperties = {
  fontSize: "0.75rem",
  color: pageColorTokens.textSecondary,
};

const reportSummaryValueStyle: CSSProperties = {
  fontSize: "1rem",
  fontWeight: 760,
  color: pageColorTokens.textPrimary,
};

const reportSummaryValueRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: "0.5rem",
};

const reportSummaryHintStyle: CSSProperties = {
  fontSize: "0.8rem",
  color: pageColorTokens.textSecondary,
};

const reportSummaryNarrativeStyle: CSSProperties = {
  display: "grid",
  gap: "0.35rem",
  marginTop: "1rem",
  padding: "0.95rem 1rem",
  borderRadius: pageColorTokens.radiusControl,
  border: `1px solid ${pageColorTokens.border}`,
  background: pageColorTokens.surface,
};

const reportSummaryNarrativeTitleStyle: CSSProperties = {
  fontSize: "0.82rem",
  color: pageColorTokens.textSecondary,
};

const reportSummaryNarrativeTextStyle: CSSProperties = {
  margin: 0,
  fontSize: "0.9rem",
  lineHeight: 1.6,
  color: pageColorTokens.textBody,
};

const reportEmbeddedSectionStyle: CSSProperties = {
  display: "grid",
  gap: "0.75rem",
  marginTop: "1rem",
};

const reportBlockStyle: CSSProperties = {
  display: "grid",
  gap: "0.75rem",
  marginTop: "1rem",
};

const reportSectionGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: "0.75rem",
  marginTop: "1rem",
};

const reportSectionCardStyle: CSSProperties = {
  display: "grid",
  gap: "0.65rem",
  padding: "0.95rem 1rem",
  borderRadius: pageColorTokens.radiusControl,
  border: `1px solid ${pageColorTokens.border}`,
  background: pageColorTokens.surface,
};

const reportSectionTitleStyle: CSSProperties = {
  fontSize: "0.82rem",
  fontWeight: 760,
  color: pageColorTokens.textPrimary,
};

const reportFactListStyle: CSSProperties = {
  display: "grid",
  gap: "0.6rem",
};

const reportFactItemStyle: CSSProperties = {
  display: "grid",
  gap: "0.2rem",
};

const reportFactLabelStyle: CSSProperties = {
  fontSize: "0.75rem",
  color: pageColorTokens.textSecondary,
};

const reportFactValueStyle: CSSProperties = {
  fontSize: "0.88rem",
  lineHeight: 1.55,
  color: pageColorTokens.textBody,
};

const reportTraceListStyle: CSSProperties = {
  display: "grid",
  gap: "0.5rem",
};

const reportTraceItemStyle: CSSProperties = {
  fontSize: "0.84rem",
  lineHeight: 1.55,
  color: pageColorTokens.textBody,
};

const detailLeadStyle: CSSProperties = {
  margin: 0,
  fontSize: "0.95rem",
  lineHeight: 1.7,
  color: pageColorTokens.textBody,
};

const detailCalloutStyle: CSSProperties = {
  display: "grid",
  gap: "0.55rem",
  padding: "0.95rem 1rem",
  borderRadius: pageColorTokens.radiusControl,
  background: pageColorTokens.surfaceMuted,
  border: `1px solid ${pageColorTokens.border}`,
};

const detailSupportTextStyle: CSSProperties = {
  margin: 0,
  fontSize: "0.85rem",
  lineHeight: 1.6,
  color: pageColorTokens.textSecondary,
};

const evidenceListStyle: CSSProperties = {
  display: "grid",
  gap: "0.75rem",
};

const objectListStyle: CSSProperties = {
  display: "grid",
  gap: "0.75rem",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
};

const objectItemStyle: CSSProperties = {
  display: "grid",
  gap: "0.45rem",
  padding: "0.9rem 1rem",
  borderRadius: pageColorTokens.radiusControl,
  background: pageColorTokens.surface,
  border: `1px solid ${pageColorTokens.border}`,
};

const objectHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.5rem",
};

const objectNameStyle: CSSProperties = {
  fontSize: "0.88rem",
  color: pageColorTokens.textPrimary,
};

const objectTypeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "0.15rem 0.45rem",
  borderRadius: 999,
  background: pageColorTokens.surfaceMuted,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  fontSize: "0.72rem",
  color: pageColorTokens.textSecondary,
  whiteSpace: "nowrap",
};

const objectSummaryStyle: CSSProperties = {
  margin: 0,
  fontSize: "0.84rem",
  lineHeight: 1.6,
  color: pageColorTokens.textBody,
};

const evidenceItemStyle: CSSProperties = {
  display: "grid",
  gap: "0.3rem",
  padding: "0.85rem 0.95rem",
  borderRadius: pageColorTokens.radiusControl,
  background: pageColorTokens.surfaceMuted,
  border: `1px solid ${pageColorTokens.border}`,
};

const evidenceLabelStyle: CSSProperties = {
  fontSize: "0.8rem",
  color: pageColorTokens.textSecondary,
};

const evidenceValueStyle: CSSProperties = {
  fontSize: "0.9rem",
  color: pageColorTokens.textPrimary,
  lineHeight: 1.55,
};

const actionListStyle: CSSProperties = {
  display: "grid",
  gap: "0.75rem",
};

const actionItemStyle: CSSProperties = {
  display: "grid",
  gap: "0.35rem",
  padding: "0.9rem 1rem",
  borderRadius: pageColorTokens.radiusControl,
  border: `1px solid ${pageColorTokens.border}`,
  background: pageColorTokens.surface,
};

const actionTitleStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  fontSize: "0.9rem",
  color: pageColorTokens.textPrimary,
};

const actionPriorityStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "0.12rem 0.38rem",
  borderRadius: 999,
  background: pageColorTokens.surfaceMuted,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  color: pageColorTokens.textSecondary,
  fontSize: "0.7rem",
  fontWeight: 700,
};

const actionDetailStyle: CSSProperties = {
  fontSize: "0.85rem",
  color: pageColorTokens.textBody,
  lineHeight: 1.55,
};

const fallbackBannerStyle: CSSProperties = {
  display: "grid",
  gap: "0.35rem",
  padding: "0.85rem 0.95rem",
  borderRadius: pageColorTokens.radiusControl,
  background: pageColorTokens.warningBg,
  border: "1px solid rgba(185, 137, 0, 0.24)",
};

const fallbackBannerTitleStyle: CSSProperties = {
  color: pageColorTokens.textPrimary,
  fontSize: "0.92rem",
  fontWeight: 700,
};

const fallbackBannerTextStyle: CSSProperties = {
  margin: 0,
  color: pageColorTokens.textSecondary,
  fontSize: "0.82rem",
  lineHeight: 1.55,
};

const aiPanelStyle: CSSProperties = {
  display: "grid",
  gap: "0.9rem",
};

const aiMetaPanelStyle: CSSProperties = {
  display: "grid",
  gap: "0.4rem",
};

const aiPromptStyle: CSSProperties = {
  margin: 0,
  padding: "1rem",
  borderRadius: pageColorTokens.radiusControl,
  border: `1px solid ${pageColorTokens.border}`,
  background: pageColorTokens.surfaceMuted,
  color: pageColorTokens.textBody,
  fontSize: "0.84rem",
  lineHeight: 1.6,
  whiteSpace: "pre-wrap",
  fontFamily: "inherit",
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
