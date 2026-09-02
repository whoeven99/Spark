/**
 * 库存导入审核详情 —— 「上传表格 → 匹配 → 验收 → 写回」里的验收与写回入口。
 *
 * 与其它 TaskDetailPage 同签名，因此同一份 UI 既能在任务页由
 * BulkInventoryImportReviewDialog 包成弹窗，也能直接挂进对话里的审核 DialogShell。
 *
 * 和成本价导入审核页的两处关键差别：
 *   - 顶部必须显示目标地点。同一批 SKU 在不同地点是完全不同的数字，
 *     商户看不到地点就没法验收。
 *   - 写回结果里的 `staleCount` 要单独讲清楚：那些行不是失败，
 *     是试算之后库存又变了、系统拒绝覆盖，需要重新试算而不是重试。
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { pageColorTokens } from "../../page/pageUiStyles";
import { actionButtonStyle } from "../aiTask/AITaskCardShell";
import {
  buildBulkInventoryImportChangesetCsv,
  buildBulkInventoryImportIssuesCsv,
  buildBulkInventoryImportRollbackCsv,
  type BulkInventoryImportIssue,
  type BulkInventoryImportRow,
  type BulkInventoryImportSummary,
} from "../../../lib/bulkInventoryImport";
import type {
  AITaskItem,
  AITaskStatus,
  BulkInventoryImportApplyResponse,
  BulkInventoryImportTaskResult,
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

export function readBulkInventoryImportResult(
  task: AITaskItem,
): BulkInventoryImportTaskResult | null {
  const raw = task.result;
  if (!raw || !Array.isArray(raw.rows)) return null;
  return raw as unknown as BulkInventoryImportTaskResult;
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

function formatDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : String(delta);
}

function SummaryChips({ summary }: { summary: BulkInventoryImportSummary }) {
  const { t } = useTranslation();
  const chips = [
    { label: t("bulkInventoryImport.summarySheetRows"), value: summary.sheetRows },
    { label: t("bulkInventoryImport.summaryMatched"), value: summary.matched },
    { label: t("bulkInventoryImport.summaryChanged"), value: summary.changed },
    { label: t("bulkInventoryImport.summaryUnchanged"), value: summary.unchanged },
    { label: t("bulkInventoryImport.summaryIssues"), value: summary.issues },
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
function IssueNotice({ issues }: { issues: BulkInventoryImportIssue[] }) {
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
        {t("bulkInventoryImport.issuesTitle", { count: issues.length })}
      </div>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {grouped.map(([reason, count]) => (
          <li key={reason}>{t(`bulkInventoryImport.issueReason.${reason}`, { count })}</li>
        ))}
      </ul>
    </div>
  );
}

export function BulkInventoryImportTaskDetailPage({
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

  const result = readBulkInventoryImportResult(task);
  const [applied, setApplied] = useState<{
    succeeded: number;
    failed: number;
    staleCount: number;
  } | null>(
    result?.apply
      ? {
          succeeded: result.apply.succeeded,
          failed: result.apply.failed,
          staleCount: result.apply.staleCount,
        }
      : null,
  );

  const shortId = task.id.slice(0, 8).toUpperCase();
  const resultRows = result?.rows;
  const resultIssues = result?.issues;
  const rows = useMemo(() => resultRows ?? [], [resultRows]);
  const issues = useMemo(() => resultIssues ?? [], [resultIssues]);
  const changedRows = useMemo(() => rows.filter((row) => !row.skipped), [rows]);
  const largeDeltaCount = useMemo(
    () => changedRows.filter((row) => row.notes?.includes("large_delta")).length,
    [changedRows],
  );
  const visibleRows = rows.slice(0, VISIBLE_ROWS);

  const handleApply = async () => {
    setApplying(true);
    onBusyChange?.(true);
    setError(null);
    try {
      const response = await fetch("/api/bulk-inventory-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: task.id, confirm: true }),
      });
      const json = (await response.json()) as BulkInventoryImportApplyResponse;
      if (!json.ok) {
        setError(json.error);
        return;
      }
      const outcome = {
        succeeded: json.succeeded,
        failed: json.failed,
        staleCount: json.staleCount,
      };
      setApplied(outcome);
      setConfirmingWrite(false);
      onTaskUpdated?.(task.id, "applied", {
        ...(task.result ?? {}),
        apply: { at: new Date().toISOString(), ...outcome, errors: [] },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("bulkInventoryImport.applyFailed"));
    } finally {
      setApplying(false);
      onBusyChange?.(false);
    }
  };

  if (!result) {
    return (
      <div style={{ fontSize: 13, color: pageColorTokens.textSecondary, padding: "24px 0" }}>
        {t("bulkInventoryImport.noChangeset")}
      </div>
    );
  }

  // 只有仍待审核的任务能写回；已写回或已取消的任务是只读凭证
  const canApply = task.status === "pending_review" && applied == null && changedRows.length > 0;
  const location = { id: result.locationId };

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
        {t("bulkInventoryImport.targetLocation")}
        <strong style={{ marginLeft: 6, color: pageColorTokens.textPrimary }}>
          {result.locationName}
        </strong>
        <span style={{ margin: "0 10px", color: pageColorTokens.borderSubtle }}>|</span>
        {t("bulkInventoryImport.sourceFile")}
        <strong style={{ marginLeft: 6, color: pageColorTokens.textPrimary }}>
          {result.fileName}
        </strong>
      </div>

      <div style={{ fontSize: 12, color: pageColorTokens.textFootnote }}>
        {t("bulkInventoryImport.scopeHint")}
      </div>

      <SummaryChips summary={result.summary} />

      {result.truncated ? (
        <div style={warningNoticeStyle}>{t("bulkInventoryImport.truncatedWarning")}</div>
      ) : null}

      <IssueNotice issues={issues} />

      {largeDeltaCount > 0 ? (
        <div style={warningNoticeStyle}>
          {t("bulkInventoryImport.largeDeltaWarning", { count: largeDeltaCount })}
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
          <div>
            {t("bulkInventoryImport.appliedBanner", {
              succeeded: applied.succeeded,
              failed: applied.failed,
            })}
          </div>
          {applied.staleCount > 0 ? (
            <div style={{ marginTop: 4, fontWeight: 400 }}>
              {t("bulkInventoryImport.staleHint", { count: applied.staleCount })}
            </div>
          ) : null}
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
              <th style={headCellStyle}>{t("bulkInventoryImport.colSourceRow")}</th>
              <th style={headCellStyle}>{t("bulkInventoryImport.colSku")}</th>
              <th style={headCellStyle}>{t("bulkInventoryImport.colProduct")}</th>
              <th style={headCellStyle}>{t("bulkInventoryImport.colQuantity")}</th>
              <th style={headCellStyle}>{t("bulkInventoryImport.colDelta")}</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <BulkInventoryImportRowCells key={row.inventoryItemId} row={row} />
            ))}
          </tbody>
        </table>
      </div>

      {rows.length > visibleRows.length ? (
        <div style={{ fontSize: 12, color: pageColorTokens.textFootnote }}>
          {t("bulkInventoryImport.moreRowsHint", {
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
                `bulk-inventory-import-${shortId}.csv`,
                buildBulkInventoryImportChangesetCsv(rows, location),
              )
            }
          >
            {t("bulkInventoryImport.downloadChangeset")}
          </button>
          <button
            type="button"
            style={actionButtonStyle("secondary", changedRows.length === 0)}
            disabled={changedRows.length === 0}
            onClick={() =>
              downloadCsv(
                `bulk-inventory-import-rollback-${shortId}.csv`,
                buildBulkInventoryImportRollbackCsv(rows, location),
              )
            }
          >
            {t("bulkInventoryImport.downloadRollback")}
          </button>
          <button
            type="button"
            style={actionButtonStyle("secondary", issues.length === 0)}
            disabled={issues.length === 0}
            onClick={() =>
              downloadCsv(
                `bulk-inventory-import-issues-${shortId}.csv`,
                buildBulkInventoryImportIssuesCsv(issues),
              )
            }
          >
            {t("bulkInventoryImport.downloadIssues")}
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {canApply && confirmingWrite ? (
            <>
              <span style={{ fontSize: 12, color: pageColorTokens.criticalText }}>
                {t("bulkInventoryImport.applyConfirmHint", { count: changedRows.length })}
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
                  ? t("bulkInventoryImport.applying")
                  : t("bulkInventoryImport.applyConfirmButton")}
              </button>
            </>
          ) : canApply ? (
            <button
              type="button"
              style={actionButtonStyle("primary")}
              onClick={() => setConfirmingWrite(true)}
            >
              {t("bulkInventoryImport.applyButton", { count: changedRows.length })}
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

function BulkInventoryImportRowCells({ row }: { row: BulkInventoryImportRow }) {
  const { t } = useTranslation();
  const dash = "—";
  const delta = row.afterQuantity - row.beforeQuantity;
  const suspicious = row.notes?.includes("large_delta");
  return (
    <tr style={{ opacity: row.skipped ? 0.6 : 1 }}>
      <td style={cellStyle}>{row.sourceRow}</td>
      <td style={cellStyle}>{row.sku || dash}</td>
      <td style={cellStyle} title={row.productTitle}>
        {row.productTitle}
      </td>
      <td style={cellStyle}>
        {row.skipped ? (
          <span style={{ color: pageColorTokens.textFootnote }}>{row.beforeQuantity}</span>
        ) : (
          <>
            <span style={{ color: pageColorTokens.textFootnote }}>{row.beforeQuantity}</span>
            <span style={{ margin: "0 6px" }}>→</span>
            <strong style={{ color: suspicious ? "#92400e" : undefined }}>
              {row.afterQuantity}
            </strong>
          </>
        )}
      </td>
      <td style={cellStyle}>
        {row.skipped ? (
          <span style={{ color: pageColorTokens.textFootnote }}>
            {t("bulkInventoryImport.skipReason.no_change")}
          </span>
        ) : (
          <strong
            style={{
              color: delta > 0 ? pageColorTokens.brandGreenDeep : pageColorTokens.criticalText,
            }}
          >
            {formatDelta(delta)}
          </strong>
        )}
      </td>
    </tr>
  );
}
