import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useFetcher, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import type { OperationTaskView } from "../../../server/operations/dailyInspection.server";
import type { OperationTaskAction } from "../../../server/operations/dailyInspection.server";
import {
  AITaskCardShell,
  type CardAction,
} from "../aiTask/AITaskCardShell";
import {
  buildOperationTaskPrompt,
  inferOperationTaskPresentation,
} from "../../../lib/operationTaskPresentation";
import { pageColorTokens } from "../../page/pageUiStyles";

type Props = {
  task: OperationTaskView;
  locationSearch: string;
  onUpdated?: () => void;
};

function statusLabel(
  status: string,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
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
}

function statusTone(status: string) {
  switch (status) {
    case "done":
      return {
        background: "#ecfdf5",
        border: "#a7f3d0",
        color: "#047857",
      };
    case "in_progress":
      return {
        background: "#eef2ff",
        border: "#c7d2fe",
        color: "#3730a3",
      };
    case "ignored":
    case "auto_closed":
      return {
        background: "#fff7ed",
        border: "#fed7aa",
        color: "#9a3412",
      };
    default:
      return {
        background: "#fef2f2",
        border: "#fecaca",
        color: "#b91c1c",
      };
  }
}

function dueWindowLabel(
  dueWindow: string,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  switch (dueWindow) {
    case "today":
      return t("dailyOps.dueWindowToday");
    case "48h":
      return t("dailyOps.dueWindow48h");
    case "this_week":
      return t("dailyOps.dueWindowThisWeek");
    default:
      return t("dailyOps.dueWindowBacklog");
  }
}

function priorityBadge(priority: string): ReactNode {
  const tone =
    priority === "P0"
      ? { background: "#fef2f2", border: "#fecaca", color: "#b91c1c" }
      : priority === "P1"
        ? { background: "#fff7ed", border: "#fed7aa", color: "#9a3412" }
        : {
            background: pageColorTokens.surfaceMuted,
            border: pageColorTokens.borderSubtle,
            color: pageColorTokens.textSecondary,
          };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "0.22rem 0.55rem",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        border: `1px solid ${tone.border}`,
        background: tone.background,
        color: tone.color,
      }}
    >
      {priority}
    </span>
  );
}

function toAiTaskStatus(status: OperationTaskView["status"]) {
  switch (status) {
    case "in_progress":
      return "running" as const;
    case "done":
      return "applied" as const;
    case "ignored":
      return "cancelled" as const;
    case "auto_closed":
      return "succeeded" as const;
    default:
      return "pending_review" as const;
  }
}

function progressPercent(status: OperationTaskView["status"]) {
  switch (status) {
    case "in_progress":
      return 56;
    case "done":
      return 100;
    case "ignored":
    case "auto_closed":
      return 100;
    default:
      return 18;
  }
}

function progressBackground(status: OperationTaskView["status"]) {
  switch (status) {
    case "done":
      return "linear-gradient(90deg, #10b981, #34d399)";
    case "in_progress":
      return "linear-gradient(90deg, #4f46e5, #60a5fa)";
    case "ignored":
    case "auto_closed":
      return "linear-gradient(90deg, #f59e0b, #fbbf24)";
    default:
      return "linear-gradient(90deg, #ef4444, #f97316)";
  }
}

const ACTION_TO_STATUS: Record<OperationTaskAction, OperationTaskView["status"]> = {
  start: "in_progress",
  done: "done",
  ignore: "ignored",
  reopen: "open",
};

function buildReturnToPath(locationSearch: string) {
  return `/app/tasks${locationSearch}`;
}

export function OperationTaskCard({ task, locationSearch, onUpdated }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const fetcher = useFetcher<{ ok?: boolean }>();
  const [localStatus, setLocalStatus] = useState<OperationTaskView["status"]>(task.status);
  const submittedAction = useRef<OperationTaskAction | null>(null);

  useEffect(() => {
    setLocalStatus(task.status);
  }, [task.status]);

  useEffect(() => {
    if (fetcher.state !== "idle") return;
    if (!fetcher.data?.ok || !submittedAction.current) return;
    setLocalStatus(ACTION_TO_STATUS[submittedAction.current]);
    submittedAction.current = null;
    onUpdated?.();
  }, [fetcher.data, fetcher.state, onUpdated]);

  const metaLine = useMemo(
    () =>
      [
        task.ownerRole ?? t("dailyOps.taskPromptOwnerUnknown"),
        dueWindowLabel(task.dueWindow, t),
        task.quadrant.toUpperCase(),
      ].join(" · "),
    [task.dueWindow, task.ownerRole, task.quadrant, t],
  );

  const presentation = useMemo(() => inferOperationTaskPresentation(task, t), [task, t]);
  const pendingAction = useMemo(
    () =>
      fetcher.formData?.get("intent")?.toString() === "task"
        ? (fetcher.formData.get("taskAction")?.toString() as OperationTaskAction | undefined)
        : undefined,
    [fetcher.formData],
  );

  const statusBadge = (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "0.22rem 0.55rem",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        border: `1px solid ${statusTone(localStatus).border}`,
        background: statusTone(localStatus).background,
        color: statusTone(localStatus).color,
      }}
    >
      {statusLabel(localStatus, t)}
    </span>
  );

  const returnTo = buildReturnToPath(locationSearch);
  const openDetail = () =>
    navigate(
      `/app/today/diagnosis?detail=task&taskId=${encodeURIComponent(task.id)}&returnTo=${encodeURIComponent(returnTo)}`,
    );
  const sendToAi = () => {
    const params = new URLSearchParams(
      locationSearch.startsWith("?") ? locationSearch.slice(1) : locationSearch,
    );
    params.set("panel", "chat");
    params.set(
      "prefillTaskPrompt",
      buildOperationTaskPrompt(task, presentation, {
        taskStatusText: statusLabel(localStatus, t),
        dueWindowText: dueWindowLabel(task.dueWindow, t),
        t,
      }),
    );
    navigate(`/app?${params.toString()}`);
  };
  const submitTaskAction = (taskAction: OperationTaskAction) => {
    submittedAction.current = taskAction;
    fetcher.submit(
      {
        intent: "task",
        taskId: task.id,
        taskAction,
      },
      {
        action: "/app/today/diagnosis",
        method: "post",
      },
    );
  };

  const actions: CardAction[] = [];
  if (localStatus === "open") {
    actions.push({
      label: t("dailyOps.actionStart"),
      tone: "primary",
      disabled: pendingAction != null,
      onClick: () => submitTaskAction("start"),
    });
  } else if (localStatus === "in_progress") {
    actions.push({
      label: t("dailyOps.actionDone"),
      tone: "primary",
      disabled: pendingAction != null,
      onClick: () => submitTaskAction("done"),
    });
  } else {
    actions.push({
      label: t("dailyOps.actionReopen"),
      tone: "primary",
      disabled: pendingAction != null,
      onClick: () => submitTaskAction("reopen"),
    });
  }
  actions.push(
    {
      label: t("dailyOps.actionSendToAi"),
      tone: "secondary",
      disabled: pendingAction != null,
      onClick: sendToAi,
    },
    {
      label: t("common.viewDetail"),
      tone: "subtle",
      disabled: pendingAction != null,
      onClick: openDetail,
    },
  );

  return (
    <AITaskCardShell
      task={{
        id: task.id,
        createdAt: task.createdAt,
        completedAt: task.resolvedAt,
      }}
      locationSearch={locationSearch}
      status={toAiTaskStatus(localStatus)}
      statusBadge={statusBadge}
      extraBadges={priorityBadge(task.priority)}
      title={task.title}
      metaLine={
        <>
          <span>{metaLine}</span>
        </>
      }
      primaryCopy={presentation.objective}
      secondaryCopy={[
        `${t("dailyOps.taskImpactMetricLabel")}：${presentation.impactMetric}`,
        `${t("dailyOps.taskRoiImpactLabel")}：${presentation.roiImpact}`,
      ].join(" | ")}
      progressPercent={progressPercent(localStatus)}
      progressBackground={progressBackground(localStatus)}
      bodyContent={
        <div
          style={{
            display: "grid",
            gap: 10,
          }}
        >
          <div
            style={{
              fontSize: 12,
              lineHeight: 1.6,
              color: pageColorTokens.textSecondary,
              padding: "0.85rem 0.95rem",
              borderRadius: pageColorTokens.radiusControl,
              background: pageColorTokens.surfaceMuted,
              border: `1px solid ${pageColorTokens.borderSubtle}`,
            }}
          >
            <strong style={{ color: pageColorTokens.textPrimary }}>
              {t("dailyOps.taskPromptReason")}：
            </strong>{" "}
            {task.triggerReason}
          </div>
          <div
            style={{
              fontSize: 12,
              lineHeight: 1.6,
              color: pageColorTokens.textSecondary,
              padding: "0.85rem 0.95rem",
              borderRadius: pageColorTokens.radiusControl,
              background: pageColorTokens.surfaceMuted,
              border: `1px solid ${pageColorTokens.borderSubtle}`,
            }}
          >
            <strong style={{ color: pageColorTokens.textPrimary }}>
              {t("dailyOps.taskPromptActions")}：
            </strong>{" "}
            {task.suggestedActions[0] ?? t("dailyOps.taskNoSuggestedActions")}
          </div>
        </div>
      }
      actions={actions}
    />
  );
}
