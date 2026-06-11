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
  getShopCostConfig,
  upsertShopCostConfig,
  type ShopCostConfigView,
} from "../server/operations/roi/costConfig.server";
import { ensureSkuCostsFresh } from "../server/operations/roi/skuCostSync.server";
import {
  ensureCustomerValueLayer,
  type CustomerValueAggregates,
} from "../server/operations/customerValue.server";
import {
  computeChannelRoi,
  type ChannelRoiResult,
} from "../server/operations/channelRoi.server";
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

type ValueLayerData = {
  costConfig: ShopCostConfigView;
  customers: CustomerValueAggregates;
  channels: ChannelRoiResult;
};

type LoaderData =
  | { ok: true; result: DailyOperationsResult; value: ValueLayerData | null }
  | { ok: false; error: string };

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  try {
    const result = await ensureDailySnapshot(session.shop);

    // 渠道与客户价值层（A 步）：失败不影响诊断与待办主流程
    let value: ValueLayerData | null = null;
    try {
      await ensureSkuCostsFresh(admin, session.shop);
      const costConfig = await getShopCostConfig(session.shop);
      const customers = await ensureCustomerValueLayer(
        session.shop,
        costConfig.defaultGrossMarginPercent,
      );
      const channels = await computeChannelRoi(session.shop, costConfig);
      value = { costConfig, customers, channels };
    } catch (error) {
      console.error("[daily-operations] value layer failed:", error);
    }

    return Response.json({ ok: true, result, value } satisfies LoaderData);
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
    if (intent === "cost-config") {
      const num = (name: string) => Number(formData.get(name)?.toString() ?? "");
      const config = await upsertShopCostConfig(session.shop, {
        defaultGrossMarginPercent: num("defaultGrossMarginPercent"),
        paymentFeePercent: num("paymentFeePercent"),
        paymentFeeFixed: num("paymentFeeFixed"),
        monthlyFixedCost: num("monthlyFixedCost"),
      });
      // 口径变更后按新毛利率重算客户价值层
      await ensureCustomerValueLayer(session.shop, config.defaultGrossMarginPercent, {
        force: true,
      });
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

/**
 * 矩阵展示顺序：Q1 Q2 / Q3 Q4。
 * 纵轴=紧急程度（上紧急下不紧急），横轴=重要程度（左重要右不重要）。
 */
const MATRIX_ORDER: TaskQuadrant[] = ["q1", "q2", "q3", "q4"];

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

const axisHintStyle: CSSProperties = {
  fontSize: "0.6875rem",
  fontWeight: 600,
  color: pageColorTokens.textSecondary,
  lineHeight: 1.2,
  userSelect: "none",
};

const matrixAxisLineStyle: CSSProperties = {
  background: pageColorTokens.borderSubtle,
  borderRadius: 999,
};

function MatrixUrgencyAxis({
  label,
  highLabel,
  lowLabel,
}: {
  label: string;
  highLabel: string;
  lowLabel: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "0.35rem",
        width: "2.75rem",
        alignSelf: "stretch",
        padding: "0.15rem 0",
      }}
      aria-hidden
    >
      <span style={axisHintStyle}>{highLabel}</span>
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          width: "100%",
          minHeight: 140,
        }}
      >
        <div
          style={{
            ...matrixAxisLineStyle,
            position: "absolute",
            left: "50%",
            top: 4,
            bottom: 4,
            width: 2,
            transform: "translateX(-50%)",
          }}
        />
        <span
          style={{
            ...axisLabelStyle,
            writingMode: "vertical-rl",
            padding: "0.35rem 0.25rem",
            borderRadius: pageColorTokens.radiusControl,
            background: pageColorTokens.surfaceMuted,
            border: `1px solid ${pageColorTokens.borderSubtle}`,
            lineHeight: 1.35,
          }}
        >
          {label}
        </span>
      </div>
      <span style={axisHintStyle}>{lowLabel}</span>
    </div>
  );
}

function MatrixImportanceAxis({
  label,
  highLabel,
  lowLabel,
}: {
  label: string;
  highLabel: string;
  lowLabel: string;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        alignItems: "center",
        gap: "0.55rem",
        paddingTop: "0.15rem",
      }}
      aria-hidden
    >
      <span style={axisHintStyle}>{highLabel}</span>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.45rem",
          minWidth: 0,
        }}
      >
        <div style={{ ...matrixAxisLineStyle, flex: 1, height: 2 }} />
        <span
          style={{
            ...axisLabelStyle,
            padding: "0.2rem 0.55rem",
            borderRadius: pageColorTokens.radiusControl,
            background: pageColorTokens.surfaceMuted,
            border: `1px solid ${pageColorTokens.borderSubtle}`,
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </span>
        <div style={{ ...matrixAxisLineStyle, flex: 1, height: 2 }} />
      </div>
      <span style={axisHintStyle}>{lowLabel}</span>
    </div>
  );
}

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
          <>
            <DailyOperationsBody
              result={data.result}
              isMobile={isMobile}
              locale={i18n.language}
              quadrantTitle={quadrantTitle}
              quadrantDesc={quadrantDesc}
              statusText={statusText}
              renderTaskCard={renderTaskCard}
            />
            {data.value ? (
              <ValueLayerSections value={data.value} isMobile={isMobile} />
            ) : null}
          </>
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
        // 桌面端：2×2 艾森豪威尔矩阵，纵轴=紧急程度、横轴=重要程度
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "stretch" }}>
          <MatrixUrgencyAxis
            label={t("dailyOps.axisUrgency")}
            highLabel={t("dailyOps.axisUrgencyHigh")}
            lowLabel={t("dailyOps.axisUrgencyLow")}
          />
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              gap: "0.55rem",
              minWidth: 0,
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
            <MatrixImportanceAxis
              label={t("dailyOps.axisImportance")}
              highLabel={t("dailyOps.axisImportanceHigh")}
              lowLabel={t("dailyOps.axisImportanceLow")}
            />
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

// ──────────────────────────────────────────────
// 渠道与客户价值层（ROI 归一体系 · A 步）
// ──────────────────────────────────────────────

const valueTableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "0.8125rem",
};

const valueThStyle: CSSProperties = {
  textAlign: "left",
  padding: "0.6rem 0.5rem",
  color: pageColorTokens.textSecondary,
  borderBottom: `1px solid ${pageColorTokens.borderSubtle}`,
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const valueGroupThStyle: CSSProperties = {
  textAlign: "left",
  padding: "0.5rem 0.5rem",
  color: pageColorTokens.textBody,
  borderBottom: `2px solid ${pageColorTokens.border}`,
  borderRight: `1px solid ${pageColorTokens.divider}`,
  fontWeight: 800,
  fontSize: "0.75rem",
  whiteSpace: "nowrap",
  background: pageColorTokens.surfaceMuted,
};

const groupHeadInnerStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.4rem",
};

const valueTdStyle: CSSProperties = {
  padding: "0.6rem 0.5rem",
  borderBottom: `1px solid ${pageColorTokens.divider}`,
  color: pageColorTokens.textBody,
  verticalAlign: "top",
  whiteSpace: "nowrap",
};

const costInputStyle: CSSProperties = {
  width: "100%",
  padding: "0.45rem 0.6rem",
  border: `1px solid ${pageColorTokens.borderInput}`,
  borderRadius: pageColorTokens.radiusControl,
  fontSize: "0.875rem",
};

const costLabelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.3rem",
  fontSize: "0.8125rem",
  color: pageColorTokens.textSecondary,
  flex: "1 1 160px",
};

// ── 数据来源标签（区分真实 / 估算 / 待接入占位） ──────────
type DataSource = "real" | "estimated" | "pending";

const dataSourceTone: Record<DataSource, "success" | "warning" | "neutral"> = {
  real: "success",
  estimated: "warning",
  pending: "neutral",
};

function SourceTag({ source }: { source: DataSource }) {
  const { t } = useTranslation();
  const label =
    source === "real"
      ? t("dailyOps.sourceReal")
      : source === "estimated"
        ? t("dailyOps.sourceEstimated")
        : t("dailyOps.sourcePending");
  const tip =
    source === "real"
      ? t("dailyOps.sourceRealTip")
      : source === "estimated"
        ? t("dailyOps.sourceEstimatedTip")
        : t("dailyOps.sourcePendingTip");
  return (
    <s-badge tone={dataSourceTone[source]}>
      <span title={tip}>{label}</span>
    </s-badge>
  );
}

const layerCardStyle = (accent: string): CSSProperties => ({
  flex: "1 1 200px",
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  borderLeft: `4px solid ${accent}`,
  borderRadius: pageColorTokens.radiusControl,
  padding: "0.7rem 0.85rem",
  background: "#fff",
  display: "flex",
  flexDirection: "column",
  gap: "0.4rem",
});

const layerTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "0.875rem",
  fontWeight: 800,
  color: pageColorTokens.textBody,
};

function LayerLegend() {
  const { t } = useTranslation();
  const layers: Array<{ accent: string; title: string; desc: string; source: DataSource }> = [
    {
      accent: "#007a5a",
      title: t("dailyOps.layerRevenue"),
      desc: t("dailyOps.layerRevenueDesc"),
      source: "real",
    },
    {
      accent: "#ea580c",
      title: t("dailyOps.layerProfit"),
      desc: t("dailyOps.layerProfitDesc"),
      source: "estimated",
    },
    {
      accent: "#6b7280",
      title: t("dailyOps.layerInvestment"),
      desc: t("dailyOps.layerInvestmentDesc"),
      source: "pending",
    },
  ];
  return (
    <PageSurface title={t("dailyOps.layerLegendTitle")}>
      <p style={{ ...taskSecondaryTextStyle, marginTop: 0, marginBottom: "0.75rem" }}>
        {t("dailyOps.layerLegendIntro")}
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem" }}>
        {layers.map((layer) => (
          <div key={layer.title} style={layerCardStyle(layer.accent)}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <h4 style={layerTitleStyle}>{layer.title}</h4>
              <SourceTag source={layer.source} />
            </div>
            <p style={{ ...taskSecondaryTextStyle, margin: 0 }}>{layer.desc}</p>
          </div>
        ))}
      </div>
    </PageSurface>
  );
}

function InvestmentLayerCard() {
  const { t } = useTranslation();
  const items = [
    t("dailyOps.investmentAdSpend"),
    t("dailyOps.investmentSeoCost"),
    t("dailyOps.investmentToolCost"),
  ];
  return (
    <PageSurface
      title={t("dailyOps.investmentTitle")}
      subtitle={t("dailyOps.investmentSubtitle")}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          marginBottom: "0.75rem",
        }}
      >
        <SourceTag source="pending" />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
        {items.map((item) => (
          <div
            key={item}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.45rem",
              padding: "0.5rem 0.75rem",
              border: `1px dashed ${pageColorTokens.border}`,
              borderRadius: pageColorTokens.radiusControl,
              fontSize: "0.8125rem",
              color: pageColorTokens.textSecondary,
              background: pageColorTokens.surfaceMuted,
            }}
          >
            <span>{item}</span>
            <s-badge tone="neutral">{t("dailyOps.investmentNotConnected")}</s-badge>
          </div>
        ))}
      </div>
    </PageSurface>
  );
}

function ValueLayerSections({
  value,
  isMobile,
}: {
  value: ValueLayerData;
  isMobile: boolean;
}) {
  const { t } = useTranslation();
  const { customers, channels } = value;
  const seg = customers.segmentCounts;

  return (
    <>
      <section>
        <h2 style={pageSectionMajorTitleStyle}>{t("dailyOps.valueTitle")}</h2>
      </section>

      <LayerLegend />

      <PageSurface
        title={t("dailyOps.customerTitle")}
        subtitle={t("dailyOps.customerSubtitle", {
          total: customers.payingCustomers,
        })}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
          <SourceTag source="estimated" />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
          <PageMetricCard
            metrics={[
              {
                label: t("dailyOps.metricRepeatRate"),
                value: `${customers.repeatPurchaseRate}%`,
              },
              {
                label: t("dailyOps.metricAvgScore"),
                value: String(customers.averageScore),
              },
              {
                label: t("dailyOps.metricHighValueShare"),
                value: `${customers.highValueShare}%`,
              },
              {
                label: t("dailyOps.metricAvgLtv"),
                value: String(customers.averageDynamicLtv),
                unit: channels.currency,
              },
            ]}
          />
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            <s-badge tone="info">{t("dailyOps.segmentNew")}: {seg.new}</s-badge>
            <s-badge tone="success">{t("dailyOps.segmentActive")}: {seg.active}</s-badge>
            <s-badge tone="success">{t("dailyOps.segmentVip")}: {seg.vip}</s-badge>
            <s-badge tone="warning">{t("dailyOps.segmentAtRisk")}: {seg.at_risk}</s-badge>
            <s-badge>{t("dailyOps.segmentChurned")}: {seg.churned}</s-badge>
            <s-badge tone="critical">
              {t("dailyOps.tagRefundRisk")}: {customers.tagCounts.refund_risk}
            </s-badge>
            <s-badge tone="warning">
              {t("dailyOps.tagDiscountSensitive")}: {customers.tagCounts.discount_sensitive}
            </s-badge>
          </div>
        </div>
      </PageSurface>

      <PageSurface
        title={t("dailyOps.channelTitle", { days: channels.windowDays })}
        subtitle={t("dailyOps.channelSubtitle", {
          share: channels.attributedRevenueShare,
        })}
      >
        {channels.channels.length === 0 ? (
          <p style={taskSecondaryTextStyle}>{t("dailyOps.noChannelData")}</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={valueTableStyle}>
              <thead>
                <tr>
                  <th style={valueGroupThStyle} colSpan={2}>
                    {t("dailyOps.groupBasic")}
                  </th>
                  <th style={valueGroupThStyle} colSpan={1}>
                    <span style={groupHeadInnerStyle}>
                      {t("dailyOps.layerRevenue")} <SourceTag source="real" />
                    </span>
                  </th>
                  <th style={valueGroupThStyle} colSpan={2}>
                    <span style={groupHeadInnerStyle}>
                      {t("dailyOps.layerProfit")} <SourceTag source="estimated" />
                    </span>
                  </th>
                  <th style={valueGroupThStyle} colSpan={3}>
                    <span style={groupHeadInnerStyle}>
                      {t("dailyOps.groupCustomerQuality")} <SourceTag source="estimated" />
                    </span>
                  </th>
                  <th style={valueGroupThStyle} colSpan={1}>
                    <span style={groupHeadInnerStyle}>
                      {t("dailyOps.layerInvestment")} <SourceTag source="pending" />
                    </span>
                  </th>
                </tr>
                <tr>
                  <th style={valueThStyle}>{t("dailyOps.colChannel")}</th>
                  <th style={valueThStyle}>{t("dailyOps.colOrders")}</th>
                  <th style={valueThStyle}>{t("dailyOps.colRevenue")}</th>
                  <th style={valueThStyle}>{t("dailyOps.colProfit")}</th>
                  <th style={valueThStyle}>{t("dailyOps.colMargin")}</th>
                  <th style={valueThStyle}>{t("dailyOps.colNewShare")}</th>
                  <th style={valueThStyle}>{t("dailyOps.colRepeatShare")}</th>
                  <th style={valueThStyle}>{t("dailyOps.colScore")}</th>
                  <th style={valueThStyle}>{t("dailyOps.colRoi")}</th>
                </tr>
              </thead>
              <tbody>
                {channels.channels.map((channel) => (
                  <tr key={channel.channelKey}>
                    <td style={{ ...valueTdStyle, fontWeight: 700 }}>{channel.label}</td>
                    <td style={valueTdStyle}>{channel.orderCount}</td>
                    <td style={valueTdStyle}>
                      {channel.revenue} {channels.currency}
                    </td>
                    <td
                      style={{
                        ...valueTdStyle,
                        color:
                          channel.contributionProfit >= 0 ? "#007a5a" : "#dc2626",
                        fontWeight: 700,
                      }}
                    >
                      {channel.contributionProfit}
                    </td>
                    <td style={valueTdStyle}>
                      {channel.contributionMarginPercent === null
                        ? "—"
                        : `${channel.contributionMarginPercent}%`}
                    </td>
                    <td style={valueTdStyle}>{channel.customers.newOrderShare}%</td>
                    <td style={valueTdStyle}>{channel.customers.repeatCustomerShare}%</td>
                    <td style={valueTdStyle}>
                      {channel.customers.averageCustomerValueScore ?? "—"}
                    </td>
                    <td style={valueTdStyle}>
                      <s-badge tone="neutral">{t("dailyOps.roiPendingAds")}</s-badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ marginTop: "0.75rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          {channels.caveats.map((line, index) => (
            <p key={index} style={{ ...taskSecondaryTextStyle, fontSize: "0.75rem" }}>
              * {line}
            </p>
          ))}
        </div>
      </PageSurface>

      <InvestmentLayerCard />

      <CostConfigCard costConfig={value.costConfig} isMobile={isMobile} />
    </>
  );
}

function CostConfigCard({
  costConfig,
  isMobile,
}: {
  costConfig: ShopCostConfigView;
  isMobile: boolean;
}) {
  const { t } = useTranslation();
  const fetcher = useFetcher();
  const saving = fetcher.state !== "idle";

  return (
    <PageSurface
      title={t("dailyOps.costTitle")}
      subtitle={t("dailyOps.costSubtitle")}
    >
      <fetcher.Form method="post">
        <input type="hidden" name="intent" value="cost-config" />
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.9rem",
            flexDirection: isMobile ? "column" : "row",
            alignItems: isMobile ? "stretch" : "flex-end",
          }}
        >
          <label style={costLabelStyle}>
            {t("dailyOps.costMargin")}
            <input
              style={costInputStyle}
              type="number"
              name="defaultGrossMarginPercent"
              step="0.1"
              min="0"
              max="100"
              defaultValue={costConfig.defaultGrossMarginPercent}
            />
          </label>
          <label style={costLabelStyle}>
            {t("dailyOps.costFeePercent")}
            <input
              style={costInputStyle}
              type="number"
              name="paymentFeePercent"
              step="0.1"
              min="0"
              max="20"
              defaultValue={costConfig.paymentFeePercent}
            />
          </label>
          <label style={costLabelStyle}>
            {t("dailyOps.costFeeFixed")}
            <input
              style={costInputStyle}
              type="number"
              name="paymentFeeFixed"
              step="0.01"
              min="0"
              defaultValue={costConfig.paymentFeeFixed}
            />
          </label>
          <label style={costLabelStyle}>
            {t("dailyOps.costMonthlyFixed")}
            <input
              style={costInputStyle}
              type="number"
              name="monthlyFixedCost"
              step="1"
              min="0"
              defaultValue={costConfig.monthlyFixedCost}
            />
          </label>
          <div style={{ flex: "0 0 auto" }}>
            <s-button
              type="submit"
              variant="primary"
              {...(saving ? { disabled: true } : {})}
            >
              {saving ? t("dailyOps.costSaving") : t("dailyOps.costSave")}
            </s-button>
          </div>
        </div>
      </fetcher.Form>
      {!costConfig.isConfigured ? (
        <p style={{ ...taskSecondaryTextStyle, marginTop: "0.6rem" }}>
          {t("dailyOps.costDefaultHint")}
        </p>
      ) : null}
    </PageSurface>
  );
}
