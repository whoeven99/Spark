import type { CSSProperties } from "react";
import { pageColorTokens } from "../../page/pageUiStyles";
import type { AITaskStatus } from "../../../lib/aiTaskTypes";

type Props = {
  status: AITaskStatus;
  size?: "small" | "medium";
};

const STATUS_CONFIG: Record<
  AITaskStatus,
  { label: string; color: string; background: string; pulse?: boolean }
> = {
  running: {
    label: "运行中",
    color: pageColorTokens.brandBlue,
    background: pageColorTokens.brandBlueLight,
    pulse: true,
  },
  succeeded: {
    label: "已完成",
    color: pageColorTokens.brandGreenDark,
    background: pageColorTokens.brandGreenLight,
  },
  failed: {
    label: "失败",
    color: pageColorTokens.criticalText,
    background: pageColorTokens.criticalBg,
  },
  cancelled: {
    label: "已取消",
    color: pageColorTokens.textSecondary,
    background: pageColorTokens.surfaceMuted,
  },
  pending_review: {
    label: "待审查",
    color: "#d97706",
    background: "#fffbeb",
  },
  applied: {
    label: "已应用",
    color: pageColorTokens.brandGreenDark,
    background: pageColorTokens.brandGreenLight,
  },
  scored: {
    label: "评分完成",
    color: "#7c3aed",
    background: "#f5f3ff",
  },
};

export function TaskStatusBadge({ status, size = "small" }: Props) {
  const cfg = STATUS_CONFIG[status];
  const fontSize = size === "small" ? 11 : 12;

  const style: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize,
    fontWeight: 600,
    padding: size === "small" ? "2px 7px" : "3px 9px",
    borderRadius: 20,
    background: cfg.background,
    color: cfg.color,
    whiteSpace: "nowrap",
  };

  return (
    <span style={style}>
      {cfg.pulse && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: cfg.color,
            display: "inline-block",
            animation: "pulse 1.4s ease-in-out infinite",
          }}
        />
      )}
      {cfg.label}
    </span>
  );
}
