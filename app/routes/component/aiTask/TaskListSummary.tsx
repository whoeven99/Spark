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
        marginBottom: 14,
        background: "linear-gradient(160deg, #ffffff 0%, #fafbfd 100%)",
        boxShadow: pageColorTokens.shadowCard,
        padding: "14px 16px 12px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 14,
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: pageColorTokens.textPrimary }}>
            任务列表
          </div>
          <div style={{ fontSize: 12, color: pageColorTokens.textSecondary, marginTop: 4 }}>
            跟踪当前工具的执行中、待审查和已完成状态。
          </div>
        </div>
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: pageColorTokens.textSecondary,
            padding: "0.35rem 0.7rem",
            borderRadius: 999,
            background: pageColorTokens.surfaceMuted,
            border: `1px solid ${pageColorTokens.borderSubtle}`,
            whiteSpace: "nowrap",
          }}
        >
          共 {total} 个任务
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))`,
          gap: 10,
        }}
      >
        {stats.map((stat, i) => (
          <div
            key={stat.label}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              padding: "12px 12px 10px",
              border: `1px solid ${pageColorTokens.borderSubtle}`,
              borderRadius: pageColorTokens.radiusControl,
              background: stat.count > 0 ? pageColorTokens.surfaceSubtle : pageColorTokens.surface,
              boxShadow: stat.count > 0 ? "inset 0 1px 0 rgba(255,255,255,0.55)" : "none",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 6,
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
              {stat.count > 0 ? (
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: stat.activeColor,
                    boxShadow: `0 0 0 4px ${stat.activeColor}18`,
                  }}
                />
              ) : null}
            </div>
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: pageColorTokens.textSecondary,
              }}
            >
              {stat.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
