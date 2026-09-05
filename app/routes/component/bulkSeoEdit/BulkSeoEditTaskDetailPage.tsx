/**
 * 批量 SEO 改写审核详情 —— 验收与写回入口。
 *
 * 与其它 TaskDetailPage 同签名，因此同一份 UI 既能在任务页包成弹窗，
 * 也能直接挂进对话里的审核 DialogShell。
 *
 * SEO 是长文本，原值/新值并排放会把列压得没法读，所以每个字段用上下两行对照，
 * 并标出字符数，让用户一眼看出会不会被搜索结果截断。
 * 「确认写回店铺」是本功能对商户暴露的唯一写入按钮。
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { pageColorTokens } from "../../page/pageUiStyles";
import { actionButtonStyle } from "../aiTask/AITaskCardShell";
import {
  BULK_SEO_DESCRIPTION_MAX_LENGTH,
  BULK_SEO_TITLE_MAX_LENGTH,
  buildBulkSeoEditChangesetCsv,
  buildBulkSeoEditRollbackCsv,
  type BulkSeoEditRow,
  type BulkSeoEditSummary,
} from "../../../lib/bulkSeoEdit";
import type {
  AITaskItem,
  AITaskStatus,
  BulkSeoEditApplyResponse,
  BulkSeoEditTaskResult,
} from "../../../lib/aiTaskTypes";

/** 表格只渲染前 N 行，完整清单走 CSV —— SEO 行更高，DOM 压力比标签大。 */
const VISIBLE_ROWS = 60;

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

export function readBulkSeoEditResult(task: AITaskItem): BulkSeoEditTaskResult | null {
  const raw = task.result;
  if (!raw || !Array.isArray(raw.rows)) return null;
  return raw as unknown as BulkSeoEditTaskResult;
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
  padding: "8px 10px",
  borderBottom: `1px solid ${pageColorTokens.borderSubtle}`,
  fontSize: 12,
  color: pageColorTokens.textPrimary,
  verticalAlign: "top" as const,
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

function SummaryChips({ summary }: { summary: BulkSeoEditSummary }) {
  const { t } = useTranslation();
  const chips = [
    { label: t("bulkSeoEdit.summaryProducts"), value: summary.products },
    { label: t("bulkSeoEdit.summaryTitleChanges"), value: summary.titleChanges },
    { label: t("bulkSeoEdit.summaryDescriptionChanges"), value: summary.descriptionChanges },
    { label: t("bulkSeoEdit.summarySkipped"), value: summary.skipped },
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

export function BulkSeoEditTaskDetailPage({
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

  const result = readBulkSeoEditResult(task);
  const [applied, setApplied] = useState<{ succeeded: number; failed: number } | null>(
    result?.apply ? { succeeded: result.apply.succeeded, failed: result.apply.failed } : null,
  );

  const shortId = task.id.slice(0, 8).toUpperCase();
  const resultRows = result?.rows;
  const rows = useMemo(() => resultRows ?? [], [resultRows]);
  const changedRows = useMemo(() => rows.filter((row) => !row.skipped), [rows]);
  const hasTruncation = useMemo(
    () => changedRows.some((row) => (row.notes ?? []).some((n) => n.endsWith("_truncated"))),
    [changedRows],
  );
  const visibleRows = rows.slice(0, VISIBLE_ROWS);

  const handleApply = async () => {
    setApplying(true);
    onBusyChange?.(true);
    setError(null);
    try {
      const response = await fetch("/api/bulk-seo-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: task.id, confirm: true }),
      });
      const json = (await response.json()) as BulkSeoEditApplyResponse;
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
      setError(e instanceof Error ? e.message : t("bulkSeoEdit.applyFailed"));
    } finally {
      setApplying(false);
      onBusyChange?.(false);
    }
  };

  if (!result) {
    return (
      <div style={{ fontSize: 13, color: pageColorTokens.textSecondary, padding: "24px 0" }}>
        {t("bulkSeoEdit.noChangeset")}
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
          {t("bulkSeoEdit.truncatedWarning")}
        </div>
      ) : null}

      {hasTruncation && !applied ? (
        <div
          style={{
            ...noticeStyle,
            color: "#92400e",
            background: "#fffbeb",
            border: "1px solid #fde68a",
          }}
        >
          {t("bulkSeoEdit.lengthWarning", {
            titleMax: BULK_SEO_TITLE_MAX_LENGTH,
            descriptionMax: BULK_SEO_DESCRIPTION_MAX_LENGTH,
          })}
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
          {t("bulkSeoEdit.appliedBanner", {
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
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <thead>
            <tr>
              <th style={{ ...headCellStyle, width: "22%" }}>{t("bulkSeoEdit.colProduct")}</th>
              <th style={{ ...headCellStyle, width: "30%" }}>{t("bulkSeoEdit.colSeoTitle")}</th>
              <th style={{ ...headCellStyle, width: "36%" }}>
                {t("bulkSeoEdit.colSeoDescription")}
              </th>
              <th style={{ ...headCellStyle, width: "12%" }}>{t("bulkSeoEdit.colAction")}</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <BulkSeoEditRowCells key={row.productId} row={row} />
            ))}
          </tbody>
        </table>
      </div>

      {rows.length > visibleRows.length ? (
        <div style={{ fontSize: 12, color: pageColorTokens.textFootnote }}>
          {t("bulkSeoEdit.moreRowsHint", {
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
              downloadCsv(`bulk-seo-edit-${shortId}.csv`, buildBulkSeoEditChangesetCsv(rows))
            }
          >
            {t("bulkSeoEdit.downloadChangeset")}
          </button>
          <button
            type="button"
            style={actionButtonStyle("secondary", changedRows.length === 0)}
            disabled={changedRows.length === 0}
            onClick={() =>
              downloadCsv(
                `bulk-seo-edit-rollback-${shortId}.csv`,
                buildBulkSeoEditRollbackCsv(rows),
              )
            }
          >
            {t("bulkSeoEdit.downloadRollback")}
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {canApply && confirmingWrite ? (
            <>
              <span style={{ fontSize: 12, color: pageColorTokens.criticalText }}>
                {t("bulkSeoEdit.applyConfirmHint", { count: changedRows.length })}
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
                {applying ? t("bulkSeoEdit.applying") : t("bulkSeoEdit.applyConfirmButton")}
              </button>
            </>
          ) : canApply ? (
            <button
              type="button"
              style={actionButtonStyle("primary")}
              onClick={() => setConfirmingWrite(true)}
            >
              {t("bulkSeoEdit.applyButton", { count: changedRows.length })}
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

/** 单个 SEO 字段的「原值 → 新值」对照。未改动时只显示原值。 */
function SeoFieldCell({
  before,
  after,
  changed,
  maxLength,
}: {
  before: string | null;
  after: string | null;
  changed: boolean;
  maxLength: number;
}) {
  const { t } = useTranslation();
  const emptyLabel = t("bulkSeoEdit.emptyValue");

  if (!changed) {
    return (
      <span style={{ color: pageColorTokens.textFootnote, wordBreak: "break-word" }}>
        {before || emptyLabel}
      </span>
    );
  }

  const afterLength = (after ?? "").length;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span
        style={{
          color: pageColorTokens.textFootnote,
          textDecoration: before ? "line-through" : undefined,
          wordBreak: "break-word",
        }}
      >
        {before || emptyLabel}
      </span>
      <span style={{ color: pageColorTokens.textPrimary, fontWeight: 600, wordBreak: "break-word" }}>
        {after}
      </span>
      <span
        style={{
          fontSize: 11,
          color:
            afterLength > maxLength ? pageColorTokens.criticalText : pageColorTokens.textFootnote,
        }}
      >
        {t("bulkSeoEdit.charCount", { count: afterLength, max: maxLength })}
      </span>
    </div>
  );
}

function BulkSeoEditRowCells({ row }: { row: BulkSeoEditRow }) {
  const { t } = useTranslation();
  return (
    <tr style={{ opacity: row.skipped ? 0.6 : 1 }}>
      <td style={{ ...cellStyle, fontWeight: 600, wordBreak: "break-word" }}>
        {row.productTitle}
      </td>
      <td style={cellStyle}>
        <SeoFieldCell
          before={row.beforeSeoTitle}
          after={row.afterSeoTitle}
          changed={row.titleChanged}
          maxLength={BULK_SEO_TITLE_MAX_LENGTH}
        />
      </td>
      <td style={cellStyle}>
        <SeoFieldCell
          before={row.beforeSeoDescription}
          after={row.afterSeoDescription}
          changed={row.descriptionChanged}
          maxLength={BULK_SEO_DESCRIPTION_MAX_LENGTH}
        />
      </td>
      <td style={cellStyle}>
        {row.skipped ? (
          <span style={{ color: pageColorTokens.textFootnote }}>
            {t(`bulkSeoEdit.skipReason.${row.skipReason ?? "no_change"}`)}
          </span>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ color: pageColorTokens.brandGreenDeep, fontWeight: 700 }}>
              {t("bulkSeoEdit.actionChange")}
            </span>
            {(row.notes ?? []).map((note) => (
              <span key={note} style={{ fontSize: 11, color: "#92400e" }}>
                {t(`bulkSeoEdit.note.${note}`)}
              </span>
            ))}
          </div>
        )}
      </td>
    </tr>
  );
}
