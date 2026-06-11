import type { CSSProperties, ReactNode } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData, useRevalidator } from "react-router";
import { useTranslation } from "react-i18next";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";
import { authenticate } from "../shopify.server";
import {
  ensureDailySnapshot,
  updateOperationTaskStatus,
  type DailyOperationsResult,
  type OperationTaskAction,
  type OperationTaskView,
} from "../server/operations/dailyInspection.server";
import type { TaskQuadrant } from "../server/operations/diagnosisRules.server";
import {
  PageHeaderNav,
  PageMetricCard,
  PageSurface,
  pageColorTokens,
  mobilePageContentStyle,
  pageContentStyle,
  pageEmptyStateStyle,
  pageIntroBannerStyle,
  pageSectionHeaderRowStyle,
  pageSectionMajorTitleStyle,
  pageAccentBadgeStyle,
} from "./page/pageUiStyles";

type LoaderData =
  | { ok: true; result: DailyOperationsResult }
  | { ok: false; error: string };

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  try {
    const result = await ensureDailySnapshot(session.shop);
    return Response.json({ ok: true, result } satisfies LoaderData);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[daily-operations] loader failed:", error);
    return Response.json({ ok: false, error: message } satisfies LoaderData);
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent")?.toString();

  try {
    if (intent === "refresh") {
      await ensureDailySnapshot(session.shop, { force: true });
      return Response.json({ ok: true });
    }
    if (intent === "task") {
      const taskId = formData.get("taskId")?.toString() ?? "";
      const taskAction = formData.get("taskAction")?.toString() as
        | OperationTaskAction
        | undefined;
      if (
        !taskId ||
        !taskAction ||
        !["start", "done", "ignore", "reopen"].includes(taskAction)
      ) {
        return Response.json({ ok: false, error: "invalid params" }, { status: 400 });
      }
      const updated = await updateOperationTaskStatus(
        session.shop,
        taskId,
        taskAction,
      );
      if (!updated) {
        return Response.json({ ok: false, error: "task not found" }, { status: 404 });
      }
      return Response.json({ ok: true });
    }
    return Response.json({ ok: false, error: "unsupported intent" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[daily-operations] action failed:", error);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
};

// ──────────────────────────────────────────────
// UI
// ──────────────────────────────────────────────

const QUADRANTS: TaskQuadrant[] = ["q1", "q2", "q3", "q4"];

/** 矩阵展示顺序：左上 Q3（重要不紧急）、右上 Q1（重要且紧急）、左下 Q4、右下 Q2 */
const MATRIX_ORDER: TaskQuadrant[] = ["q3", "q1", "q4", "q2"];

const quadrantAccentColors: Record<TaskQuadrant, string> = {
  q1: "#dc2626",
  q2: "#ea580c",
  q3: "#4070f4",
  q4: "#6b7280",
};

const quadrantTintColors: Record<TaskQuadrant, string> = {
  q1: "rgba(220, 38, 38, 0.04)",
  q2: "rgba(234, 88, 12, 0.04)",
  q3: "rgba(64, 112, 244, 0.04)",
  q4: "rgba(107, 114, 128, 0.04)",
};

const quadrantCellStyle = (quadrant: TaskQuadrant): CSSProperties => ({
  border: `1px solid ${pageColorTokens.border}`,
  borderTop: `4px solid ${quadrantAccentColors[quadrant]}`,
  borderRadius: pageColorTokens.radiusCard,
  background: `linear-gradient(180deg, ${quadrantTintColors[quadrant]} 0%, #ffffff 60%)`,
  padding: "0.9rem 1rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.7rem",
  minHeight: "200px",
});

const quadrantCountBadgeStyle = (quadrant: TaskQuadrant): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: "1.5rem",
  height: "1.5rem",
  padding: "0 0.4rem",
  borderRadius: "999px",
  background: quadrantAccentColors[quadrant],
  color: "#fff",
  fontSize: "0.75rem",
  fontWeight: 700,
});

const axisLabelStyle: CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 700,
  letterSpacing: "0.12em",
  color: pageColorTokens.textSecondary,
  userSelect: "none",
};

const taskCardStyle = (quadrant: TaskQuadrant): CSSProperties => ({
  border: `1px solid ${pageColorTokens.border}`,
  borderLeft: `4px solid ${quadrantAccentColors[quadrant]}`,
  borderRadius: pageColorTokens.radiusControl,
  padding: "0.9rem 1rem",
  background: "#fff",
  display: "flex",
  flexDirection: "column",
  gap: "0.6rem",
});

const taskTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "0.9375rem",
  fontWeight: 700,
  color: pageColorTokens.textBody,
};

const taskMetaTextStyle: CSSProperties = {
  margin: 0,
  fontSize: "0.8125rem",
  lineHeight: 1.5,
  color: pageColorTokens.textBody,
};

const taskSecondaryTextStyle: CSSProperties = {
  ...taskMetaTextStyle,
  color: pageColorTokens.textSecondary,
};

const actionListStyle: CSSProperties = {
  margin: 0,
  paddingLeft: "1.1rem",
  fontSize: "0.8125rem",
  lineHeight: 1.6,
  color: pageColorTokens.textBody,
};

function priorityTone(priority: string): "critical" | "warning" | "info" {
  if (priority === "P0") return "critical";
  if (priority === "P1") return "warning";
  return "info";
}

function statusTone(
  status: string,
): "success" | "warning" | "critical" | "info" {
  if (status === "done") return "success";
  if (status === "in_progress") return "info";
  if (status === "open") return "warning";
  return "info";
}

function diagnosisTone(status: string): "success" | "warning" | "critical" {
  if (status === "healthy") return "success";
  if (status === "watch") return "warning";
  return "critical";
}

export default function DailyOperationsPage() {
  const { t, i18n } = useTranslation();
  const { isMobile } = useResponsiveLayout();
  const data = useLoaderData() as LoaderData;
  const fetcher = useFetcher();
  const revalidator = useRevalidator();
  const busy = fetcher.state !== "idle" || revalidator.state !== "idle";

  const statusText = (status: string) => {
    switch (status) {
      case "healthy":
        return t("dailyOps.statusHealthy");
      case "watch":
        return t("dailyOps.statusWatch");
      default:
        return t("dailyOps.statusRisk");
    }
  };

  const taskStatusText = (status: string) => {
    switch (status) {
      case "open":
        return t("dailyOps.taskStatusOpen");
      case "in_progress":
        return t("dailyOps.taskStatusInProgress");
      case "done":
        return t("dailyOps.taskStatusDone");
      case "ignored":
        return t("dailyOps.taskStatusIgnored");
      default:
        return t("dailyOps.taskStatusAutoClosed");
    }
  };

  const dueWindowText = (window: string) => {
    switch (window) {
      case "today":
        return t("dailyOps.dueWindowToday");
      case "48h":
        return t("dailyOps.dueWindow48h");
      case "this_week":
        return t("dailyOps.dueWindowThisWeek");
      default:
        return t("dailyOps.dueWindowBacklog");
    }
  };

  const quadrantTitle = (q: TaskQuadrant) => t(`dailyOps.quadrant${q.toUpperCase()}`);
  const quadrantDesc = (q: TaskQuadrant) =>
    t(`dailyOps.quadrant${q.toUpperCase()}Desc`);

  const submitTaskAction = (taskId: string, taskAction: OperationTaskAction) => {
    fetcher.submit({ intent: "task", taskId, taskAction }, { method: "post" });
  };

  const submitRefresh = () => {
    fetcher.submit({ intent: "refresh" }, { method: "post" });
  };

  const renderTaskCard = (task: OperationTaskView) => {
    const closed = ["done", "ignored", "auto_closed"].includes(task.status);
    return (
      <div
        key={task.id}
        style={{ ...taskCardStyle(task.quadrant), ...(closed ? { opacity: 0.62 } : null) }}
      >
        <s-stack direction={isMobile ? "block" : "inline"} gap="small" alignItems="center">
          <s-badge tone={priorityTone(task.priority)}>{task.priority}</s-badge>
          <s-badge tone={statusTone(task.status)}>{taskStatusText(task.status)}</s-badge>
          <s-badge>{dueWindowText(task.dueWindow)}</s-badge>
          <h4 style={taskTitleStyle}>{task.title}</h4>
        </s-stack>
        <p style={taskMetaTextStyle}>
          <strong>{t("dailyOps.triggerReasonLabel")}：</strong>
          {task.triggerReason}
        </p>
        {task.suggestedActions.length > 0 ? (
          <div>
            <p style={{ ...taskSecondaryTextStyle, marginBottom: "0.2rem" }}>
              {t("dailyOps.suggestedActionsLabel")}
            </p>
            <ul style={actionListStyle}>
              {task.suggestedActions.map((action, index) => (
                <li key={index}>{action}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {task.ownerRole ? (
          <p style={taskSecondaryTextStyle}>
            {t("dailyOps.ownerLabel", { value: task.ownerRole })}
          </p>
        ) : null}
        <s-stack direction="inline" gap="small">
          {task.status === "open" ? (
            <>
              <s-button
                type="button"
                variant="primary"
                onClick={() => submitTaskAction(task.id, "start")}
                {...(busy ? { disabled: true } : {})}
              >
                {t("dailyOps.actionStart")}
              </s-button>
              <s-button
                type="button"
                variant="secondary"
                onClick={() => submitTaskAction(task.id, "done")}
                {...(busy ? { disabled: true } : {})}
              >
                {t("dailyOps.actionDone")}
              </s-button>
              <s-button
                type="button"
                variant="tertiary"
                onClick={() => submitTaskAction(task.id, "ignore")}
                {...(busy ? { disabled: true } : {})}
              >
                {t("dailyOps.actionIgnore")}
              </s-button>
            </>
          ) : null}
          {task.status === "in_progress" ? (
            <s-button
              type="button"
              variant="primary"
              onClick={() => submitTaskAction(task.id, "done")}
              {...(busy ? { disabled: true } : {})}
            >
              {t("dailyOps.actionDone")}
            </s-button>
          ) : null}
          {closed ? (
            <s-button
              type="button"
              variant="tertiary"
              onClick={() => submitTaskAction(task.id, "reopen")}
              {...(busy ? { disabled: true } : {})}
            >
              {t("dailyOps.actionReopen")}
            </s-button>
          ) : null}
        </s-stack>
      </div>
    );
  };

  return (
    <s-page heading={t("dailyOps.pageTitle")}>
      <div style={pageIntroBannerStyle("diagnosis", { marginBottom: "1.5rem" })}>
        {t("dailyOps.pageIntro")}
      </div>

      <div
        style={{ ...pageContentStyle, ...(isMobile ? mobilePageContentStyle : null) }}
      >
        <PageHeaderNav
          title={t("dailyOps.pageTitle")}
          backLabel={t("common.backToPrevious", { defaultValue: "返回工作台" })}
          workspaceOnly
          rightAction={
            <s-button
              type="button"
              variant="secondary"
              onClick={submitRefresh}
              {...(busy ? { disabled: true } : {})}
            >
              {busy ? t("dailyOps.refreshing") : t("dailyOps.refresh")}
            </s-button>
          }
        />

        {!data.ok ? (
          <div style={pageEmptyStateStyle}>
            <span>{data.error}</span>
          </div>
        ) : !data.result.hasData ? (
          <div style={pageEmptyStateStyle}>
            <span>{t("dailyOps.emptyState")}</span>
          </div>
        ) : (
          <DailyOperationsBody
            result={data.result}
            isMobile={isMobile}
            locale={i18n.language}
            quadrantTitle={quadrantTitle}
            quadrantDesc={quadrantDesc}
            statusText={statusText}
            renderTaskCard={renderTaskCard}
          />
        )}
      </div>
    </s-page>
  );
}

function DailyOperationsBody({
  result,
  isMobile,
  locale,
  quadrantTitle,
  quadrantDesc,
  statusText,
  renderTaskCard,
}: {
  result: DailyOperationsResult;
  isMobile: boolean;
  locale: string;
  quadrantTitle: (q: TaskQuadrant) => string;
  quadrantDesc: (q: TaskQuadrant) => string;
  statusText: (status: string) => string;
  renderTaskCard: (task: OperationTaskView) => ReactNode;
}) {
  const { t } = useTranslation();
  const m = result.metrics;
  const growthLabel =
    m.salesGrowthRate === null
      ? t("dailyOps.metricNoBaseline")
      : `${m.salesGrowthRate >= 0 ? "+" : ""}${m.salesGrowthRate}%`;

  const tasksByQuadrant = new Map<TaskQuadrant, OperationTaskView[]>();
  for (const q of QUADRANTS) tasksByQuadrant.set(q, []);
  for (const task of result.tasks) {
    tasksByQuadrant.get(task.quadrant)?.push(task);
  }

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
          <h2 style={pageSectionMajorTitleStyle}>{t("dailyOps.coreBoard")}</h2>
          <span style={pageAccentBadgeStyle}>
            {t("dailyOps.snapshotDateLabel", { date: result.snapshotDate })}
          </span>
        </div>
        <PageMetricCard
          accent={t("dailyOps.shopLabel", { value: result.shop })}
          metrics={[
            {
              label: t("dailyOps.metricSales7d"),
              value: String(m.salesAmount7d),
              unit: m.currency,
            },
            { label: t("dailyOps.metricGrowth"), value: growthLabel },
            {
              label: t("dailyOps.metricPendingOrders"),
              value: String(m.pendingOrderCount),
            },
            {
              label: t("dailyOps.metricOverdue"),
              value: String(m.overdueOrderCount),
            },
            {
              label: t("dailyOps.metricCarrierIssues"),
              value: String(m.carrierIssueCount),
            },
            {
              label: t("dailyOps.metricRefundRate"),
              value: `${m.refundRate30d}%`,
            },
            {
              label: t("dailyOps.metricRiskSkus"),
              value: String(m.riskSkuCount),
            },
          ]}
          footer={t("dailyOps.generatedAtLabel", {
            value: new Date(result.generatedAt).toLocaleString(locale),
          })}
        />
      </section>

      <PageSurface title={t("dailyOps.healthTitle")}>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {result.items.map((item) => (
            <div
              key={item.key}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.35rem",
                padding: "0.75rem 0.9rem",
                border: `1px solid ${pageColorTokens.borderSubtle}`,
                borderRadius: pageColorTokens.radiusControl,
              }}
            >
              <s-stack direction={isMobile ? "block" : "inline"} gap="small" alignItems="center">
                <s-badge tone={diagnosisTone(item.status)}>
                  {item.name}: {statusText(item.status)}
                </s-badge>
              </s-stack>
              {item.evidence.map((line, index) => (
                <p key={`e-${index}`} style={taskSecondaryTextStyle}>
                  {line}
                </p>
              ))}
              {item.status !== "healthy"
                ? item.reasoning.map((line, index) => (
                    <p key={`r-${index}`} style={taskMetaTextStyle}>
                      {line}
                    </p>
                  ))
                : null}
            </div>
          ))}
        </div>
      </PageSurface>

      {result.review ? (
        <PageSurface
          title={t("dailyOps.reviewTitle", { date: result.review.previousDate })}
          subtitle={t("dailyOps.reviewResolved", {
            count: result.review.resolvedTaskCount,
          })}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem" }}>
            {result.review.deltas.map((delta) => (
              <div
                key={delta.key}
                style={{
                  padding: "0.55rem 0.8rem",
                  border: `1px solid ${pageColorTokens.borderSubtle}`,
                  borderRadius: pageColorTokens.radiusControl,
                  fontSize: "0.8125rem",
                  color: pageColorTokens.textBody,
                  background: "#fff",
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
        </PageSurface>
      ) : null}

      <section>
        <h2 style={pageSectionMajorTitleStyle}>{t("dailyOps.todoTitle")}</h2>
      </section>
      {isMobile ? (
        // 移动端：矩阵太挤，按 Q1→Q4 优先级单列堆叠
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {QUADRANTS.map((quadrant) => (
            <QuadrantCell
              key={quadrant}
              quadrant={quadrant}
              title={quadrantTitle(quadrant)}
              desc={quadrantDesc(quadrant)}
              tasks={tasksByQuadrant.get(quadrant) ?? []}
              emptyLabel={t("dailyOps.noTasks")}
              renderTaskCard={renderTaskCard}
            />
          ))}
        </div>
      ) : (
        // 桌面端：2×2 艾森豪威尔矩阵，纵轴=重要程度、横轴=紧急程度
        <div style={{ display: "flex", gap: "0.6rem" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "1.4rem",
            }}
          >
            <span
              style={{
                ...axisLabelStyle,
                writingMode: "vertical-rl",
                transform: "rotate(180deg)",
              }}
            >
              {t("dailyOps.axisImportance")} →
            </span>
          </div>
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              gap: "0.6rem",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "0.75rem",
                alignItems: "stretch",
              }}
            >
              {MATRIX_ORDER.map((quadrant) => (
                <QuadrantCell
                  key={quadrant}
                  quadrant={quadrant}
                  title={quadrantTitle(quadrant)}
                  desc={quadrantDesc(quadrant)}
                  tasks={tasksByQuadrant.get(quadrant) ?? []}
                  emptyLabel={t("dailyOps.noTasks")}
                  renderTaskCard={renderTaskCard}
                />
              ))}
            </div>
            <div style={{ ...axisLabelStyle, textAlign: "center" }}>
              {t("dailyOps.axisUrgency")} →
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function QuadrantCell({
  quadrant,
  title,
  desc,
  tasks,
  emptyLabel,
  renderTaskCard,
}: {
  quadrant: TaskQuadrant;
  title: string;
  desc: string;
  tasks: OperationTaskView[];
  emptyLabel: string;
  renderTaskCard: (task: OperationTaskView) => ReactNode;
}) {
  const activeCount = tasks.filter((task) =>
    ["open", "in_progress"].includes(task.status),
  ).length;
  return (
    <div style={quadrantCellStyle(quadrant)}>
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.5rem",
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: "0.9375rem",
              fontWeight: 800,
              color: quadrantAccentColors[quadrant],
            }}
          >
            {title}
          </h3>
          <span style={quadrantCountBadgeStyle(quadrant)}>{activeCount}</span>
        </div>
        <p style={{ ...taskSecondaryTextStyle, marginTop: "0.25rem" }}>{desc}</p>
      </div>
      {tasks.length === 0 ? (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: pageColorTokens.textSecondary,
            fontSize: "0.8125rem",
          }}
        >
          {emptyLabel}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {tasks.map(renderTaskCard)}
        </div>
      )}
    </div>
  );
}
