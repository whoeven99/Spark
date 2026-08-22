import { useMemo } from "react";
import { AITaskCardShell } from "../aiTask/AITaskCardShell";
import { pageColorTokens } from "../../page/pageUiStyles";
import type { ScheduledAutomationTaskView } from "../../../lib/unifiedTaskTypes";

type Props = {
  task: ScheduledAutomationTaskView;
};

function buildStatusBadge(enabled: boolean) {
  const tone = enabled
    ? {
        background: "#ecfdf5",
        border: "#a7f3d0",
        color: "#047857",
        label: "已启用",
      }
    : {
        background: "#f8fafc",
        border: "#cbd5e1",
        color: "#475569",
        label: "未启用",
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
      {tone.label}
    </span>
  );
}

function chipStyle(kind: "meta" | "output") {
  if (kind === "output") {
    return {
      display: "inline-flex",
      alignItems: "center",
      padding: "0.28rem 0.62rem",
      borderRadius: 999,
      background: "#ffffff",
      border: `1px solid ${pageColorTokens.borderSubtle}`,
      color: pageColorTokens.textSecondary,
      fontSize: 12,
      fontWeight: 600,
    } as const;
  }

  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "0.28rem 0.62rem",
    borderRadius: 999,
    background: pageColorTokens.surfaceMuted,
    border: `1px solid ${pageColorTokens.borderSubtle}`,
    color: pageColorTokens.textSecondary,
    fontSize: 12,
    fontWeight: 600,
  } as const;
}

export function AutomationTaskCard({ task }: Props) {
  const metaLine = useMemo(
    () => [task.schedule, task.ownerRoles.join(" / ")].filter(Boolean).join(" · "),
    [task.ownerRoles, task.schedule],
  );

  const bodyContent = (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: pageColorTokens.textFootnote }}>
          默认提问
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <span style={chipStyle("meta")}>{task.defaultQuestion}</span>
        </div>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: pageColorTokens.textFootnote }}>
          输出内容
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {task.outputs.map((item) => (
            <span key={item} style={chipStyle("output")}>
              {item}
            </span>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <AITaskCardShell
      task={{
        id: task.id,
        createdAt: task.createdAt,
        completedAt: null,
      }}
      locationSearch=""
      status="pending_review"
      title={task.title}
      metaLine={metaLine}
      statusBadge={buildStatusBadge(task.enabled)}
      primaryCopy={task.summary}
      primaryCopyColor={pageColorTokens.textSecondary}
      secondaryCopy="已先写入任务列表；执行与配置链路待后续接入。"
      progressPercent={task.enabled ? 100 : 0}
      progressBackground={
        task.enabled
          ? "linear-gradient(90deg, #10b981, #34d399)"
          : "linear-gradient(90deg, #cbd5e1, #e2e8f0)"
      }
      bodyContent={bodyContent}
      actions={[
        { label: "编辑配置", tone: "secondary", disabled: true },
        { label: "立即运行", tone: "primary", disabled: true },
      ]}
    />
  );
}
