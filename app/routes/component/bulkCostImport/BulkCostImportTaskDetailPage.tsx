/**
 * 成本价导入审核详情 —— 「上传表格 → 匹配 → 验收 → 写回」里的验收与写回入口。
 *
 * 与其它 TaskDetailPage 同签名，因此同一份 UI 既能在任务页由
 * BulkCostImportReviewDialog 包成弹窗，也能直接挂进对话里的审核 DialogShell。
 *
 * 和价目表导入审核页的关键差别：这里多一列毛利率试算。
 * 商户改成本真正关心的不是成本本身，而是改完之后还赚不赚钱，
 * 所以「写回后毛利为负」要在表格上方单独警告，而不是埋在行里。
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { pageColorTokens } from "../../page/pageUiStyles";
import { actionButtonStyle } from "../aiTask/AITaskCardShell";
import {
  buildBulkCostImportChangesetCsv,
  buildBulkCostImportIssuesCsv,
  buildBulkCostImportRollbackCsv,
  type BulkCostImportIssue,
  type BulkCostImportRow,
  type BulkCostImportSummary,
} from "../../../lib/bulkCostImport";
import type {
  AITaskItem,
  AITaskStatus,
  BulkCostImportApplyResponse,
  BulkCostImportTaskResult,
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

export function readBulkCostImportResult(task: AITaskItem): BulkCostImportTaskResult | null {
  const raw = task.result;
  if (!raw || !Array.isArray(raw.rows)) return null;
  return raw as unknown as BulkCostImportTaskResult;
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

const warningNoticeStyle = {
  ...noticeStyle,
  color: "#92400e",
  background: "#fffbeb",
  border: "1px solid #fde68a",
};

function formatMargin(value: number | null): string {
  return value == null ? "—" : `${value}%`;
}

function SummaryChips({ summary }: { summary: BulkCostImportSummary }) {
  const { t } = useTranslation();
  const chips = [
    { label: t("bulkCostImport.summarySheetRows"), value: summary.sheetRows },
    { label: t("bulkCostImport.summaryMatched"), value: summary.matched },
    { label: t("bulkCostImport.summaryChanged"), value: summary.changed },
    { label: t("bulkCostImport.summaryUnchanged"), value: summary.unchanged },
    { label: t("bulkCostImport.summaryIssues"), value: summary.issues },
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

/** 按问题类型聚合成一句话，避免 14 行未匹配就刷 14 条提示。 */
function IssueNotice({ issues }: { issues: BulkCostImportIssue[] }) {
  const { t } = useTranslation();
  const grouped = useMemo(() => {
    const counts = new Map<string, number>();
    for (const issue of issues) {
      counts.set(issue.reason, (counts.get(issue.reason) ?? 0) + 1);
    }
    return Array.from(counts.entries());
  }, [issues]);

  if (grouped.length === 0) return null;

  return (
    <div style={warningNoticeStyle}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>
        {t("bulkCostImport.issuesTitle", { count: issues.length })}
      </div>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {grouped.map(([reason, count]) => (
          <li key={reason}>{t(`bulkCostImport.issueReason.${reason}`, { count })}</li>
        ))}
      </ul>
    </div>
  );
}

export function BulkCostImportTaskDetailPage({
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

  const result = readBulkCostImportResult(task);
  const [applied, setApplied] = useState<{ succeeded: number; failed: number } | null>(
    result?.apply ? { succeeded: result.apply.succeeded, failed: result.apply.failed } : null,
  );

  const shortId = task.id.slice(0, 8).toUpperCase();
  const resultRows = result?.rows;
  const resultIssues = result?.issues;
  const rows = useMemo(() => resultRows ?? [], [resultRows]);
  const issues = useMemo(() => resultIssues ?? [], [resultIssues]);
  const changedRows = useMemo(() => rows.filter((row) => !row.skipped), [rows]);
  const suspiciousCount = useMemo(
    () => changedRows.filter((row) => row.notes?.includes("suspicious_magnitude")).length,
    [changedRows],
  );
  const negativeMarginCount = result?.summary.negativeMargin ?? 0;
  const visibleRows = rows.slice(0, VISIBLE_ROWS);

  const handleApply = async () => {
    setApplying(true);
    onBusyChange?.(true);
    setError(null);
    try {
      const response = await fetch("/api/bulk-cost-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: task.id, confirm: true }),
      });
      const json = (await response.json()) as BulkCostImportApplyResponse;
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
      setError(e instanceof Error ? e.message : t("bulkCostImport.applyFailed"));
    } finally {
      setApplying(false);
      onBusyChange?.(false);
    }
  };

  if (!result) {
    return (
      <div style={{ fontSize: 13, color: pageColorTokens.textSecondary, padding: "24px 0" }}>
        {t("bulkCostImport.noChangeset")}
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

      <div style={{ fontSize: 13, color: pageColorTokens.textSecondary }}>
        {t("bulkCostImport.sourceFile")}
        <strong style={{ marginLeft: 6, color: pageColorTokens.textPrimary }}>
          {result.fileName}
        </strong>
      </div>

      <div style={{ fontSize: 12, color: pageColorTokens.textFootnote }}>
        {t("bulkCostImport.scopeHint")}
      </div>

      <SummaryChips summary={result.summary} />

      {result.truncated ? (
        <div style={warningNoticeStyle}>{t("bulkCostImport.truncatedWarning")}</div>
      ) : null}

      <IssueNotice issues={issues} />

      {negativeMarginCount > 0 ? (
        <div style={warningNoticeStyle}>
          {t("bulkCostImport.negativeMarginWarning", { count: negativeMarginCount })}
        </div>
      ) : null}

      {suspiciousCount > 0 ? (
        <div style={warningNoticeStyle}>
          {t("bulkCostImport.suspiciousWarning", { count: suspiciousCount })}
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
          {t("bulkCostImport.appliedBanner", {
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
              <th style={headCellStyle}>{t("bulkCostImport.colSourceRow")}</th>
              <th style={headCellStyle}>{t("bulkCostImport.colSku")}</th>
              <th style={headCellStyle}>{t("bulkCostImport.colProduct")}</th>
              <th style={headCellStyle}>{t("bulkCostImport.colCost")}</th>
              <th style={headCellStyle}>{t("bulkCostImport.colPrice")}</th>
              <th style={headCellStyle}>{t("bulkCostImport.colMargin")}</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <BulkCostImportRowCells key={row.inventoryItemId} row={row} />
            ))}
          </tbody>
        </table>
      </div>

      {rows.length > visibleRows.length ? (
        <div style={{ fontSize: 12, color: pageColorTokens.textFootnote }}>
          {t("bulkCostImport.moreRowsHint", {
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
                `bulk-cost-import-${shortId}.csv`,
                buildBulkCostImportChangesetCsv(rows),
              )
            }
          >
            {t("bulkCostImport.downloadChangeset")}
          </button>
          <button
            type="button"
            style={actionButtonStyle("secondary", changedRows.length === 0)}
            disabled={changedRows.length === 0}
            onClick={() =>
              downloadCsv(
                `bulk-cost-import-rollback-${shortId}.csv`,
                buildBulkCostImportRollbackCsv(rows),
              )
            }
          >
            {t("bulkCostImport.downloadRollback")}
          </button>
          <button
            type="button"
            style={actionButtonStyle("secondary", issues.length === 0)}
            disabled={issues.length === 0}
            onClick={() =>
              downloadCsv(
                `bulk-cost-import-issues-${shortId}.csv`,
                buildBulkCostImportIssuesCsv(issues),
              )
            }
          >
            {t("bulkCostImport.downloadIssues")}
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {canApply && confirmingWrite ? (
            <>
              <span style={{ fontSize: 12, color: pageColorTokens.criticalText }}>
                {t("bulkCostImport.applyConfirmHint", { count: changedRows.length })}
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
                {applying ? t("bulkCostImport.applying") : t("bulkCostImport.applyConfirmButton")}
              </button>
            </>
          ) : canApply ? (
            <button
              type="button"
              style={actionButtonStyle("primary")}
              onClick={() => setConfirmingWrite(true)}
            >
              {t("bulkCostImport.applyButton", { count: changedRows.length })}
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

function BulkCostImportRowCells({ row }: { row: BulkCostImportRow }) {
  const dash = "—";
  const negative = row.notes?.includes("negative_margin");
  const suspicious = row.notes?.includes("suspicious_magnitude");
  return (
    <tr style={{ opacity: row.skipped ? 0.6 : 1 }}>
      <td style={cellStyle}>{row.sourceRow}</td>
      <td style={cellStyle}>{row.sku || dash}</td>
      <td style={cellStyle} title={row.productTitle}>
        {row.productTitle}
      </td>
      <td style={cellStyle}>
        {row.skipped ? (
          <span style={{ color: pageColorTokens.textFootnote }}>{row.beforeCost || dash}</span>
        ) : (
          <>
            <span style={{ color: pageColorTokens.textFootnote }}>
              {row.beforeCost || dash}
            </span>
            <span style={{ margin: "0 6px" }}>→</span>
            <strong style={{ color: suspicious ? "#92400e" : undefined }}>
              {row.afterCost}
            </strong>
          </>
        )}
      </td>
      <td style={cellStyle}>
        <span style={{ color: pageColorTokens.textFootnote }}>{row.price ?? dash}</span>
      </td>
      <td style={cellStyle}>
        {row.skipped ? (
          <span style={{ color: pageColorTokens.textFootnote }}>
            {formatMargin(row.beforeMarginPercent)}
          </span>
        ) : (
          <>
            <span style={{ color: pageColorTokens.textFootnote }}>
              {formatMargin(row.beforeMarginPercent)}
            </span>
            <span style={{ margin: "0 6px" }}>→</span>
            <strong
              style={{
                color: negative ? pageColorTokens.criticalText : pageColorTokens.brandGreenDeep,
              }}
            >
              {formatMargin(row.afterMarginPercent)}
            </strong>
          </>
        )}
      </td>
    </tr>
  );
}
