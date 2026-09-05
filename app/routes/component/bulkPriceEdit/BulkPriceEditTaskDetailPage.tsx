/**
 * 批量调价审核详情 —— 「导出 → 改表 → 验收 → 写回」里的验收与写回入口。
 *
 * 与其它 TaskDetailPage 同签名，因此同一份 UI 既能在任务页由
 * BulkPriceEditReviewDialog 包成弹窗，也能直接挂进对话里的审核 DialogShell。
 *
 * 数据全部来自任务 result 里的 changeset，不再回源 Shopify；
 * CSV 也在浏览器端由同一份数据生成，避免为下载再造一套 Blob/SAS 链路。
 * 「确认写回店铺」是本功能对商户暴露的唯一写入按钮。
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { pageColorTokens } from "../../page/pageUiStyles";
import { actionButtonStyle } from "../aiTask/AITaskCardShell";
import {
  buildBulkPriceEditChangesetCsv,
  buildBulkPriceEditRollbackCsv,
  type BulkPriceEditRow,
  type BulkPriceEditSummary,
} from "../../../lib/bulkPriceEdit";
import type {
  AITaskItem,
  AITaskStatus,
  BulkPriceEditApplyResponse,
  BulkPriceEditTaskResult,
} from "../../../lib/aiTaskTypes";

/** 表格只渲染前 N 行，完整清单走 CSV —— 1000 行 DOM 会明显拖慢弹窗。 */
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

export function readBulkPriceEditResult(task: AITaskItem): BulkPriceEditTaskResult | null {
  const raw = task.result;
  if (!raw || !Array.isArray(raw.rows)) return null;
  return raw as unknown as BulkPriceEditTaskResult;
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
  whiteSpace: "nowrap" as const,
  overflow: "hidden" as const,
  textOverflow: "ellipsis" as const,
  maxWidth: 180,
};

const headCellStyle = {
  ...cellStyle,
  position: "sticky" as const,
  top: 0,
  background: pageColorTokens.surfaceSubtle,
  fontWeight: 700,
  color: pageColorTokens.textSecondary,
  zIndex: 1,
};

const noticeStyle = {
  fontSize: 12,
  borderRadius: 8,
  padding: "8px 10px",
};

function SummaryChips({ summary }: { summary: BulkPriceEditSummary }) {
  const { t } = useTranslation();
  const chips = [
    { label: t("bulkPriceEdit.summaryProducts"), value: summary.products },
    { label: t("bulkPriceEdit.summaryVariants"), value: summary.variants },
    { label: t("bulkPriceEdit.summaryChanged"), value: summary.changed },
    { label: t("bulkPriceEdit.summarySkipped"), value: summary.skipped },
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

export function BulkPriceEditTaskDetailPage({
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

  const result = readBulkPriceEditResult(task);
  const [applied, setApplied] = useState<{ succeeded: number; failed: number } | null>(
    result?.apply ? { succeeded: result.apply.succeeded, failed: result.apply.failed } : null,
  );

  const shortId = task.id.slice(0, 8).toUpperCase();
  const resultRows = result?.rows;
  const rows = useMemo(() => resultRows ?? [], [resultRows]);
  const changedRows = useMemo(() => rows.filter((row) => !row.skipped), [rows]);
  const visibleRows = rows.slice(0, VISIBLE_ROWS);

  const handleApply = async () => {
    setApplying(true);
    onBusyChange?.(true);
    setError(null);
    try {
      const response = await fetch("/api/bulk-price-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: task.id, confirm: true }),
      });
      const json = (await response.json()) as BulkPriceEditApplyResponse;
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
      setError(e instanceof Error ? e.message : t("bulkPriceEdit.applyFailed"));
    } finally {
      setApplying(false);
      onBusyChange?.(false);
    }
  };

  if (!result) {
    return (
      <div style={{ fontSize: 13, color: pageColorTokens.textSecondary, padding: "24px 0" }}>
        {t("bulkPriceEdit.noChangeset")}
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
          {t("bulkPriceEdit.truncatedWarning")}
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
          {t("bulkPriceEdit.appliedBanner", {
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
              <th style={headCellStyle}>{t("bulkPriceEdit.colProduct")}</th>
              <th style={headCellStyle}>{t("bulkPriceEdit.colVariant")}</th>
              <th style={headCellStyle}>{t("bulkPriceEdit.colSku")}</th>
              <th style={headCellStyle}>{t("bulkPriceEdit.colPrice")}</th>
              <th style={headCellStyle}>{t("bulkPriceEdit.colCompareAt")}</th>
              <th style={headCellStyle}>{t("bulkPriceEdit.colAction")}</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <BulkPriceEditRowCells key={row.variantId} row={row} />
            ))}
          </tbody>
        </table>
      </div>

      {rows.length > visibleRows.length ? (
        <div style={{ fontSize: 12, color: pageColorTokens.textFootnote }}>
          {t("bulkPriceEdit.moreRowsHint", {
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
              downloadCsv(`bulk-price-edit-${shortId}.csv`, buildBulkPriceEditChangesetCsv(rows))
            }
          >
            {t("bulkPriceEdit.downloadChangeset")}
          </button>
          <button
            type="button"
            style={actionButtonStyle("secondary", changedRows.length === 0)}
            disabled={changedRows.length === 0}
            onClick={() =>
              downloadCsv(
                `bulk-price-edit-rollback-${shortId}.csv`,
                buildBulkPriceEditRollbackCsv(rows),
              )
            }
          >
            {t("bulkPriceEdit.downloadRollback")}
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {canApply && confirmingWrite ? (
            <>
              <span style={{ fontSize: 12, color: pageColorTokens.criticalText }}>
                {t("bulkPriceEdit.applyConfirmHint", { count: changedRows.length })}
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
                {applying ? t("bulkPriceEdit.applying") : t("bulkPriceEdit.applyConfirmButton")}
              </button>
            </>
          ) : canApply ? (
            <button
              type="button"
              style={actionButtonStyle("primary")}
              onClick={() => setConfirmingWrite(true)}
            >
              {t("bulkPriceEdit.applyButton", { count: changedRows.length })}
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

function BulkPriceEditRowCells({ row }: { row: BulkPriceEditRow }) {
  const { t } = useTranslation();
  const dash = "—";
  return (
    <tr style={{ opacity: row.skipped ? 0.6 : 1 }}>
      <td style={cellStyle} title={row.productTitle}>
        {row.productTitle}
      </td>
      <td style={cellStyle} title={row.variantTitle}>
        {row.variantTitle || dash}
      </td>
      <td style={cellStyle}>{row.sku || dash}</td>
      <td style={cellStyle}>
        {row.priceChanged ? (
          <>
            <span style={{ color: pageColorTokens.textFootnote }}>{row.beforePrice}</span>
            <span style={{ margin: "0 6px" }}>→</span>
            <strong>{row.afterPrice}</strong>
          </>
        ) : (
          <span style={{ color: pageColorTokens.textFootnote }}>{row.beforePrice || dash}</span>
        )}
      </td>
      <td style={cellStyle}>
        {row.compareAtChanged ? (
          <>
            <span style={{ color: pageColorTokens.textFootnote }}>{row.beforeCompareAt ?? dash}</span>
            <span style={{ margin: "0 6px" }}>→</span>
            <strong>{row.afterCompareAt ?? t("bulkPriceEdit.cleared")}</strong>
          </>
        ) : (
          <span style={{ color: pageColorTokens.textFootnote }}>{row.beforeCompareAt ?? dash}</span>
        )}
      </td>
      <td style={cellStyle}>
        {row.skipped ? (
          <span style={{ color: pageColorTokens.textFootnote }}>
            {t(`bulkPriceEdit.skipReason.${row.skipReason ?? "no_change"}`)}
          </span>
        ) : (
          <span style={{ color: pageColorTokens.brandGreenDeep, fontWeight: 700 }}>
            {t("bulkPriceEdit.actionChange")}
            {row.note ? ` · ${t(`bulkPriceEdit.note.${row.note}`)}` : ""}
          </span>
        )}
      </td>
    </tr>
  );
}
