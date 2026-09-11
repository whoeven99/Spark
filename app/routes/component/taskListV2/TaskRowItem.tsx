import { Button } from "antd";
import { useTranslation } from "react-i18next";
import { pageColorTokens } from "../../page/pageUiStyles";
import { TaskStatusBadge } from "../aiTask/TaskStatusBadge";
import { formatTaskRowTime, type TaskRowModel } from "./taskRowModel";

/** 非 AI 任务的中性状态胶囊；AI 任务走 TaskStatusBadge 的语义色。 */
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

/** 压缩任务行：一行讲清类型、对象、状态、时间和下一步。 */
export function TaskRowItem({
  row,
  hydrated,
  showTopBorder,
  onDetail,
  onChat,
}: {
  row: TaskRowModel;
  hydrated: boolean;
  showTopBorder: boolean;
  onDetail: (taskId: string) => void;
  onChat: (prompt: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const timeText = formatTaskRowTime(row.timestamp, t, i18n.language, hydrated);
  // 先取成 const，闭包里才能保住 discriminated union 的收窄。
  const action = row.action;

  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5"
      style={
        showTopBorder
          ? { borderTop: `1px solid ${pageColorTokens.divider}` }
          : undefined
      }
    >
      <div className="w-[72px] shrink-0">
        {row.aiStatus ? (
          <TaskStatusBadge status={row.aiStatus} />
        ) : row.statusText ? (
          <NeutralStatusPill text={row.statusText} />
        ) : null}
      </div>

      <span
        className="shrink-0 whitespace-nowrap text-xs font-semibold"
        style={{ color: pageColorTokens.textFootnote }}
      >
        {row.typeLabel}
      </span>

      <span
        className="min-w-0 flex-1 truncate text-sm font-semibold"
        style={{ color: pageColorTokens.textPrimary }}
        title={row.title}
      >
        {row.title}
      </span>

      {row.meta.length > 0 ? (
        <span
          className="shrink-0 whitespace-nowrap text-xs"
          style={{ color: pageColorTokens.textFootnote }}
        >
          {row.meta.join(" · ")}
        </span>
      ) : null}

      <span
        className="w-[84px] shrink-0 whitespace-nowrap text-right text-xs"
        style={{ color: pageColorTokens.textSecondary }}
      >
        {timeText}
      </span>

      <div className="w-[92px] shrink-0 text-right">
        {action.type === "detail" ? (
          <Button
            size="small"
            type={action.primary ? "primary" : "default"}
            onClick={() => onDetail(row.taskId)}
          >
            {action.label}
          </Button>
        ) : action.type === "chat" ? (
          <Button size="small" onClick={() => onChat(action.prompt)}>
            {action.label}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
