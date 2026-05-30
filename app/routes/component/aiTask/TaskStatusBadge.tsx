import type { CSSProperties } from "react";
import { pageColorTokens } from "../../page/pageUiStyles";
import type { AITaskStatus } from "../../../lib/aiTaskTypes";

type Props = {
  status: AITaskStatus;
  size?: "small" | "medium";
};

const STATUS_CONFIG: Record<
  AITaskStatus,
  { label: string; color: string; background: string; border: string; pulse?: boolean }
> = {
  running: {
    label: "运行中",
    color: pageColorTokens.brandBlue,
    background: pageColorTokens.brandBlueLight,
    border: "rgba(64, 112, 244, 0.18)",
    pulse: true,
  },
  succeeded: {
    label: "已完成",
    color: pageColorTokens.brandGreenDark,
    background: pageColorTokens.brandGreenLight,
    border: "rgba(0, 166, 124, 0.18)",
  },
  failed: {
    label: "失败",
    color: pageColorTokens.criticalText,
    background: pageColorTokens.criticalBg,
    border: "rgba(220, 38, 38, 0.15)",
  },
  cancelled: {
    label: "已取消",
    color: pageColorTokens.textSecondary,
    background: pageColorTokens.surfaceMuted,
    border: pageColorTokens.borderSubtle,
  },
  pending_review: {
    label: "待审查",
    color: "#d97706",
    background: "#fffbeb",
    border: "rgba(217, 119, 6, 0.18)",
  },
  applied: {
    label: "已应用",
    color: pageColorTokens.brandGreenDark,
    background: pageColorTokens.brandGreenLight,
    border: "rgba(0, 166, 124, 0.18)",
  },
  scored: {
    label: "评分完成",
    color: "#7c3aed",
    background: "#f5f3ff",
    border: "rgba(124, 58, 237, 0.16)",
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
    padding: size === "small" ? "3px 8px" : "4px 10px",
    borderRadius: 999,
    background: cfg.background,
    border: `1px solid ${cfg.border}`,
    color: cfg.color,
    whiteSpace: "nowrap",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.45)",
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
            boxShadow: `0 0 0 4px ${cfg.color}18`,
            animation: "pulse 1.4s ease-in-out infinite",
          }}
        />
      )}
      {cfg.label}
    </span>
  );
}
