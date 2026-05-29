import { pageColorTokens } from "../../page/pageUiStyles";
import type { AITaskItem, AITaskStatus } from "../../../lib/aiTaskTypes";

type StatDef = {
  status: AITaskStatus;
  label: string;
  activeColor: string;
};

const IMAGE_STATS: StatDef[] = [
  { status: "running", label: "执行中", activeColor: pageColorTokens.brandBlue },
  { status: "succeeded", label: "已完成", activeColor: pageColorTokens.brandGreenDark },
  { status: "failed", label: "失败", activeColor: pageColorTokens.critical },
];

const PRODUCT_IMPROVE_STATS: StatDef[] = [
  { status: "running", label: "执行中", activeColor: pageColorTokens.brandBlue },
  { status: "pending_review", label: "待审查", activeColor: "#d97706" },
  { status: "applied", label: "已应用", activeColor: pageColorTokens.brandGreenDark },
  { status: "scored", label: "评分完成", activeColor: "#7c3aed" },
  { status: "failed", label: "失败", activeColor: pageColorTokens.critical },
];

type Props = {
  tasks: AITaskItem[];
  mode?: "image" | "product_improve";
};

export function TaskListSummary({ tasks, mode = "image" }: Props) {
  const defs = mode === "product_improve" ? PRODUCT_IMPROVE_STATS : IMAGE_STATS;
  const total = tasks.length;

  const stats = defs.map((def) => ({
    label: def.label,
    count: tasks.filter((t) => t.status === def.status).length,
    activeColor: def.activeColor,
  }));

  return (
    <div
      style={{
        border: `1px solid ${pageColorTokens.border}`,
        borderRadius: pageColorTokens.radiusCard,
        overflow: "hidden",
        marginBottom: 14,
        background: pageColorTokens.surface,
        boxShadow: pageColorTokens.shadowCard,
      }}
    >
      {/* Header */}
      <div
        style={{
          background: `linear-gradient(90deg, ${pageColorTokens.brandGreenDeep} 0%, ${pageColorTokens.brandGreen} 100%)`,
          padding: "10px 16px",
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: "#ffffff" }}>
          任务列表
        </span>
      </div>

      {/* Stats grid */}
      <div style={{ display: "flex", padding: "14px 16px 10px", gap: 0 }}>
        {stats.map((stat, i) => (
          <div
            key={stat.label}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              borderLeft: i > 0 ? `1px solid ${pageColorTokens.border}` : undefined,
              padding: "0 4px",
            }}
          >
            <span
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: stat.count > 0 ? stat.activeColor : pageColorTokens.textFootnote,
                lineHeight: 1,
              }}
            >
              {stat.count}
            </span>
            <span style={{ fontSize: 12, color: pageColorTokens.textSecondary, textAlign: "center" }}>
              {stat.label}
            </span>
          </div>
        ))}
      </div>

      {/* Total */}
      <div
        style={{
          padding: "6px 16px 12px",
          textAlign: "center",
          fontSize: 12,
          color: pageColorTokens.textSecondary,
          borderTop: `1px solid ${pageColorTokens.divider}`,
        }}
      >
        共 {total} 个任务
      </div>
    </div>
  );
}
