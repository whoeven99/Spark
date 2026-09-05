/**
 * 批量入 / 出 Collection 审核详情 —— 验收与写回入口。
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
  buildBulkCollectionEditChangesetCsv,
  buildBulkCollectionEditRollbackCsv,
  type BulkCollectionEditRow,
  type BulkCollectionEditSummary,
} from "../../../lib/bulkCollectionEdit";
import type {
  AITaskItem,
  AITaskStatus,
  BulkCollectionEditApplyResponse,
  BulkCollectionEditTaskResult,
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

export function readBulkCollectionEditResult(
  task: AITaskItem,
): BulkCollectionEditTaskResult | null {
  const raw = task.result;
  if (!raw || !Array.isArray(raw.rows)) return null;
  return raw as unknown as BulkCollectionEditTaskResult;
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

const warningNoticeStyle = {
  ...noticeStyle,
  color: "#92400e",
  background: "#fffbeb",
  border: "1px solid #fde68a",
};

const membershipChipBase = {
  display: "inline-block",
  borderRadius: 999,
  padding: "1px 8px",
  fontSize: 11,
  lineHeight: 1.6,
  fontWeight: 600,
  whiteSpace: "nowrap" as const,
};

function MembershipChip({ inCollection }: { inCollection: boolean }) {
  const { t } = useTranslation();
  return (
    <span
      style={
        inCollection
          ? {
              ...membershipChipBase,
              background: pageColorTokens.brandGreenLight,
              border: "1px solid rgba(0, 128, 96, 0.2)",
              color: pageColorTokens.brandGreenDeep,
            }
          : {
              ...membershipChipBase,
              background: pageColorTokens.surfaceSubtle,
              border: `1px solid ${pageColorTokens.borderSubtle}`,
              color: pageColorTokens.textSecondary,
            }
      }
    >
      {t(inCollection ? "bulkCollectionEdit.memberIn" : "bulkCollectionEdit.memberOut")}
    </span>
  );
}

function SummaryChips({ summary }: { summary: BulkCollectionEditSummary }) {
  const { t } = useTranslation();
  const chips = [
    { label: t("bulkCollectionEdit.summaryProducts"), value: summary.products },
    { label: t("bulkCollectionEdit.summaryAdded"), value: summary.added },
    { label: t("bulkCollectionEdit.summaryRemoved"), value: summary.removed },
    { label: t("bulkCollectionEdit.summarySkipped"), value: summary.skipped },
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

export function BulkCollectionEditTaskDetailPage({
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

  const result = readBulkCollectionEditResult(task);
  const [applied, setApplied] = useState<{
    succeeded: number;
    failed: number;
    pendingJob: boolean;
  } | null>(
    result?.apply
      ? {
          succeeded: result.apply.succeeded,
          failed: result.apply.failed,
          pendingJob: result.apply.pendingJob === true,
        }
      : null,
  );

  const shortId = task.id.slice(0, 8).toUpperCase();
  const resultRows = result?.rows;
  const rows = useMemo(() => resultRows ?? [], [resultRows]);
  const changedRows = useMemo(() => rows.filter((row) => !row.skipped), [rows]);
  const removeCount = useMemo(
    () => changedRows.filter((row) => !row.afterInCollection).length,
    [changedRows],
  );
  const visibleRows = rows.slice(0, VISIBLE_ROWS);
  const collection = useMemo(
    () => ({ id: result?.collectionId ?? "", title: result?.collectionTitle ?? "" }),
    [result?.collectionId, result?.collectionTitle],
  );

  const handleApply = async () => {
    setApplying(true);
    onBusyChange?.(true);
    setError(null);
    try {
      const response = await fetch("/api/bulk-collection-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: task.id, confirm: true }),
      });
      const json = (await response.json()) as BulkCollectionEditApplyResponse;
      if (!json.ok) {
        setError(json.error);
        return;
      }
      const outcome = {
        succeeded: json.succeeded,
        failed: json.failed,
        pendingJob: json.pendingJob,
      };
      setApplied(outcome);
      setConfirmingWrite(false);
      onTaskUpdated?.(task.id, "applied", {
        ...(task.result ?? {}),
        apply: { at: new Date().toISOString(), ...outcome, errors: [] },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("bulkCollectionEdit.applyFailed"));
    } finally {
      setApplying(false);
      onBusyChange?.(false);
    }
  };

  if (!result) {
    return (
      <div style={{ fontSize: 13, color: pageColorTokens.textSecondary, padding: "24px 0" }}>
        {t("bulkCollectionEdit.noChangeset")}
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

      <div style={{ fontSize: 13, color: pageColorTokens.textPrimary }}>
        {t("bulkCollectionEdit.targetCollection", { collection: collection.title })}
      </div>

      <SummaryChips summary={result.summary} />

      {result.truncated ? (
        <div style={warningNoticeStyle}>{t("bulkCollectionEdit.truncatedWarning")}</div>
      ) : null}

      {removeCount > 0 && !applied ? (
        <div style={warningNoticeStyle}>
          {t("bulkCollectionEdit.removeWarning", {
            count: removeCount,
            collection: collection.title,
          })}
        </div>
      ) : null}

      {applied ? (
        <div
          style={{
            ...noticeStyle,
            fontSize: 13,
            fontWeight: 700,
            color:
              applied.failed > 0 || applied.pendingJob
                ? "#92400e"
                : pageColorTokens.brandGreenDeep,
            background:
              applied.failed > 0 || applied.pendingJob
                ? "#fffbeb"
                : pageColorTokens.brandGreenLight,
            border: `1px solid ${
              applied.failed > 0 || applied.pendingJob ? "#fde68a" : "rgba(0, 128, 96, 0.2)"
            }`,
          }}
        >
          {t("bulkCollectionEdit.appliedBanner", {
            succeeded: applied.succeeded,
            failed: applied.failed,
          })}
          {applied.pendingJob ? ` ${t("bulkCollectionEdit.pendingJobHint")}` : ""}
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
              <th style={headCellStyle}>{t("bulkCollectionEdit.colProduct")}</th>
              <th style={headCellStyle}>{t("bulkCollectionEdit.colStatus")}</th>
              <th style={headCellStyle}>{t("bulkCollectionEdit.colChange")}</th>
              <th style={headCellStyle}>{t("bulkCollectionEdit.colAction")}</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <BulkCollectionEditRowCells key={row.productId} row={row} />
            ))}
          </tbody>
        </table>
      </div>

      {rows.length > visibleRows.length ? (
        <div style={{ fontSize: 12, color: pageColorTokens.textFootnote }}>
          {t("bulkCollectionEdit.moreRowsHint", {
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
                `bulk-collection-edit-${shortId}.csv`,
                buildBulkCollectionEditChangesetCsv(rows, collection),
              )
            }
          >
            {t("bulkCollectionEdit.downloadChangeset")}
          </button>
          <button
            type="button"
            style={actionButtonStyle("secondary", changedRows.length === 0)}
            disabled={changedRows.length === 0}
            onClick={() =>
              downloadCsv(
                `bulk-collection-edit-rollback-${shortId}.csv`,
                buildBulkCollectionEditRollbackCsv(rows, collection),
              )
            }
          >
            {t("bulkCollectionEdit.downloadRollback")}
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {canApply && confirmingWrite ? (
            <>
              <span style={{ fontSize: 12, color: pageColorTokens.criticalText }}>
                {t("bulkCollectionEdit.applyConfirmHint", {
                  count: changedRows.length,
                  collection: collection.title,
                })}
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
                  ? t("bulkCollectionEdit.applying")
                  : t("bulkCollectionEdit.applyConfirmButton")}
              </button>
            </>
          ) : canApply ? (
            <button
              type="button"
              style={actionButtonStyle("primary")}
              onClick={() => setConfirmingWrite(true)}
            >
              {t("bulkCollectionEdit.applyButton", { count: changedRows.length })}
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

function BulkCollectionEditRowCells({ row }: { row: BulkCollectionEditRow }) {
  const { t } = useTranslation();
  return (
    <tr style={{ opacity: row.skipped ? 0.6 : 1 }}>
      <td style={{ ...cellStyle, fontWeight: 600 }} title={row.productTitle}>
        {row.productTitle}
      </td>
      <td style={{ ...cellStyle, whiteSpace: "nowrap" }}>
        {t(`bulkCollectionEdit.productStatus.${row.status}`, { defaultValue: row.status || "—" })}
      </td>
      <td style={cellStyle}>
        {row.skipped ? (
          <MembershipChip inCollection={row.beforeInCollection} />
        ) : (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <MembershipChip inCollection={row.beforeInCollection} />
            <span style={{ color: pageColorTokens.textFootnote }}>→</span>
            <MembershipChip inCollection={row.afterInCollection} />
          </span>
        )}
      </td>
      <td style={{ ...cellStyle, whiteSpace: "nowrap" }}>
        {row.skipped ? (
          <span style={{ color: pageColorTokens.textFootnote }}>
            {t(`bulkCollectionEdit.skipReason.${row.skipReason ?? "already_in"}`)}
          </span>
        ) : (
          <span style={{ color: pageColorTokens.brandGreenDeep, fontWeight: 700 }}>
            {t(
              row.afterInCollection
                ? "bulkCollectionEdit.actionAdd"
                : "bulkCollectionEdit.actionRemove",
            )}
          </span>
        )}
      </td>
    </tr>
  );
}
