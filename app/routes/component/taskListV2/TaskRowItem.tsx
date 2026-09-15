import { Button } from "antd";
import { useTranslation } from "react-i18next";
import { pageColorTokens } from "../../page/pageUiStyles";
import { getTaskStatusTone } from "../aiTask/taskStatusTone";
import { TaskStatusBadge } from "../aiTask/TaskStatusBadge";
import { formatTaskRowTime, type TaskRowModel } from "./taskRowModel";

function NeutralStatusPill({ text }: { text: string }) {
  return (
    <span
      className="inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{
        background: pageColorTokens.surfaceMuted,
        border: `1px solid ${pageColorTokens.borderSubtle}`,
        color: pageColorTokens.textSecondary,
      }}
    >
      {text}
    </span>
  );
}

function ProgressTrack({
  percent,
  accent,
}: {
  percent: number;
  accent: string;
}) {
  return (
    <div
      className="mt-2 h-[3px] overflow-hidden rounded-full"
      style={{ background: pageColorTokens.surfaceMuted }}
    >
      <div
        style={{
          width: `${Math.max(0, Math.min(100, percent))}%`,
          height: "100%",
          background: accent,
        }}
      />
    </div>
  );
}

/** 两行任务：状态/对象/时间 + 结论句/操作，细进度条贴在结论下。 */
export function TaskRowItem({
  row,
  hydrated,
  showTopBorder,
  selected,
  onSelect,
  onChat,
}: {
  row: TaskRowModel;
  hydrated: boolean;
  showTopBorder: boolean;
  selected: boolean;
  onSelect: (taskId: string) => void;
  onChat: (prompt: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const timeText = formatTaskRowTime(row.timestamp, t, i18n.language, hydrated);
  const action = row.action;
  const tone = row.aiStatus ? getTaskStatusTone(row.aiStatus) : null;
  const summaryColor =
    row.aiStatus === "failed" ? pageColorTokens.criticalText : pageColorTokens.textSecondary;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(row.taskId)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(row.taskId);
        }
      }}
      className="w-full text-left"
      style={{
        padding: "14px 12px 12px",
        borderTop: showTopBorder ? `1px solid ${pageColorTokens.divider}` : undefined,
        borderLeft: selected
          ? `3px solid ${pageColorTokens.brandBlue}`
          : "3px solid transparent",
        background: selected ? pageColorTokens.surfaceSubtle : "transparent",
        cursor: "pointer",
      }}
    >
      <div className="mb-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
        {row.aiStatus ? (
          <TaskStatusBadge status={row.aiStatus} />
        ) : row.statusText ? (
          <NeutralStatusPill text={row.statusText} />
        ) : null}
        <span
          className="shrink-0 text-xs font-semibold"
          style={{ color: pageColorTokens.textFootnote }}
        >
          {row.typeLabel}
        </span>
        <span
          className="min-w-0 truncate text-sm font-semibold"
          style={{ color: pageColorTokens.textPrimary }}
          title={row.title}
        >
          {row.title}
        </span>
        {row.meta.length > 0 ? (
          <span className="shrink-0 text-xs" style={{ color: pageColorTokens.textFootnote }}>
            · {row.meta.join(" · ")}
          </span>
        ) : null}
        <span className="ml-auto shrink-0 text-xs" style={{ color: pageColorTokens.textSecondary }}>
          {timeText}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm leading-5" style={{ color: summaryColor }}>
            {row.summary}
          </div>
          <ProgressTrack
            percent={row.progressPercent}
            accent={tone?.accent ?? pageColorTokens.neutralStatus}
          />
        </div>
        {action.type === "select" ? (
          <Button
            size="small"
            type={action.primary ? "primary" : "default"}
            onClick={(event) => {
              event.stopPropagation();
              onSelect(row.taskId);
            }}
          >
            {action.label}
          </Button>
        ) : action.type === "chat" ? (
          <Button
            size="small"
            onClick={(event) => {
              event.stopPropagation();
              onChat(action.prompt);
            }}
          >
            {action.label}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
