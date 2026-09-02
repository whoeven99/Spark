/**
 * 批量 Metafield 改写审核详情 —— 验收与写回入口。
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
  buildBulkMetafieldEditChangesetCsv,
  buildBulkMetafieldEditRollbackCsv,
  formatMetafieldFieldKey,
  type BulkMetafieldEditRow,
  type BulkMetafieldEditSummary,
} from "../../../lib/bulkMetafieldEdit";
import type {
  AITaskItem,
  AITaskStatus,
  BulkMetafieldEditApplyResponse,
  BulkMetafieldEditTaskResult,
} from "../../../lib/aiTaskTypes";

/** 表格只渲染前 N 行，完整清单走 CSV —— 上千行 DOM 会明显拖慢弹窗。 */
const VISIBLE_ROWS = 100;

/** 单元格里最多展示多少字符，超出用省略号；完整值在 CSV 里。 */
const VALUE_PREVIEW_LENGTH = 120;

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

export function readBulkMetafieldEditResult(
  task: AITaskItem,
): BulkMetafieldEditTaskResult | null {
  const raw = task.result;
  if (!raw || !Array.isArray(raw.rows)) return null;
  return raw as unknown as BulkMetafieldEditTaskResult;
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

function preview(value: string): string {
  return value.length > VALUE_PREVIEW_LENGTH
    ? `${value.slice(0, VALUE_PREVIEW_LENGTH)}…`
    : value;
}

const cellStyle = {
  padding: "7px 10px",
  borderBottom: `1px solid ${pageColorTokens.borderSubtle}`,
  fontSize: 12,
  color: pageColorTokens.textPrimary,
  verticalAlign: "top" as const,
  maxWidth: 260,
  wordBreak: "break-word" as const,
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

const warningNoticeStyle = {
  ...noticeStyle,
  color: "#92400e",
  background: "#fffbeb",
  border: "1px solid #fde68a",
};

function SummaryChips({
  summary,
  isClear,
}: {
  summary: BulkMetafieldEditSummary;
  isClear: boolean;
}) {
  const { t } = useTranslation();
  const chips = [
    { label: t("bulkMetafieldEdit.summaryProducts"), value: summary.products },
    {
      label: isClear
        ? t("bulkMetafieldEdit.summaryCleared")
        : t("bulkMetafieldEdit.summarySet"),
      value: summary.changed,
    },
    { label: t("bulkMetafieldEdit.summarySkipped"), value: summary.skipped },
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
          <strong style={{ marginLeft: 6, color: pageColorTokens.textPrimary }}>
            {chip.value}
          </strong>
        </span>
      ))}
    </div>
  );
}

export function BulkMetafieldEditTaskDetailPage({
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

  const result = readBulkMetafieldEditResult(task);
  const [applied, setApplied] = useState<{ succeeded: number; failed: number } | null>(
    result?.apply
      ? { succeeded: result.apply.succeeded, failed: result.apply.failed }
      : null,
  );

  const shortId = task.id.slice(0, 8).toUpperCase();
  const resultRows = result?.rows;
  const rows = useMemo(() => resultRows ?? [], [resultRows]);
  const changedRows = useMemo(() => rows.filter((row) => !row.skipped), [rows]);
  const visibleRows = rows.slice(0, VISIBLE_ROWS);
  const isClear = result?.action === "clear";
  const field = useMemo(
    () => ({
      namespace: result?.namespace ?? "",
      key: result?.key ?? "",
      type: result?.fieldType ?? "",
    }),
    [result?.namespace, result?.key, result?.fieldType],
  );

  const handleApply = async () => {
    setApplying(true);
    onBusyChange?.(true);
    setError(null);
    try {
      const response = await fetch("/api/bulk-metafield-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: task.id, confirm: true }),
      });
      const json = (await response.json()) as BulkMetafieldEditApplyResponse;
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
      setError(e instanceof Error ? e.message : t("bulkMetafieldEdit.applyFailed"));
    } finally {
      setApplying(false);
      onBusyChange?.(false);
    }
  };

  if (!result) {
    return (
      <div style={{ fontSize: 13, color: pageColorTokens.textSecondary, padding: "24px 0" }}>
        {t("bulkMetafieldEdit.noChangeset")}
      </div>
    );
  }

  // 只有仍待审核的任务能写回；已写回或已取消的任务是只读凭证
  const canApply = task.status === "pending_review" && applied == null && changedRows.length > 0;
  const fieldKey = formatMetafieldFieldKey(field.namespace, field.key);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {showBackButton ? (
        <div>
          <button type="button" style={actionButtonStyle("subtle")} onClick={onBack}>
            {t("common.backToPrevious")}
          </button>
        </div>
      ) : null}

      <div style={{ fontSize: 13, color: pageColorTokens.textPrimary }}>
        {t("bulkMetafieldEdit.targetField", {
          field: result.fieldName || fieldKey,
          fieldKey,
        })}
      </div>

      <SummaryChips summary={result.summary} isClear={isClear} />

      {result.truncated ? (
        <div style={warningNoticeStyle}>{t("bulkMetafieldEdit.truncatedWarning")}</div>
      ) : null}

      {result.summary.invalidCount > 0 ? (
        <div style={warningNoticeStyle}>
          {t("bulkMetafieldEdit.invalidWarning", { count: result.summary.invalidCount })}
        </div>
      ) : null}

      {isClear && changedRows.length > 0 && !applied ? (
        <div style={warningNoticeStyle}>
          {t("bulkMetafieldEdit.clearWarning", { count: changedRows.length })}
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
          {t("bulkMetafieldEdit.appliedBanner", {
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
              <th style={headCellStyle}>{t("bulkMetafieldEdit.colProduct")}</th>
              <th style={headCellStyle}>{t("bulkMetafieldEdit.colBefore")}</th>
              <th style={headCellStyle}>{t("bulkMetafieldEdit.colAfter")}</th>
              <th style={headCellStyle}>{t("bulkMetafieldEdit.colAction")}</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <BulkMetafieldEditRowCells key={row.productId} row={row} isClear={isClear} />
            ))}
          </tbody>
        </table>
      </div>

      {rows.length > visibleRows.length ? (
        <div style={{ fontSize: 12, color: pageColorTokens.textFootnote }}>
          {t("bulkMetafieldEdit.moreRowsHint", {
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
              downloadCsv(
                `bulk-metafield-edit-${shortId}.csv`,
                buildBulkMetafieldEditChangesetCsv(rows, field, result.action),
              )
            }
          >
            {t("bulkMetafieldEdit.downloadChangeset")}
          </button>
          <button
            type="button"
            style={actionButtonStyle("secondary", changedRows.length === 0)}
            disabled={changedRows.length === 0}
            onClick={() =>
              downloadCsv(
                `bulk-metafield-edit-rollback-${shortId}.csv`,
                buildBulkMetafieldEditRollbackCsv(rows, field),
              )
            }
          >
            {t("bulkMetafieldEdit.downloadRollback")}
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {canApply && confirmingWrite ? (
            <>
              <span style={{ fontSize: 12, color: pageColorTokens.criticalText }}>
                {t(
                  isClear
                    ? "bulkMetafieldEdit.applyConfirmHintClear"
                    : "bulkMetafieldEdit.applyConfirmHintSet",
                  { count: changedRows.length, field: result.fieldName || fieldKey },
                )}
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
                {applying
                  ? t("bulkMetafieldEdit.applying")
                  : t("bulkMetafieldEdit.applyConfirmButton")}
              </button>
            </>
          ) : canApply ? (
            <button
              type="button"
              style={actionButtonStyle("primary")}
              onClick={() => setConfirmingWrite(true)}
            >
              {t("bulkMetafieldEdit.applyButton", { count: changedRows.length })}
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

function BulkMetafieldEditRowCells({
  row,
  isClear,
}: {
  row: BulkMetafieldEditRow;
  isClear: boolean;
}) {
  const { t } = useTranslation();
  const empty = <span style={{ color: pageColorTokens.textFootnote }}>—</span>;
  return (
    <tr style={{ opacity: row.skipped ? 0.6 : 1 }}>
      <td style={{ ...cellStyle, fontWeight: 600 }} title={row.productTitle}>
        {row.productTitle}
      </td>
      <td style={cellStyle} title={row.beforeValue ?? undefined}>
        {row.beforeValue ? preview(row.beforeValue) : empty}
      </td>
      <td style={cellStyle} title={row.afterValue ?? undefined}>
        {row.skipped ? (
          empty
        ) : isClear ? (
          <span style={{ color: pageColorTokens.criticalText, fontWeight: 700 }}>
            {t("bulkMetafieldEdit.valueCleared")}
          </span>
        ) : (
          <span style={{ color: pageColorTokens.brandGreenDeep, fontWeight: 700 }}>
            {preview(row.afterValue ?? "")}
          </span>
        )}
      </td>
      <td style={cellStyle}>
        {row.skipped ? (
          <span style={{ color: pageColorTokens.textFootnote }}>
            {t(`bulkMetafieldEdit.skipReason.${row.skipReason ?? "no_change"}`)}
            {row.skipReason === "invalid_value" && row.invalidValue ? (
              <span style={{ display: "block", color: pageColorTokens.criticalText }}>
                {preview(row.invalidValue)}
              </span>
            ) : null}
          </span>
        ) : (
          <span style={{ color: pageColorTokens.brandGreenDeep, fontWeight: 700, whiteSpace: "nowrap" }}>
            {t(isClear ? "bulkMetafieldEdit.actionClear" : "bulkMetafieldEdit.actionSet")}
          </span>
        )}
      </td>
    </tr>
  );
}
