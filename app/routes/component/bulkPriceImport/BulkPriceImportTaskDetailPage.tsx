/**
 * 价目表导入审核详情 —— 「上传表格 → 匹配 → 验收 → 写回」里的验收与写回入口。
 *
 * 与其它 TaskDetailPage 同签名，因此同一份 UI 既能在任务页由
 * BulkPriceImportReviewDialog 包成弹窗，也能直接挂进对话里的审核 DialogShell。
 *
 * 和批量调价审核页的关键差别：这里必须把「表格里有、但没落到店铺上」的行交代清楚，
 * 所以未匹配 / SKU 冲突 / 价格解析失败被提到表格上方，而不是混在行里。
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { pageColorTokens } from "../../page/pageUiStyles";
import { actionButtonStyle } from "../aiTask/AITaskCardShell";
import {
  buildBulkPriceImportChangesetCsv,
  buildBulkPriceImportIssuesCsv,
  buildBulkPriceImportRollbackCsv,
  type BulkPriceImportIssue,
  type BulkPriceImportRow,
  type BulkPriceImportSummary,
} from "../../../lib/bulkPriceImport";
import type {
  AITaskItem,
  AITaskStatus,
  BulkPriceImportApplyResponse,
  BulkPriceImportTaskResult,
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

export function readBulkPriceImportResult(
  task: AITaskItem,
): BulkPriceImportTaskResult | null {
  const raw = task.result;
  if (!raw || !Array.isArray(raw.rows)) return null;
  return raw as unknown as BulkPriceImportTaskResult;
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

function SummaryChips({ summary }: { summary: BulkPriceImportSummary }) {
  const { t } = useTranslation();
  const chips = [
    { label: t("bulkPriceImport.summarySheetRows"), value: summary.sheetRows },
    { label: t("bulkPriceImport.summaryMatched"), value: summary.matched },
    { label: t("bulkPriceImport.summaryChanged"), value: summary.changed },
    { label: t("bulkPriceImport.summaryUnchanged"), value: summary.unchanged },
    { label: t("bulkPriceImport.summaryIssues"), value: summary.issues },
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
function IssueNotice({ issues }: { issues: BulkPriceImportIssue[] }) {
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
        {t("bulkPriceImport.issuesTitle", { count: issues.length })}
      </div>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {grouped.map(([reason, count]) => (
          <li key={reason}>{t(`bulkPriceImport.issueReason.${reason}`, { count })}</li>
        ))}
      </ul>
    </div>
  );
}

export function BulkPriceImportTaskDetailPage({
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

  const result = readBulkPriceImportResult(task);
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
    () => changedRows.filter((row) => row.importNote === "suspicious_magnitude").length,
    [changedRows],
  );
  const visibleRows = rows.slice(0, VISIBLE_ROWS);

  const handleApply = async () => {
    setApplying(true);
    onBusyChange?.(true);
    setError(null);
    try {
      const response = await fetch("/api/bulk-price-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: task.id, confirm: true }),
      });
      const json = (await response.json()) as BulkPriceImportApplyResponse;
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
      setError(e instanceof Error ? e.message : t("bulkPriceImport.applyFailed"));
    } finally {
      setApplying(false);
      onBusyChange?.(false);
    }
  };

  if (!result) {
    return (
      <div style={{ fontSize: 13, color: pageColorTokens.textSecondary, padding: "24px 0" }}>
        {t("bulkPriceImport.noChangeset")}
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
        {t("bulkPriceImport.sourceFile")}
        <strong style={{ marginLeft: 6, color: pageColorTokens.textPrimary }}>
          {result.fileName}
        </strong>
      </div>

      <SummaryChips summary={result.summary} />

      {result.truncated ? (
        <div style={warningNoticeStyle}>{t("bulkPriceImport.truncatedWarning")}</div>
      ) : null}

      <IssueNotice issues={issues} />

      {suspiciousCount > 0 ? (
        <div style={warningNoticeStyle}>
          {t("bulkPriceImport.suspiciousWarning", { count: suspiciousCount })}
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
          {t("bulkPriceImport.appliedBanner", {
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
              <th style={headCellStyle}>{t("bulkPriceImport.colSourceRow")}</th>
              <th style={headCellStyle}>{t("bulkPriceImport.colSku")}</th>
              <th style={headCellStyle}>{t("bulkPriceImport.colProduct")}</th>
              <th style={headCellStyle}>{t("bulkPriceImport.colPrice")}</th>
              <th style={headCellStyle}>{t("bulkPriceImport.colCompareAt")}</th>
              <th style={headCellStyle}>{t("bulkPriceImport.colAction")}</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <BulkPriceImportRowCells key={row.variantId} row={row} />
            ))}
          </tbody>
        </table>
      </div>

      {rows.length > visibleRows.length ? (
        <div style={{ fontSize: 12, color: pageColorTokens.textFootnote }}>
          {t("bulkPriceImport.moreRowsHint", {
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
                `bulk-price-import-${shortId}.csv`,
                buildBulkPriceImportChangesetCsv(rows),
              )
            }
          >
            {t("bulkPriceImport.downloadChangeset")}
          </button>
          <button
            type="button"
            style={actionButtonStyle("secondary", changedRows.length === 0)}
            disabled={changedRows.length === 0}
            onClick={() =>
              downloadCsv(
                `bulk-price-import-rollback-${shortId}.csv`,
                buildBulkPriceImportRollbackCsv(rows),
              )
            }
          >
            {t("bulkPriceImport.downloadRollback")}
          </button>
          <button
            type="button"
            style={actionButtonStyle("secondary", issues.length === 0)}
            disabled={issues.length === 0}
            onClick={() =>
              downloadCsv(
                `bulk-price-import-issues-${shortId}.csv`,
                buildBulkPriceImportIssuesCsv(issues),
              )
            }
          >
            {t("bulkPriceImport.downloadIssues")}
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {canApply && confirmingWrite ? (
            <>
              <span style={{ fontSize: 12, color: pageColorTokens.criticalText }}>
                {t("bulkPriceImport.applyConfirmHint", { count: changedRows.length })}
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
                {applying ? t("bulkPriceImport.applying") : t("bulkPriceImport.applyConfirmButton")}
              </button>
            </>
          ) : canApply ? (
            <button
              type="button"
              style={actionButtonStyle("primary")}
              onClick={() => setConfirmingWrite(true)}
            >
              {t("bulkPriceImport.applyButton", { count: changedRows.length })}
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

function BulkPriceImportRowCells({ row }: { row: BulkPriceImportRow }) {
  const { t } = useTranslation();
  const dash = "—";
  return (
    <tr style={{ opacity: row.skipped ? 0.6 : 1 }}>
      <td style={cellStyle}>{row.sourceRow}</td>
      <td style={cellStyle}>{row.sku || dash}</td>
      <td style={cellStyle} title={row.productTitle}>
        {row.productTitle}
      </td>
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
            <span style={{ color: pageColorTokens.textFootnote }}>
              {row.beforeCompareAt ?? dash}
            </span>
            <span style={{ margin: "0 6px" }}>→</span>
            <strong>{row.afterCompareAt ?? dash}</strong>
          </>
        ) : (
          <span style={{ color: pageColorTokens.textFootnote }}>{row.beforeCompareAt ?? dash}</span>
        )}
      </td>
      <td style={cellStyle}>
        {row.skipped ? (
          <span style={{ color: pageColorTokens.textFootnote }}>
            {t("bulkPriceImport.actionUnchanged")}
          </span>
        ) : (
          <span
            style={{
              color:
                row.importNote === "suspicious_magnitude"
                  ? "#92400e"
                  : pageColorTokens.brandGreenDeep,
              fontWeight: 700,
            }}
          >
            {t("bulkPriceImport.actionChange")}
            {row.importNote ? ` · ${t("bulkPriceImport.noteSuspicious")}` : ""}
          </span>
        )}
      </td>
    </tr>
  );
}
