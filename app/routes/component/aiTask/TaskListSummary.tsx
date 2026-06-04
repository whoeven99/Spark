import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  const defs = mode === "product_improve" ? PRODUCT_IMPROVE_STATS : IMAGE_STATS;
  const total = tasks.length;

  const stats = defs.map((def) => ({
    label:
      def.status === "running"
        ? t("aiTaskSummary.statusRunning")
        : def.status === "succeeded"
          ? t("aiTaskSummary.statusSucceeded")
          : def.status === "pending_review"
            ? t("aiTaskSummary.statusPendingReview")
            : def.status === "applied"
              ? t("aiTaskSummary.statusApplied")
              : def.status === "scored"
                ? t("aiTaskSummary.statusScored")
                : t("aiTaskSummary.statusFailed"),
    count: tasks.filter((t) => t.status === def.status).length,
    activeColor: def.activeColor,
  }));

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
        padding: "0.75rem 0.9rem",
        border: `1px solid ${pageColorTokens.borderSubtle}`,
        borderRadius: pageColorTokens.radiusCard,
        background: "#fff",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: pageColorTokens.textPrimary,
            whiteSpace: "nowrap",
          }}
        >
          {t("aiTaskSummary.title")}
        </span>
        {stats.map((stat) => (
          <span
            key={stat.label}
            style={{
              display: "flex",
              gap: 6,
              alignItems: "center",
              padding: "0.4rem 0.7rem",
              border: `1px solid ${pageColorTokens.borderSubtle}`,
              borderRadius: 999,
              background: stat.count > 0 ? pageColorTokens.surfaceSubtle : "#fff",
              whiteSpace: "nowrap",
            }}
          >
            {stat.count > 0 ? (
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: stat.activeColor,
                }}
              />
            ) : null}
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: pageColorTokens.textSecondary,
              }}
            >
              {stat.label} {stat.count}
            </span>
          </span>
        ))}
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
        {t("aiTaskSummary.total", { count: total })}
      </span>
    </div>
  );
}
