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
  PageSurface,
} from "./page/pageUiStyles";

type ViewMode = "overview" | "detail";
type HealthMonitorFollowupAction = {
  label: string;
  path: string;
  tone?: "primary" | "subtle";
};

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

function buildPathWithReturnTo(path: string, returnTo: string) {
  const [pathname, rawQuery = ""] = path.split("?");
  const params = new URLSearchParams(rawQuery);
  params.set("returnTo", returnTo);
  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ""}`;
}

function buildTaskCenterPath(params: {
  returnTo: string;
  operationSources?: string[];
}) {
  const next = new URLSearchParams();
  next.set("returnTo", params.returnTo);
  next.set("unifiedType", "operation_task");
  if (params.operationSources && params.operationSources.length > 0) {
    next.set("unifiedOperationSource", params.operationSources.join(","));
  }
  const query = next.toString();
  return `/app/tasks${query ? `?${query}` : ""}`;
}

function resolveHealthMonitorFollowupActions(params: {
  monitor: HealthMonitorRecord;
  currentPath: string;
}): HealthMonitorFollowupAction[] {
  const { monitor, currentPath } = params;

  if (monitor.id === "page-performance") {
    return [
      {
        label: "查看转化承接详情",
        path: buildPathWithReturnTo("/app/today/conversion", currentPath),
        tone: "subtle",
      },
    ];
  }

  if (monitor.id === "seo-health") {
    return [
      {
        label: "进入 Search Console",
        path: buildPathWithReturnTo("/app/settings/google-search-console", currentPath),
      },
      {
        label: "查看流量质量详情",
        path: buildPathWithReturnTo("/app/today/traffic", currentPath),
        tone: "subtle",
      },
    ];
  }

  if (monitor.id === "payment-health") {
    return [
      {
        label: "查看结账漏斗报表",
        path: buildPathWithReturnTo("/app/settings/shopify-reports?tab=storefront&range=7d", currentPath),
      },
      {
        label: "去任务中心跟进",
        path: buildTaskCenterPath({
          returnTo: currentPath,
          operationSources: ["payment_chain_review"],
        }),
        tone: "subtle",
      },
      {
        label: "查看转化承接详情",
        path: buildPathWithReturnTo("/app/today/conversion", currentPath),
        tone: "subtle",
      },
    ];
  }

  if (monitor.id === "roi-health" || monitor.id === "ads-health" || monitor.id === "pricing-health") {
    return [
      {
        label: "查看 ROI 详情",
        path: buildPathWithReturnTo("/app/today/roi", currentPath),
      },
      {
        label: "去任务中心跟进",
        path: buildTaskCenterPath({
          returnTo: currentPath,
          operationSources:
            monitor.id === "roi-health" || monitor.id === "ads-health"
              ? ["sales_decline", "traffic_conversion_drop"]
              : [],
        }),
        tone: "subtle",
      },
    ];
  }

  if (monitor.id === "revenue-health" || monitor.id === "refund-health") {
    return [
      {
        label: "查看收入与订单详情",
        path: buildPathWithReturnTo("/app/today/orders", currentPath),
      },
      {
        label: "去任务中心跟进",
        path: buildTaskCenterPath({
          returnTo: currentPath,
          operationSources:
            monitor.id === "revenue-health"
              ? ["sales_decline"]
              : ["refund_spike", "after_sales_timeout"],
        }),
        tone: "subtle",
      },
    ];
  }

  if (monitor.id === "traffic-health") {
    return [
      {
        label: "查看流量质量详情",
        path: buildPathWithReturnTo("/app/today/traffic", currentPath),
      },
    ];
  }

  if (monitor.id === "conversion-health") {
    return [
      {
        label: "查看转化承接详情",
        path: buildPathWithReturnTo("/app/today/conversion", currentPath),
      },
      {
        label: "去任务中心跟进",
        path: buildTaskCenterPath({
          returnTo: currentPath,
          operationSources: ["traffic_conversion_drop"],
        }),
        tone: "subtle",
      },
    ];
  }

  if (
    monitor.id === "product-readiness-health" ||
    monitor.id === "inventory-health" ||
    monitor.id === "fulfillment-health"
  ) {
    return [
      {
        label: "去任务中心跟进",
        path: buildTaskCenterPath({
          returnTo: currentPath,
          operationSources:
            monitor.id === "product-readiness-health"
              ? ["launch_failure_review", "product_incomplete"]
              : monitor.id === "inventory-health"
                ? ["inventory_risk", "inventory_replenish_plan"]
                : monitor.id === "fulfillment-health"
                  ? ["fulfillment_overdue", "logistics_stale", "routine_shipping"]
                  : [],
        }),
      },
      {
        label: "查看收入与订单详情",
        path: buildPathWithReturnTo("/app/today/orders", currentPath),
        tone: "subtle",
      },
    ];
  }

  if (monitor.id === "risk-control-health") {
    return [
      {
        label: "补齐监测输入",
        path: buildPathWithReturnTo("/app/settings/data", currentPath),
      },
      {
        label: "查看结账漏斗报表",
        path: buildPathWithReturnTo("/app/settings/shopify-reports?tab=storefront&range=7d", currentPath),
        tone: "subtle",
      },
    ];
  }

  return [];
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
  const currentHealthMonitorPath = useMemo(() => {
    const query = searchParams.toString();
    return `/app/health-monitor${query ? `?${query}` : ""}`;
  }, [searchParams]);
  const followupActions = useMemo(
    () =>
      resolveHealthMonitorFollowupActions({
        monitor: selectedMonitor,
        currentPath: currentHealthMonitorPath,
      }),
    [currentHealthMonitorPath, selectedMonitor],
  );

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

        {viewMode === "overview" ? (
          <OverviewSection
            groups={groupedMonitors}
            summary={monitoringSummary}
            onOpenDetail={(monitorId) => {
              syncHealthMonitorSearch({ view: "detail", monitor: monitorId });
            }}
          />
        ) : null}

        {viewMode === "detail" ? (
          <DetailSection
            monitor={selectedMonitor}
            detail={selectedDetail}
            pageSpeedDefaults={pageSpeedDefaults}
            onBackToOverview={() => syncHealthMonitorSearch({ view: "overview" })}
            followupActions={followupActions}
            onOpenFollowup={(path) => navigate(path)}
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
        ) : null}
      </DestinationPage>
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
  onBackToOverview,
  followupActions,
  onOpenFollowup,
  onOpenAi,
}: {
  monitor: HealthMonitorRecord;
  detail: ReturnType<typeof resolveHealthMonitorDetail>;
  pageSpeedDefaults: {
    defaultUrl: string;
    defaultReportLocale: ReturnType<typeof resolvePageSpeedLocale>;
  };
  onBackToOverview: () => void;
  followupActions: HealthMonitorFollowupAction[];
  onOpenFollowup: (path: string) => void;
  onOpenAi: () => void;
}) {
  return (
    <div style={stackStyle}>
      <PageSurface
        title={monitor.title}
        subtitle="详情页只回答这个健康项当前是否异常、证据是什么、应该先做什么，而不是重复经营总览。"
      >
        <div style={detailHeroStyle}>
          <span style={statusBadgeStyle(monitor.status)}>{statusLabel(monitor.status)}</span>
          <div style={detailHeroMainStyle}>
            <div style={detailMetaStyle}>{monitor.group}</div>
            <h3 style={detailIssueTitleStyle}>{detail.result.problem}</h3>
            <div style={detailValueStyle}>当前关键数据：{monitor.value}</div>
            <div style={detailMetaStyle}>影响经营模块：{monitor.relatedModule}</div>
          </div>
        </div>
        <div style={buttonRowStyle}>
          <button type="button" style={secondaryButtonStyle} onClick={onBackToOverview}>
            返回总体判断
          </button>
          {followupActions.map((action) => (
            <button
              key={action.path}
              type="button"
              style={action.tone === "subtle" ? secondaryButtonStyle : primaryButtonStyle}
              onClick={() => onOpenFollowup(action.path)}
            >
              {action.label}
            </button>
          ))}
        </div>
      </PageSurface>

      <PageSurface title="问题是什么" subtitle="只保留一句判断，让用户先知道结论。">
        <div style={detailCalloutStyle}>
          <p style={detailLeadStyle}>{detail.result.problem}</p>
          <p style={detailSupportTextStyle}>{monitor.summary}</p>
        </div>
      </PageSurface>

      <PageSurface title="数据论据" subtitle="用结构化证据支撑结论，而不是铺解释性散文。">
        <div style={evidenceListStyle}>
          {detail.result.evidenceSummary.map((entry) => (
            <div key={entry.label} style={evidenceItemStyle}>
              <strong style={evidenceLabelStyle}>{entry.label}</strong>
              <span style={evidenceValueStyle}>{entry.summary}</span>
            </div>
          ))}
        </div>
      </PageSurface>

      {detail.input.affectedObjects && detail.input.affectedObjects.length > 0 ? (
        <PageSurface title="关键对象" subtitle="优先展示这次监测里真正受到影响的订单、SKU 或页面对象。">
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
        </PageSurface>
      ) : null}

      {monitor.id === "page-performance" ? (
        <PageSurface
          title="页面性能实验室分析"
          subtitle="这里直接复用 PageSpeed 分析，不再额外输入 URL 和语言，默认分析当前店铺的 myshopify 地址。"
        >
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
        </PageSurface>
      ) : null}

      {followupActions.length > 0 ? (
        <PageSurface title="下一步入口" subtitle="从当前健康项直接进入已有工作流，不重复造一套新页面。">
          <div style={followupListStyle}>
            {followupActions.map((action) => (
              <button
                key={action.path}
                type="button"
                style={action.tone === "subtle" ? followupSecondaryCardStyle : followupPrimaryCardStyle}
                onClick={() => onOpenFollowup(action.path)}
              >
                <strong style={followupCardTitleStyle}>{action.label}</strong>
                <span style={followupCardTextStyle}>继续查看关联对象、任务或报表。</span>
              </button>
            ))}
          </div>
        </PageSurface>
      ) : null}

      <PageSurface title="解决办法" subtitle="每条动作都应该可以进一步转进现有 Tasks。">
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
      </PageSurface>

      <PageSurface title="和 AI 聊聊" subtitle="继续围绕这个健康项下钻原因、排序动作和明确优先级。">
        <div style={aiPanelStyle}>
          <div style={aiMetaPanelStyle}>
            <strong style={evidenceLabelStyle}>当前语境</strong>
            <pre style={aiPromptStyle}>{detail.result.aiChatPrompt}</pre>
          </div>
          <div style={buttonRowStyle}>
            <button type="button" style={primaryButtonStyle} onClick={onOpenAi}>
              带着这个健康项去和 AI 聊
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

const detailHeroStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: "0.9rem",
  flexWrap: "wrap",
};

const detailHeroMainStyle: CSSProperties = {
  flex: "1 1 18rem",
  minWidth: 0,
  display: "grid",
  gap: "0.45rem",
};

const detailMetaStyle: CSSProperties = {
  fontSize: "0.75rem",
  color: pageColorTokens.textSecondary,
};

const detailIssueTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "1.15rem",
  fontWeight: 800,
  color: pageColorTokens.textPrimary,
  lineHeight: 1.35,
};

const detailValueStyle: CSSProperties = {
  fontSize: "0.875rem",
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

const followupListStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "0.75rem",
};

const followupBaseCardStyle: CSSProperties = {
  display: "grid",
  gap: "0.35rem",
  textAlign: "left",
  padding: "0.95rem 1rem",
  borderRadius: pageColorTokens.radiusControl,
  cursor: "pointer",
};

const followupPrimaryCardStyle: CSSProperties = {
  ...followupBaseCardStyle,
  border: `1px solid ${pageColorTokens.brandBlue}`,
  background: pageColorTokens.surface,
};

const followupSecondaryCardStyle: CSSProperties = {
  ...followupBaseCardStyle,
  border: `1px solid ${pageColorTokens.border}`,
  background: pageColorTokens.surfaceMuted,
};

const followupCardTitleStyle: CSSProperties = {
  fontSize: "0.9rem",
  color: pageColorTokens.textPrimary,
};

const followupCardTextStyle: CSSProperties = {
  fontSize: "0.82rem",
  lineHeight: 1.55,
  color: pageColorTokens.textSecondary,
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
