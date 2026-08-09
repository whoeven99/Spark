import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { getTaskStatusTone } from "./taskStatusTone";
import type { AITaskStatus } from "../../../lib/aiTaskTypes";

type Props = {
  status: AITaskStatus;
  size?: "small" | "medium";
};

const STATUS_LABEL_KEY: Record<AITaskStatus, string> = {
  running: "aiTask.statusRunning",
  succeeded: "aiTask.statusSucceeded",
  failed: "aiTask.statusFailed",
  cancelled: "aiTask.statusCancelled",
  pending_review: "aiTask.statusPendingReview",
  applied: "aiTask.statusApplied",
  scored: "aiTask.statusScored",
};

export function TaskStatusBadge({ status, size = "small" }: Props) {
  const { t } = useTranslation();
  const tone = getTaskStatusTone(status);
  const fontSize = size === "small" ? 11 : 12;

  const style: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize,
    fontWeight: 600,
    padding: size === "small" ? "3px 8px" : "4px 10px",
    borderRadius: 999,
    background: tone.surface,
    border: `1px solid ${tone.border}`,
    color: tone.accent,
    whiteSpace: "nowrap",
  };

  return (
    <span style={style}>
      {status === "running" && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: tone.accent,
            display: "inline-block",
            animation: "pulse 1.4s ease-in-out infinite",
          }}
        />
      )}
      {t(STATUS_LABEL_KEY[status])}
    </span>
  );
}
