import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  DailyOperationsResult,
  OperationTaskAction,
  OperationTaskView,
} from "../../server/operations/dailyInspection.server";
import type { TaskQuadrant } from "../../server/operations/diagnosisRules.server";
import {
  PageSurface,
  pageColorTokens,
  pageEmptyStateStyle,
  pageSectionHeaderRowStyle,
} from "../page/pageUiStyles";
import {
  quadrantCountBadgeStyle,
  taskTitleStyle,
  taskMetaTextStyle,
  taskSecondaryTextStyle,
  segmentedNavWrapStyle,
  segmentedNavButtonStyle,
  listSectionStyle,
  listRowStyle,
  listRowMainStyle,
  listRowMetaStyle,
  listRowValueStackStyle,
  listRowActionsStyle,
  toolbarSurfaceStyle,
  toolbarLabelStyle,
  filterToolbarRowStyle,
  filterControlWrapStyle,
  filterSelectStyle,
  quietPanelStyle,
  reviewDeltaCardStyle,
  summaryGridStyle,
  detailInfoGridStyle,
  detailInfoCardStyle,
  detailInfoLabelStyle,
  detailInfoValueStyle,
  monitoringInsightHeaderStyle,
  quadrantGroupHeaderStyle,
  quadrantDotStyle,
  closedToggleStyle,
  detailLinkButtonStyle,
  metricAccentColors,
  radarStatusColors,
  radarListStyle,
  radarRowStyle,
  radarDotStyle,
  radarExpandBodyStyle,
} from "./styles";
import {
  QUADRANTS,
  priorityTone,
  priorityLabel,
  effectTone,
  effectLabel,
  statusTone,
  diagnosisTone,
  insightConfidenceLabel,
  quadrantLabel,
  InsightsView,
  DetailSection,
  RiskEnvironmentCard,
  TaskPresentation,
  taskStatusRank,
  inferTaskPresentation,
  buildRiskEnvironmentCards,
  environmentTaskSourceKeys,
  TaskMenuItem,
  TaskOverflowMenu,
  SummaryMetricCard,
  SourceTag,
} from "./shared";




export function DailyOperationsBody({
  result,
  insightsView,
  onChangeInsightsView,
  isMobile,
  statusText,
  taskStatusText,
  onSendTaskToAi,
  onOpenDetail,
  onSubmitTaskAction,
  busy,
}: {
  result: DailyOperationsResult;
  insightsView: InsightsView;
  onChangeInsightsView: (view: InsightsView) => void;
  isMobile: boolean;
  statusText: (status: string) => string;
  taskStatusText: (status: string) => string;
  onSendTaskToAi: (task: OperationTaskView, presentation: TaskPresentation) => void;
  onOpenDetail: (
    section: DetailSection,
    extra?: Partial<{
      riskTab: "environment" | "insights" | "health";
      environmentKey: string;
      insightKey: string;
      taskId: string;
    }>,
  ) => void;
  onSubmitTaskAction: (taskId: string, action: OperationTaskAction) => void;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const [showClosed, setShowClosed] = useState(false);
  const [allStatusFilter, setAllStatusFilter] = useState("all");
  const [allPriorityFilter, setAllPriorityFilter] = useState("all");
  const [allEffectFilter, setAllEffectFilter] = useState("all");
  const overview = result.overview;
  const hasPixelData = overview.hasPixelData;
  const sessionsValue = overview.sessions7d !== null
    ? String(overview.sessions7d)
    : t("dailyOps.metricNotConnected");
  const conversionValue =
    overview.conversionRate7d !== null
      ? `${overview.conversionRate7d}%`
      : t("dailyOps.metricNotConnected");
  const growthLabel =
    overview.salesGrowthRate === null
      ? t("dailyOps.metricNoBaseline")
      : `${overview.salesGrowthRate >= 0 ? "+" : ""}${overview.salesGrowthRate}%`;
  const sortedTasks = useMemo(
    () =>
      [...result.tasks].sort((left, right) => {
        const rankDiff = taskStatusRank(left.status) - taskStatusRank(right.status);
        if (rankDiff !== 0) return rankDiff;
        const leftTime = new Date(left.resolvedAt ?? left.createdAt).getTime();
        const rightTime = new Date(right.resolvedAt ?? right.createdAt).getTime();
        return rightTime - leftTime;
      }),
    [result.tasks],
  );
  const riskCards = useMemo(
    () => buildRiskEnvironmentCards(result.environments, t),
    [result.environments, t],
  );
  const diagnosisInsights = result.insights;
  const [expandedEnvKey, setExpandedEnvKey] = useState<string | null>(null);
  const reviewImprovedCount =
    result.review?.deltas.filter((delta) => delta.improved === true).length ?? 0;
  const reviewWorsenedCount =
    result.review?.deltas.filter((delta) => delta.improved === false).length ?? 0;
  useEffect(() => {
    if (expandedEnvKey && !riskCards.some((card) => card.key === expandedEnvKey)) {
      setExpandedEnvKey(null);
    }
  }, [riskCards, expandedEnvKey]);
  const insightsForEnvironment = (environmentKey: string) =>
    diagnosisInsights.filter((item) =>
      (item.environmentKeys as string[]).includes(environmentKey),
    );
  const tasksForEnvironment = (environmentKey: string) =>
    sortedTasks.filter((task) =>
      (environmentTaskSourceKeys[environmentKey] ?? []).includes(task.sourceKey),
    );
  const activeTasksByQuadrant = useMemo(() => {
    const groups: Record<TaskQuadrant, OperationTaskView[]> = { q1: [], q2: [], q3: [], q4: [] };
    for (const task of sortedTasks) {
      if (["done", "ignored", "auto_closed"].includes(task.status)) continue;
      (groups[task.quadrant] ?? groups.q4).push(task);
    }
    return groups;
  }, [sortedTasks]);
  const closedTasks = useMemo(
    () =>
      sortedTasks.filter((task) =>
        ["done", "ignored", "auto_closed"].includes(task.status),
      ),
    [sortedTasks],
  );
  const activeTaskCount = QUADRANTS.reduce(
    (sum, quadrant) => sum + activeTasksByQuadrant[quadrant].length,
    0,
  );
  const closedDoneCount = closedTasks.filter((task) => task.status === "done").length;
  const closedIgnoredCount = closedTasks.length - closedDoneCount;
  const allInsightTasks = useMemo(
    () =>
      sortedTasks.filter((task) => {
        if (allStatusFilter !== "all" && task.status !== allStatusFilter) return false;
        if (allPriorityFilter !== "all" && task.priority !== allPriorityFilter) return false;
        if (
          allEffectFilter !== "all" &&
          inferTaskPresentation(task, t).effect !== allEffectFilter
        ) {
          return false;
        }
        return true;
      }),
    [allEffectFilter, allPriorityFilter, allStatusFilter, sortedTasks, t],
  );

  const renderTaskListRow = (task: OperationTaskView) => {
    const presentation = inferTaskPresentation(task, t);
    const closed = ["done", "ignored", "auto_closed"].includes(task.status);
    const menuItems: TaskMenuItem[] = [
      {
        key: "ai",
        label: t("dailyOps.actionSendToAi"),
        onClick: () => onSendTaskToAi(task, presentation),
      },
      {
        key: "detail",
        label: t("dailyOps.viewDetail"),
        onClick: () => onOpenDetail("task", { taskId: task.id }),
      },
    ];
    if (task.status === "open" || task.status === "in_progress") {
      menuItems.push({
        key: "ignore",
        label: t("dailyOps.actionIgnore"),
        tone: "critical",
        disabled: busy,
        onClick: () => onSubmitTaskAction(task.id, "ignore"),
      });
    }
    if (closed) {
      menuItems.push({
        key: "reopen",
        label: t("dailyOps.actionReopen"),
        disabled: busy,
        onClick: () => onSubmitTaskAction(task.id, "reopen"),
      });
    }
    return (
      <div
        key={task.id}
        style={{
          ...listRowStyle,
          gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) auto",
          ...(closed ? { opacity: 0.74 } : null),
        }}
      >
        <div style={listRowMainStyle}>
          <div style={{ ...listRowMetaStyle, gap: "0.35rem" }}>
            <s-badge tone={priorityTone(task.priority)}>{priorityLabel(task.priority, t)}</s-badge>
            <s-badge tone={effectTone(presentation.effect)}>{effectLabel(presentation.effect, t)}</s-badge>
            <s-badge tone={statusTone(task.status)}>{taskStatusText(task.status)}</s-badge>
          </div>
          <h3 style={taskTitleStyle}>{task.title}</h3>
          <p style={taskSecondaryTextStyle}>
            {t("dailyOps.taskImpactMetricLabel")}: {presentation.impactMetric}
          </p>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            justifyContent: isMobile ? "flex-start" : "flex-end",
            flex: "0 0 auto",
          }}
        >
          {task.status === "open" ? (
            <s-button
              type="button"
              variant="primary"
              onClick={() => onSubmitTaskAction(task.id, "start")}
              {...(busy ? { disabled: true } : {})}
            >
              {t("dailyOps.actionStart")}
            </s-button>
          ) : task.status === "in_progress" ? (
            <s-button
              type="button"
              variant="primary"
              onClick={() => onSubmitTaskAction(task.id, "done")}
              {...(busy ? { disabled: true } : {})}
            >
              {t("dailyOps.actionDone")}
            </s-button>
          ) : null}
          <TaskOverflowMenu items={menuItems} ariaLabel={t("dailyOps.taskMoreActions")} />
        </div>
      </div>
    );
  };

  return (
    <>
      <section>
        <div
          style={
            isMobile
              ? {
                  ...pageSectionHeaderRowStyle,
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: "0.65rem",
                }
              : pageSectionHeaderRowStyle
          }
        >
          <div style={segmentedNavWrapStyle}>
            <button
              type="button"
              style={segmentedNavButtonStyle(insightsView === "today")}
              onClick={() => onChangeInsightsView("today")}
            >
              {t("dailyOps.todayInsights")}
            </button>
            <button
              type="button"
              style={segmentedNavButtonStyle(insightsView === "all")}
              onClick={() => onChangeInsightsView("all")}
            >
              {t("dailyOps.allInsights")}
            </button>
          </div>
        </div>
        {insightsView === "today" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <PageSurface
              title={t("dailyOps.summaryTitle")}
            >
              <div
                style={{
                  ...summaryGridStyle,
                  ...(isMobile ? { gridTemplateColumns: "1fr 1fr" } : null),
                }}
              >
                <SummaryMetricCard
                  label={t("dailyOps.metricSales7d")}
                  value={`${overview.salesAmount7d} ${overview.currency}`}
                  accent={
                    overview.salesGrowthRate === null
                      ? metricAccentColors.neutral
                      : overview.salesGrowthRate >= 0
                        ? metricAccentColors.positive
                        : metricAccentColors.negative
                  }
                  hint={`${t("dailyOps.metricGrowth")}: ${growthLabel}`}
                  {...(overview.salesGrowthRate === null
                    ? {}
                    : overview.salesGrowthRate >= 0
                      ? { hintColor: metricAccentColors.positive, arrow: "up" as const }
                      : { hintColor: metricAccentColors.negative, arrow: "down" as const })}
                />
                <SummaryMetricCard
                  label={t("dailyOps.monitoringTitle")}
                  value={overview.activeRiskCount}
                  accent={
                    overview.activeRiskCount > 0
                      ? metricAccentColors.negative
                      : overview.watchRiskCount > 0
                        ? metricAccentColors.warning
                        : metricAccentColors.positive
                  }
                  hint={t("dailyOps.monitoringSummaryCounts", {
                    risk: overview.activeRiskCount,
                    watch: overview.watchRiskCount,
                  })}
                  {...(overview.activeRiskCount > 0
                    ? { hintColor: metricAccentColors.negative }
                    : overview.watchRiskCount > 0
                      ? { hintColor: metricAccentColors.warning }
                      : {})}
                />
                <SummaryMetricCard
                  label={t("dailyOps.dataInsightsTitle")}
                  value={overview.insightCount}
                  accent={
                    overview.insightCount > 0
                      ? metricAccentColors.info
                      : metricAccentColors.neutral
                  }
                />
                <SummaryMetricCard
                  label={t("dailyOps.taskWorkbenchTitle")}
                  value={overview.inProgressTaskCount}
                  accent={
                    overview.inProgressTaskCount > 0
                      ? metricAccentColors.info
                      : metricAccentColors.neutral
                  }
                  hint={t("dailyOps.taskSummaryCounts", {
                    open: overview.openTaskCount,
                    done: overview.doneTaskCount,
                  })}
                />
              </div>
              {result.review ? (
                <div
                  style={{
                    ...quietPanelStyle,
                    marginTop: "0.8rem",
                    padding: "0.75rem 0.85rem",
                    borderRadius: pageColorTokens.radiusControl,
                    background: pageColorTokens.surfaceMuted,
                    border: `1px solid ${pageColorTokens.borderSubtle}`,
                  }}
                >
                  <div style={monitoringInsightHeaderStyle}>
                    <strong>{t("dailyOps.summaryReviewTitle")}</strong>
                    <span style={taskSecondaryTextStyle}>
                      {t("dailyOps.summaryReviewInline", {
                        date: result.review.previousDate,
                        improved: reviewImprovedCount,
                        worsened: reviewWorsenedCount,
                      })}
                    </span>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem", marginTop: "0.55rem" }}>
                    {result.review.deltas.map((delta) => (
                      <div
                        key={delta.key}
                        style={{
                          ...reviewDeltaCardStyle,
                          background: pageColorTokens.surface,
                          borderColor: pageColorTokens.divider,
                          borderRadius: pageColorTokens.radiusControl,
                          padding: "0.45rem 0.6rem",
                        }}
                      >
                        <strong>{delta.label}</strong>: {delta.previous} → {delta.current}{" "}
                        <s-badge
                          tone={
                            delta.improved === null
                              ? "info"
                              : delta.improved
                                ? "success"
                                : "critical"
                          }
                        >
                          {delta.improved === null
                            ? t("dailyOps.reviewFlat")
                            : delta.improved
                              ? t("dailyOps.reviewImproved")
                              : t("dailyOps.reviewWorsened")}
                        </s-badge>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.85rem" }}>
                <button
                  type="button"
                  style={detailLinkButtonStyle}
                  onClick={() => onOpenDetail("performance")}
                >
                  {t("dailyOps.viewDetail")}
                  <span aria-hidden="true">→</span>
                </button>
              </div>
            </PageSurface>

            <PageSurface
              title={t("dailyOps.monitoringTitle")}
            >
              {riskCards.length === 0 ? (
                <div style={pageEmptyStateStyle}>{t("dailyOps.monitoringEmpty")}</div>
              ) : (
                <div style={radarListStyle}>
                  {riskCards.map((card, index) => {
                    const expanded = expandedEnvKey === card.key;
                    const dotColor =
                      radarStatusColors[card.status] ?? pageColorTokens.textFootnote;
                    const envInsights = insightsForEnvironment(card.key);
                    const envTasks = tasksForEnvironment(card.key);
                    return (
                      <div key={card.key}>
                        <button
                          type="button"
                          aria-expanded={expanded}
                          style={{
                            ...radarRowStyle,
                            ...(index === 0 ? { borderTop: "none" } : null),
                            ...(expanded
                              ? { background: pageColorTokens.surfaceMuted }
                              : null),
                          }}
                          onClick={() => setExpandedEnvKey(expanded ? null : card.key)}
                        >
                          <span style={radarDotStyle(dotColor)} />
                          <span
                            style={{
                              flex: 1,
                              minWidth: 0,
                              display: "flex",
                              flexDirection: "column",
                              gap: "0.15rem",
                            }}
                          >
                            <span
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "0.5rem",
                                flexWrap: "wrap",
                              }}
                            >
                              <strong
                                style={{
                                  fontSize: "0.875rem",
                                  color: pageColorTokens.textPrimary,
                                }}
                              >
                                {card.title}
                              </strong>
                              <s-badge tone={diagnosisTone(card.status)}>
                                {statusText(card.status)}
                              </s-badge>
                            </span>
                            <span style={{ ...taskSecondaryTextStyle, fontSize: "0.75rem" }}>
                              {card.primaryMetric}
                            </span>
                          </span>
                          <span
                            aria-hidden="true"
                            style={{
                              color: pageColorTokens.textFootnote,
                              fontSize: "0.85rem",
                              flex: "0 0 auto",
                            }}
                          >
                            {expanded ? "▾" : "▸"}
                          </span>
                        </button>
                        {expanded ? (
                          <div style={radarExpandBodyStyle}>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "0.5rem",
                                flexWrap: "wrap",
                              }}
                            >
                              <SourceTag source={card.source} />
                              <span style={taskSecondaryTextStyle}>{card.summary}</span>
                            </div>
                            <div
                              style={{
                                ...detailInfoGridStyle,
                                ...(isMobile ? { gridTemplateColumns: "1fr" } : null),
                              }}
                            >
                              <div style={detailInfoCardStyle}>
                                <span style={detailInfoLabelStyle}>{t("dailyOps.metricPrimary")}</span>
                                <span style={detailInfoValueStyle}>{card.primaryMetric}</span>
                              </div>
                              <div style={detailInfoCardStyle}>
                                <span style={detailInfoLabelStyle}>{t("dailyOps.metricSecondary")}</span>
                                <span style={detailInfoValueStyle}>{card.secondaryMetric}</span>
                              </div>
                              <div style={detailInfoCardStyle}>
                                <span style={detailInfoLabelStyle}>{t("dailyOps.monitoringInsightsTitle")}</span>
                                <span style={detailInfoValueStyle}>{envInsights.length}</span>
                              </div>
                              <div style={detailInfoCardStyle}>
                                <span style={detailInfoLabelStyle}>{t("dailyOps.relatedTasksLabel")}</span>
                                <span style={detailInfoValueStyle}>{envTasks.length}</span>
                              </div>
                            </div>
                            {envInsights.length === 0 ? (
                              <p style={taskSecondaryTextStyle}>{t("dailyOps.monitoringInsightsEmpty")}</p>
                            ) : (
                              <div style={listSectionStyle}>
                                {envInsights.slice(0, 3).map((item) => (
                                  <div
                                    key={item.key}
                                    style={{
                                      ...listRowStyle,
                                      ...(isMobile ? { gridTemplateColumns: "1fr" } : null),
                                    }}
                                  >
                                    <div style={listRowMainStyle}>
                                      <div style={listRowMetaStyle}>
                                        <s-badge tone={diagnosisTone(item.status)}>{statusText(item.status)}</s-badge>
                                        <s-badge>{insightConfidenceLabel(item.confidence, t)}</s-badge>
                                      </div>
                                      <h3 style={taskTitleStyle}>{item.title}</h3>
                                    </div>
                                    <div style={listRowValueStackStyle}>
                                      <span style={taskMetaTextStyle}>{item.summary}</span>
                                      <span style={taskSecondaryTextStyle}>
                                        {t("dailyOps.insightTaskCount", { count: item.taskCount })}
                                      </span>
                                    </div>
                                    <div
                                      style={{
                                        ...listRowActionsStyle,
                                        ...(isMobile ? { justifyContent: "flex-start" } : null),
                                      }}
                                    >
                                      <s-button
                                        type="button"
                                        variant="tertiary"
                                        onClick={() =>
                                          onOpenDetail("risk", {
                                            riskTab: "insights",
                                            insightKey: item.key,
                                          })
                                        }
                                      >
                                        {t("dailyOps.viewDetail")}
                                      </s-button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                            <div>
                              <s-button
                                type="button"
                                variant="secondary"
                                onClick={() =>
                                  onOpenDetail("risk", {
                                    riskTab: "environment",
                                    environmentKey: card.key,
                                  })
                                }
                              >
                                {t("dailyOps.viewDetail")}
                              </s-button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </PageSurface>

            <PageSurface
              title={t("dailyOps.taskWorkbenchTitle")}
              subtitle={t("dailyOps.taskWorkbenchSubtitle")}
            >
              {activeTaskCount === 0 && closedTasks.length === 0 ? (
                <div style={pageEmptyStateStyle}>{t("dailyOps.noTasks")}</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                  {activeTaskCount === 0 ? (
                    <div style={pageEmptyStateStyle}>{t("dailyOps.noTasks")}</div>
                  ) : (
                    QUADRANTS.filter(
                      (quadrant) => activeTasksByQuadrant[quadrant].length > 0,
                    ).map((quadrant) => (
                      <div
                        key={quadrant}
                        style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}
                      >
                        <div style={quadrantGroupHeaderStyle}>
                          <span style={quadrantDotStyle(quadrant)} />
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: "0.1rem",
                              flex: 1,
                              minWidth: 0,
                            }}
                          >
                            <strong
                              style={{
                                fontSize: "0.875rem",
                                color: pageColorTokens.textPrimary,
                              }}
                            >
                              {quadrantLabel(quadrant, t)}
                            </strong>
                            <span
                              style={{
                                fontSize: "0.75rem",
                                color: pageColorTokens.textSecondary,
                                lineHeight: 1.4,
                              }}
                            >
                              {t(`dailyOps.quadrant${quadrant.toUpperCase()}Desc`)}
                            </span>
                          </div>
                          <span style={quadrantCountBadgeStyle(quadrant)}>
                            {activeTasksByQuadrant[quadrant].length}
                          </span>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "0.75rem",
                          }}
                        >
                          {activeTasksByQuadrant[quadrant].map(renderTaskListRow)}
                        </div>
                      </div>
                    ))
                  )}

                  {closedTasks.length > 0 ? (
                    <div
                      style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}
                    >
                      <button
                        type="button"
                        style={closedToggleStyle}
                        onClick={() => setShowClosed((prev) => !prev)}
                        aria-expanded={showClosed}
                      >
                        <span aria-hidden="true">{showClosed ? "▾" : "▸"}</span>
                        {t("dailyOps.taskClosedSection", {
                          done: closedDoneCount,
                          ignored: closedIgnoredCount,
                        })}
                      </button>
                      {showClosed ? (
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "0.75rem",
                          }}
                        >
                          {closedTasks.map(renderTaskListRow)}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )}
            </PageSurface>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <PageSurface
              title={t("dailyOps.allInsightsTitle")}
            >
              <div style={toolbarSurfaceStyle}>
                <div
                  style={{
                    ...filterToolbarRowStyle,
                    ...(isMobile ? { alignItems: "stretch", gap: "0.65rem" } : null),
                  }}
                >
                  <div
                    style={{
                      ...filterControlWrapStyle,
                      ...(isMobile ? { flexDirection: "column", alignItems: "stretch", flex: "1 1 100%" } : null),
                    }}
                  >
                    <label htmlFor="all-insights-status" style={toolbarLabelStyle}>
                      {t("dailyOps.filterStatusAll")}
                    </label>
                    <select
                      id="all-insights-status"
                      style={{
                        ...filterSelectStyle,
                        ...(isMobile ? { width: "100%", minWidth: 0 } : null),
                      }}
                      value={allStatusFilter}
                      onChange={(event) => setAllStatusFilter(event.target.value)}
                    >
                      <option value="all">{t("dailyOps.filterStatusAll")}</option>
                      <option value="open">{t("dailyOps.taskStatusOpen")}</option>
                      <option value="in_progress">{t("dailyOps.taskStatusInProgress")}</option>
                      <option value="done">{t("dailyOps.taskStatusDone")}</option>
                    </select>
                  </div>
                  <div
                    style={{
                      ...filterControlWrapStyle,
                      ...(isMobile ? { flexDirection: "column", alignItems: "stretch", flex: "1 1 100%" } : null),
                    }}
                  >
                    <label htmlFor="all-insights-priority" style={toolbarLabelStyle}>
                      {t("dailyOps.filterPriorityAll")}
                    </label>
                    <select
                      id="all-insights-priority"
                      style={{
                        ...filterSelectStyle,
                        ...(isMobile ? { width: "100%", minWidth: 0 } : null),
                      }}
                      value={allPriorityFilter}
                      onChange={(event) => setAllPriorityFilter(event.target.value)}
                    >
                      <option value="all">{t("dailyOps.filterPriorityAll")}</option>
                      <option value="P0">{t("dailyOps.priorityHigh")}</option>
                      <option value="P1">{t("dailyOps.priorityMedium")}</option>
                      <option value="P2">{t("dailyOps.priorityLow")}</option>
                    </select>
                  </div>
                  <div
                    style={{
                      ...filterControlWrapStyle,
                      ...(isMobile ? { flexDirection: "column", alignItems: "stretch", flex: "1 1 100%" } : null),
                    }}
                  >
                    <label htmlFor="all-insights-effect" style={toolbarLabelStyle}>
                      {t("dailyOps.filterEffectAll")}
                    </label>
                    <select
                      id="all-insights-effect"
                      style={{
                        ...filterSelectStyle,
                        ...(isMobile ? { width: "100%", minWidth: 0 } : null),
                      }}
                      value={allEffectFilter}
                      onChange={(event) => setAllEffectFilter(event.target.value)}
                    >
                      <option value="all">{t("dailyOps.filterEffectAll")}</option>
                      <option value="revenue">{t("dailyOps.filterEffectRevenue")}</option>
                      <option value="conversion">{t("dailyOps.filterEffectConversion")}</option>
                      <option value="efficiency">{t("dailyOps.filterEffectEfficiency")}</option>
                      <option value="retention">{t("dailyOps.filterEffectRetention")}</option>
                    </select>
                  </div>
                  <div
                    style={{
                      marginLeft: isMobile ? 0 : "auto",
                      ...(isMobile ? { flex: "1 1 100%" } : null),
                    }}
                  >
                    <s-button
                      type="button"
                      variant="tertiary"
                      onClick={() => {
                        setAllStatusFilter("all");
                        setAllPriorityFilter("all");
                        setAllEffectFilter("all");
                      }}
                      {...(isMobile ? { style: { width: "100%" } } : {})}
                    >
                      {t("dailyOps.filterReset")}
                    </s-button>
                  </div>
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.75rem",
                  marginTop: "0.9rem",
                }}
              >
                {allInsightTasks.length === 0 ? (
                  <div style={pageEmptyStateStyle}>{t("dailyOps.filterEmpty")}</div>
                ) : (
                  allInsightTasks.map(renderTaskListRow)
                )}
              </div>
            </PageSurface>
          </div>
        )}
        {!hasPixelData ? (
          <p style={{ ...taskSecondaryTextStyle, marginTop: "0.55rem" }}>
            {t("dailyOps.pixelNotConnectedHint")}
          </p>
        ) : null}
      </section>

    </>
  );
}
