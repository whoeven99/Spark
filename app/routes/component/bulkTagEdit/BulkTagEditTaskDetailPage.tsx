/**
 * 批量打标审核详情 —— 验收与写回入口。
 *
 * 与其它 TaskDetailPage 同签名，因此同一份 UI 既能在任务页包成弹窗，
 * 也能直接挂进对话里的审核 DialogShell。
 *
 * 数据全部来自任务 result 里的 changeset，不再回源 Shopify；
 * CSV 也在浏览器端由同一份数据生成。
 * 「确认写回店铺」是本功能对商户暴露的唯一写入按钮。
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { pageColorTokens } from "../../page/pageUiStyles";
import { actionButtonStyle } from "../aiTask/AITaskCardShell";
import {
  buildBulkTagEditChangesetCsv,
  buildBulkTagEditRollbackCsv,
  type BulkTagEditRow,
  type BulkTagEditSummary,
} from "../../../lib/bulkTagEdit";
import type {
  AITaskItem,
  AITaskStatus,
  BulkTagEditApplyResponse,
  BulkTagEditTaskResult,
} from "../../../lib/aiTaskTypes";

/** 表格只渲染前 N 行，完整清单走 CSV —— 上千行 DOM 会明显拖慢弹窗。 */
const VISIBLE_ROWS = 100;

type Props = {
  task: AITaskItem;
  onBack: () => void;
  showBackButton?: boolean;
  onTaskUpdated?: (
    taskId: string,
    status: AITaskStatus,
    result?: Record<string, unknown>,
  ) => void;
  /** 写回进行中：外层弹窗据此禁用关闭，避免用户以为关掉就取消了 */
  onBusyChange?: (busy: boolean) => void;
};

export function readBulkTagEditResult(task: AITaskItem): BulkTagEditTaskResult | null {
  const raw = task.result;
  if (!raw || !Array.isArray(raw.rows)) return null;
  return raw as unknown as BulkTagEditTaskResult;
}

function downloadCsv(filename: string, content: string): void {
  // BOM 让 Excel 正确识别 UTF-8
  const blob = new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

const cellStyle = {
  padding: "7px 10px",
  borderBottom: `1px solid ${pageColorTokens.borderSubtle}`,
  fontSize: 12,
  color: pageColorTokens.textPrimary,
  verticalAlign: "top" as const,
  maxWidth: 240,
};

const headCellStyle = {
  ...cellStyle,
  position: "sticky" as const,
  top: 0,
  background: pageColorTokens.surfaceSubtle,
  fontWeight: 700,
  color: pageColorTokens.textSecondary,
  whiteSpace: "nowrap" as const,
  zIndex: 1,
};

const noticeStyle = {
  fontSize: 12,
  borderRadius: 8,
  padding: "8px 10px",
};

const tagChipStyle = {
  display: "inline-block",
  borderRadius: 999,
  padding: "1px 8px",
  margin: "1px 3px 1px 0",
  fontSize: 11,
  lineHeight: 1.6,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  background: pageColorTokens.surfaceSubtle,
  color: pageColorTokens.textSecondary,
};

function SummaryChips({ summary }: { summary: BulkTagEditSummary }) {
  const { t } = useTranslation();
  const chips = [
    { label: t("bulkTagEdit.summaryProducts"), value: summary.products },
    { label: t("bulkTagEdit.summaryAdded"), value: summary.added },
    { label: t("bulkTagEdit.summaryRemoved"), value: summary.removed },
    { label: t("bulkTagEdit.summarySkipped"), value: summary.skipped },
  ];
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {chips.map((chip) => (
        <span
          key={chip.label}
          style={{
            fontSize: 12,
            color: pageColorTokens.textSecondary,
            background: pageColorTokens.surfaceSubtle,
            border: `1px solid ${pageColorTokens.borderSubtle}`,
            borderRadius: 999,
            padding: "3px 10px",
          }}
        >
          {chip.label}
          <strong style={{ marginLeft: 6, color: pageColorTokens.textPrimary }}>{chip.value}</strong>
        </span>
      ))}
    </div>
  );
}

export function BulkTagEditTaskDetailPage({
  task,
  onBack,
  showBackButton = true,
  onTaskUpdated,
  onBusyChange,
}: Props) {
  const { t } = useTranslation();
  const [applying, setApplying] = useState(false);
  const [confirmingWrite, setConfirmingWrite] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const result = readBulkTagEditResult(task);
  const [applied, setApplied] = useState<{ succeeded: number; failed: number } | null>(
    result?.apply ? { succeeded: result.apply.succeeded, failed: result.apply.failed } : null,
  );

  const shortId = task.id.slice(0, 8).toUpperCase();
  const resultRows = result?.rows;
  const rows = useMemo(() => resultRows ?? [], [resultRows]);
  const changedRows = useMemo(() => rows.filter((row) => !row.skipped), [rows]);
  const hasRemoval = useMemo(
    () => changedRows.some((row) => row.removedTags.length > 0),
    [changedRows],
  );
  const visibleRows = rows.slice(0, VISIBLE_ROWS);

  const handleApply = async () => {
    setApplying(true);
    onBusyChange?.(true);
    setError(null);
    try {
      const response = await fetch("/api/bulk-tag-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: task.id, confirm: true }),
      });
      const json = (await response.json()) as BulkTagEditApplyResponse;
      if (!json.ok) {
        setError(json.error);
        return;
      }
      const outcome = { succeeded: json.succeeded, failed: json.failed };
      setApplied(outcome);
      setConfirmingWrite(false);
      onTaskUpdated?.(task.id, "applied", {
        ...(task.result ?? {}),
        apply: { at: new Date().toISOString(), ...outcome, errors: [] },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("bulkTagEdit.applyFailed"));
    } finally {
      setApplying(false);
      onBusyChange?.(false);
    }
  };

  if (!result) {
    return (
      <div style={{ fontSize: 13, color: pageColorTokens.textSecondary, padding: "24px 0" }}>
        {t("bulkTagEdit.noChangeset")}
      </div>
    );
  }

  // 只有仍待审核的任务能写回；已写回或已取消的任务是只读凭证
  const canApply = task.status === "pending_review" && applied == null && changedRows.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {showBackButton ? (
        <div>
          <button type="button" style={actionButtonStyle("subtle")} onClick={onBack}>
            {t("common.backToPrevious")}
          </button>
        </div>
      ) : null}

      <SummaryChips summary={result.summary} />

      {result.truncated ? (
        <div
          style={{
            ...noticeStyle,
            color: "#92400e",
            background: "#fffbeb",
            border: "1px solid #fde68a",
          }}
        >
          {t("bulkTagEdit.truncatedWarning")}
        </div>
      ) : null}

      {hasRemoval && !applied ? (
        <div
          style={{
            ...noticeStyle,
            color: "#92400e",
            background: "#fffbeb",
            border: "1px solid #fde68a",
          }}
        >
          {t("bulkTagEdit.removalWarning")}
        </div>
      ) : null}

      {applied ? (
        <div
          style={{
            ...noticeStyle,
            fontSize: 13,
            fontWeight: 700,
            color: applied.failed > 0 ? "#92400e" : pageColorTokens.brandGreenDeep,
            background: applied.failed > 0 ? "#fffbeb" : pageColorTokens.brandGreenLight,
            border: `1px solid ${applied.failed > 0 ? "#fde68a" : "rgba(0, 128, 96, 0.2)"}`,
          }}
        >
          {t("bulkTagEdit.appliedBanner", {
            succeeded: applied.succeeded,
            failed: applied.failed,
          })}
        </div>
      ) : null}

      {error ? (
        <div
          style={{
            ...noticeStyle,
            color: pageColorTokens.criticalText,
            background: "#fff5f5",
            border: "1px solid #fcd5d5",
          }}
        >
          {error}
        </div>
      ) : null}

      <div
        style={{
          maxHeight: 380,
          overflow: "auto",
          border: `1px solid ${pageColorTokens.borderSubtle}`,
          borderRadius: 8,
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={headCellStyle}>{t("bulkTagEdit.colProduct")}</th>
              <th style={headCellStyle}>{t("bulkTagEdit.colBeforeTags")}</th>
              <th style={headCellStyle}>{t("bulkTagEdit.colChange")}</th>
              <th style={headCellStyle}>{t("bulkTagEdit.colAction")}</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <BulkTagEditRowCells key={row.productId} row={row} />
            ))}
          </tbody>
        </table>
      </div>

      {rows.length > visibleRows.length ? (
        <div style={{ fontSize: 12, color: pageColorTokens.textFootnote }}>
          {t("bulkTagEdit.moreRowsHint", {
            shown: visibleRows.length,
            total: rows.length,
          })}
        </div>
      ) : null}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
          borderTop: `1px solid ${pageColorTokens.borderSubtle}`,
          paddingTop: 12,
        }}
      >
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            style={actionButtonStyle("secondary")}
            onClick={() =>
              downloadCsv(`bulk-tag-edit-${shortId}.csv`, buildBulkTagEditChangesetCsv(rows))
            }
          >
            {t("bulkTagEdit.downloadChangeset")}
          </button>
          <button
            type="button"
            style={actionButtonStyle("secondary", changedRows.length === 0)}
            disabled={changedRows.length === 0}
            onClick={() =>
              downloadCsv(
                `bulk-tag-edit-rollback-${shortId}.csv`,
                buildBulkTagEditRollbackCsv(rows),
              )
            }
          >
            {t("bulkTagEdit.downloadRollback")}
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {canApply && confirmingWrite ? (
            <>
              <span style={{ fontSize: 12, color: pageColorTokens.criticalText }}>
                {t("bulkTagEdit.applyConfirmHint", { count: changedRows.length })}
              </span>
              <button
                type="button"
                style={actionButtonStyle("subtle", applying)}
                disabled={applying}
                onClick={() => setConfirmingWrite(false)}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                style={actionButtonStyle("primary", applying)}
                disabled={applying}
                onClick={() => void handleApply()}
              >
                {applying ? t("bulkTagEdit.applying") : t("bulkTagEdit.applyConfirmButton")}
              </button>
            </>
          ) : canApply ? (
            <button
              type="button"
              style={actionButtonStyle("primary")}
              onClick={() => setConfirmingWrite(true)}
            >
              {t("bulkTagEdit.applyButton", { count: changedRows.length })}
            </button>
          ) : (
            <button type="button" style={actionButtonStyle("subtle")} onClick={onBack}>
              {t("common.close")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function BulkTagEditRowCells({ row }: { row: BulkTagEditRow }) {
  const { t } = useTranslation();
  const dash = "—";
  return (
    <tr style={{ opacity: row.skipped ? 0.6 : 1 }}>
      <td style={{ ...cellStyle, fontWeight: 600 }} title={row.productTitle}>
        {row.productTitle}
      </td>
      <td style={cellStyle}>
        {row.beforeTags.length > 0
          ? row.beforeTags.map((tag) => (
              <span key={tag} style={tagChipStyle}>
                {tag}
              </span>
            ))
          : dash}
      </td>
      <td style={cellStyle}>
        {row.skipped ? (
          <span style={{ color: pageColorTokens.textFootnote }}>{dash}</span>
        ) : (
          <>
            {row.addedTags.map((tag) => (
              <span
                key={`add-${tag}`}
                style={{
                  ...tagChipStyle,
                  background: pageColorTokens.brandGreenLight,
                  borderColor: "rgba(0, 128, 96, 0.2)",
                  color: pageColorTokens.brandGreenDeep,
                  fontWeight: 600,
                }}
              >
                +{tag}
              </span>
            ))}
            {row.removedTags.map((tag) => (
              <span
                key={`remove-${tag}`}
                style={{
                  ...tagChipStyle,
                  background: "#fff5f5",
                  borderColor: "#fcd5d5",
                  color: pageColorTokens.criticalText,
                  textDecoration: "line-through",
                }}
              >
                −{tag}
              </span>
            ))}
          </>
        )}
      </td>
      <td style={{ ...cellStyle, whiteSpace: "nowrap" }}>
        {row.skipped ? (
          <span style={{ color: pageColorTokens.textFootnote }}>
            {t(`bulkTagEdit.skipReason.${row.skipReason ?? "no_change"}`)}
          </span>
        ) : (
          <span style={{ color: pageColorTokens.brandGreenDeep, fontWeight: 700 }}>
            {t("bulkTagEdit.actionChange")}
          </span>
        )}
      </td>
    </tr>
  );
}
