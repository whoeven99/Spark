/**
 * 批量上下架审核详情 —— 验收与写回入口。
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
  buildBulkStatusEditChangesetCsv,
  buildBulkStatusEditRollbackCsv,
  type BulkStatusEditRow,
  type BulkStatusEditSummary,
} from "../../../lib/bulkStatusEdit";
import type {
  AITaskItem,
  AITaskStatus,
  BulkStatusEditApplyResponse,
  BulkStatusEditTaskResult,
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

export function readBulkStatusEditResult(task: AITaskItem): BulkStatusEditTaskResult | null {
  const raw = task.result;
  if (!raw || !Array.isArray(raw.rows)) return null;
  return raw as unknown as BulkStatusEditTaskResult;
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

const statusChipBase = {
  display: "inline-block",
  borderRadius: 999,
  padding: "1px 8px",
  fontSize: 11,
  lineHeight: 1.6,
  fontWeight: 600,
  whiteSpace: "nowrap" as const,
};

/** 上架用品牌绿、草稿用中性灰、其它状态（归档 / 未列出）用默认描边。 */
function statusChipStyle(status: string) {
  if (status === "ACTIVE") {
    return {
      ...statusChipBase,
      background: pageColorTokens.brandGreenLight,
      border: "1px solid rgba(0, 128, 96, 0.2)",
      color: pageColorTokens.brandGreenDeep,
    };
  }
  if (status === "DRAFT") {
    return {
      ...statusChipBase,
      background: pageColorTokens.surfaceSubtle,
      border: `1px solid ${pageColorTokens.borderSubtle}`,
      color: pageColorTokens.textSecondary,
    };
  }
  return {
    ...statusChipBase,
    background: "#fffbeb",
    border: "1px solid #fde68a",
    color: "#92400e",
  };
}

function StatusChip({ status }: { status: string }) {
  const { t } = useTranslation();
  const label = t(`bulkStatusEdit.status.${status}`, { defaultValue: status || "—" });
  return <span style={statusChipStyle(status)}>{label}</span>;
}

function SummaryChips({ summary }: { summary: BulkStatusEditSummary }) {
  const { t } = useTranslation();
  const chips = [
    { label: t("bulkStatusEdit.summaryProducts"), value: summary.products },
    { label: t("bulkStatusEdit.summaryToActive"), value: summary.toActive },
    { label: t("bulkStatusEdit.summaryToDraft"), value: summary.toDraft },
    { label: t("bulkStatusEdit.summarySkipped"), value: summary.skipped },
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

export function BulkStatusEditTaskDetailPage({
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

  const result = readBulkStatusEditResult(task);
  const [applied, setApplied] = useState<{ succeeded: number; failed: number } | null>(
    result?.apply ? { succeeded: result.apply.succeeded, failed: result.apply.failed } : null,
  );

  const shortId = task.id.slice(0, 8).toUpperCase();
  const resultRows = result?.rows;
  const rows = useMemo(() => resultRows ?? [], [resultRows]);
  const changedRows = useMemo(() => rows.filter((row) => !row.skipped), [rows]);
  const toDraftCount = useMemo(
    () => changedRows.filter((row) => row.afterStatus === "DRAFT").length,
    [changedRows],
  );
  const publishCheckCount = useMemo(
    () => changedRows.filter((row) => row.needsPublishCheck).length,
    [changedRows],
  );
  const visibleRows = rows.slice(0, VISIBLE_ROWS);

  const handleApply = async () => {
    setApplying(true);
    onBusyChange?.(true);
    setError(null);
    try {
      const response = await fetch("/api/bulk-status-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: task.id, confirm: true }),
      });
      const json = (await response.json()) as BulkStatusEditApplyResponse;
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
      setError(e instanceof Error ? e.message : t("bulkStatusEdit.applyFailed"));
    } finally {
      setApplying(false);
      onBusyChange?.(false);
    }
  };

  if (!result) {
    return (
      <div style={{ fontSize: 13, color: pageColorTokens.textSecondary, padding: "24px 0" }}>
        {t("bulkStatusEdit.noChangeset")}
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
          {t("bulkStatusEdit.truncatedWarning")}
        </div>
      ) : null}

      {toDraftCount > 0 && !applied ? (
        <div
          style={{
            ...noticeStyle,
            color: "#92400e",
            background: "#fffbeb",
            border: "1px solid #fde68a",
          }}
        >
          {t("bulkStatusEdit.draftWarning", { count: toDraftCount })}
        </div>
      ) : null}

      {publishCheckCount > 0 && !applied ? (
        <div
          style={{
            ...noticeStyle,
            color: pageColorTokens.textSecondary,
            background: pageColorTokens.surfaceSubtle,
            border: `1px solid ${pageColorTokens.borderSubtle}`,
          }}
        >
          {t("bulkStatusEdit.publishCheckWarning", { count: publishCheckCount })}
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
          {t("bulkStatusEdit.appliedBanner", {
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
              <th style={headCellStyle}>{t("bulkStatusEdit.colProduct")}</th>
              <th style={headCellStyle}>{t("bulkStatusEdit.colInventory")}</th>
              <th style={headCellStyle}>{t("bulkStatusEdit.colChange")}</th>
              <th style={headCellStyle}>{t("bulkStatusEdit.colAction")}</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <BulkStatusEditRowCells key={row.productId} row={row} />
            ))}
          </tbody>
        </table>
      </div>

      {rows.length > visibleRows.length ? (
        <div style={{ fontSize: 12, color: pageColorTokens.textFootnote }}>
          {t("bulkStatusEdit.moreRowsHint", {
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
              downloadCsv(`bulk-status-edit-${shortId}.csv`, buildBulkStatusEditChangesetCsv(rows))
            }
          >
            {t("bulkStatusEdit.downloadChangeset")}
          </button>
          <button
            type="button"
            style={actionButtonStyle("secondary", changedRows.length === 0)}
            disabled={changedRows.length === 0}
            onClick={() =>
              downloadCsv(
                `bulk-status-edit-rollback-${shortId}.csv`,
                buildBulkStatusEditRollbackCsv(rows),
              )
            }
          >
            {t("bulkStatusEdit.downloadRollback")}
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {canApply && confirmingWrite ? (
            <>
              <span style={{ fontSize: 12, color: pageColorTokens.criticalText }}>
                {t("bulkStatusEdit.applyConfirmHint", { count: changedRows.length })}
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
                {applying ? t("bulkStatusEdit.applying") : t("bulkStatusEdit.applyConfirmButton")}
              </button>
            </>
          ) : canApply ? (
            <button
              type="button"
              style={actionButtonStyle("primary")}
              onClick={() => setConfirmingWrite(true)}
            >
              {t("bulkStatusEdit.applyButton", { count: changedRows.length })}
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

function BulkStatusEditRowCells({ row }: { row: BulkStatusEditRow }) {
  const { t } = useTranslation();
  return (
    <tr style={{ opacity: row.skipped ? 0.6 : 1 }}>
      <td style={{ ...cellStyle, fontWeight: 600 }} title={row.productTitle}>
        {row.productTitle}
      </td>
      <td style={{ ...cellStyle, whiteSpace: "nowrap" }}>
        {row.tracksInventory
          ? t("bulkStatusEdit.inventoryValue", { count: row.totalInventory })
          : t("bulkStatusEdit.inventoryUntracked")}
      </td>
      <td style={cellStyle}>
        {row.skipped ? (
          <StatusChip status={row.beforeStatus} />
        ) : (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <StatusChip status={row.beforeStatus} />
            <span style={{ color: pageColorTokens.textFootnote }}>→</span>
            <StatusChip status={row.afterStatus} />
            {row.needsPublishCheck ? (
              <span
                style={{ fontSize: 11, color: "#92400e" }}
                title={t("bulkStatusEdit.publishCheckCellTitle")}
              >
                {t("bulkStatusEdit.publishCheckCell")}
              </span>
            ) : null}
          </span>
        )}
      </td>
      <td style={{ ...cellStyle, whiteSpace: "nowrap" }}>
        {row.skipped ? (
          <span style={{ color: pageColorTokens.textFootnote }}>
            {t(`bulkStatusEdit.skipReason.${row.skipReason ?? "no_change"}`)}
          </span>
        ) : (
          <span style={{ color: pageColorTokens.brandGreenDeep, fontWeight: 700 }}>
            {t("bulkStatusEdit.actionChange")}
          </span>
        )}
      </td>
    </tr>
  );
}
