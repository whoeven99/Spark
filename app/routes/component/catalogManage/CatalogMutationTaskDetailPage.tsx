import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { pageColorTokens } from "../../page/pageUiStyles";
import { actionButtonStyle } from "../aiTask/AITaskCardShell";
import type { AITaskItem, AITaskStatus, CatalogBulkApplyResponse } from "../../../lib/aiTaskTypes";
import {
  CATALOG_REVIEW_VISIBLE_ROWS,
  catalogReviewCellStyle,
  catalogReviewHeadCellStyle,
  catalogReviewNoticeStyle,
  downloadCatalogCsv,
} from "./catalogReviewUi";

type ApplyOutcome = { succeeded: number; failed: number };

type Props<TRow> = {
  task: AITaskItem;
  onBack: () => void;
  showBackButton?: boolean;
  onTaskUpdated?: (
    taskId: string,
    status: AITaskStatus,
    result?: Record<string, unknown>,
  ) => void;
  onBusyChange?: (busy: boolean) => void;
  i18nPrefix: string;
  applyPath?: string;
  downloadOnly?: boolean;
  rows: TRow[];
  summaryChips: Array<{ label: string; value: number | string }>;
  truncated?: boolean;
  applied?: ApplyOutcome | null;
  extraNotices?: ReactNode;
  headers: string[];
  renderRow: (row: TRow) => ReactNode;
  rowKey: (row: TRow) => string;
  changesetCsv?: string;
  rollbackCsv?: string;
  extraCsv?: { filename: string; content: string; label: string };
  extraCsvs?: Array<{ filename: string; content: string; label: string }>;
  emptyNotice?: ReactNode;
  canApplyCount: number;
  applyConfirmHintVars?: Record<string, string | number>;
};

export function CatalogMutationTaskDetailPage<TRow>({
  task,
  onBack,
  showBackButton = true,
  onTaskUpdated,
  onBusyChange,
  i18nPrefix,
  applyPath,
  downloadOnly = false,
  rows,
  summaryChips,
  truncated,
  applied: appliedProp,
  extraNotices,
  headers,
  renderRow,
  rowKey,
  changesetCsv,
  rollbackCsv,
  extraCsv,
  extraCsvs,
  emptyNotice,
  canApplyCount,
  applyConfirmHintVars,
}: Props<TRow>) {
  const { t } = useTranslation();
  const [applying, setApplying] = useState(false);
  const [confirmingWrite, setConfirmingWrite] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<ApplyOutcome | null>(appliedProp ?? null);
  const shortId = task.id.slice(0, 8).toUpperCase();
  const visibleRows = useMemo(() => rows.slice(0, CATALOG_REVIEW_VISIBLE_ROWS), [rows]);
  const extraDownloads = [...(extraCsv ? [extraCsv] : []), ...(extraCsvs ?? [])];
  const canApply =
    !downloadOnly &&
    Boolean(applyPath) &&
    task.status === "pending_review" &&
    applied == null &&
    canApplyCount > 0;

  const handleApply = async () => {
    if (!applyPath) return;
    setApplying(true);
    onBusyChange?.(true);
    setError(null);
    try {
      const response = await fetch(applyPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: task.id, confirm: true }),
      });
      const json = (await response.json()) as CatalogBulkApplyResponse;
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
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t(`${i18nPrefix}.applyFailed`));
    } finally {
      setApplying(false);
      onBusyChange?.(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {showBackButton ? (
        <div>
          <button type="button" style={actionButtonStyle("subtle")} onClick={onBack}>
            {t("common.backToPrevious")}
          </button>
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {summaryChips.map((chip) => (
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

      {truncated ? (
        <div
          style={{
            ...catalogReviewNoticeStyle,
            color: "#92400e",
            background: "#fffbeb",
            border: "1px solid #fde68a",
          }}
        >
          {t(`${i18nPrefix}.truncatedWarning`)}
        </div>
      ) : null}

      {extraNotices}

      {applied ? (
        <div
          style={{
            ...catalogReviewNoticeStyle,
            fontSize: 13,
            fontWeight: 700,
            color: applied.failed > 0 ? "#92400e" : pageColorTokens.brandGreenDeep,
            background: applied.failed > 0 ? "#fffbeb" : pageColorTokens.brandGreenLight,
            border: `1px solid ${applied.failed > 0 ? "#fde68a" : "rgba(0, 128, 96, 0.2)"}`,
          }}
        >
          {t(`${i18nPrefix}.appliedBanner`, {
            succeeded: applied.succeeded,
            failed: applied.failed,
          })}
        </div>
      ) : null}

      {error ? (
        <div
          style={{
            ...catalogReviewNoticeStyle,
            color: pageColorTokens.criticalText,
            background: "#fff5f5",
            border: "1px solid #fcd5d5",
          }}
        >
          {error}
        </div>
      ) : null}

      {rows.length === 0 ? (
        emptyNotice ? (
          <div style={{ fontSize: 13, color: pageColorTokens.textSecondary, padding: "8px 0" }}>
            {emptyNotice}
          </div>
        ) : null
      ) : (
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
                {headers.map((header) => (
                  <th key={header} style={catalogReviewHeadCellStyle}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>{visibleRows.map((row) => <tr key={rowKey(row)}>{renderRow(row)}</tr>)}</tbody>
          </table>
        </div>
      )}

      {rows.length > visibleRows.length ? (
        <div style={{ fontSize: 12, color: pageColorTokens.textFootnote }}>
          {t(`${i18nPrefix}.moreRowsHint`, { shown: visibleRows.length, total: rows.length })}
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
          {changesetCsv ? (
            <button
              type="button"
              style={actionButtonStyle("secondary")}
              onClick={() => downloadCatalogCsv(`${i18nPrefix}-${shortId}.csv`, changesetCsv)}
            >
              {t(`${i18nPrefix}.downloadChangeset`)}
            </button>
          ) : null}
          {rollbackCsv ? (
            <button
              type="button"
              style={actionButtonStyle("secondary", canApplyCount === 0)}
              disabled={canApplyCount === 0}
              onClick={() =>
                downloadCatalogCsv(`${i18nPrefix}-rollback-${shortId}.csv`, rollbackCsv)
              }
            >
              {t(`${i18nPrefix}.downloadRollback`)}
            </button>
          ) : null}
          {extraDownloads.map((download) => (
            <button
              key={download.filename}
              type="button"
              style={actionButtonStyle("secondary")}
              onClick={() => downloadCatalogCsv(download.filename, download.content)}
            >
              {download.label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {canApply && confirmingWrite ? (
            <>
              <span style={{ fontSize: 12, color: pageColorTokens.criticalText }}>
                {t(`${i18nPrefix}.applyConfirmHint`, {
                  count: canApplyCount,
                  ...applyConfirmHintVars,
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
                {applying ? t(`${i18nPrefix}.applying`) : t(`${i18nPrefix}.applyConfirmButton`)}
              </button>
            </>
          ) : canApply ? (
            <button
              type="button"
              style={actionButtonStyle("primary")}
              onClick={() => setConfirmingWrite(true)}
            >
              {t(`${i18nPrefix}.applyButton`, { count: canApplyCount })}
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

export function catalogSkippedCell(text: string) {
  return (
    <td style={{ ...catalogReviewCellStyle, whiteSpace: "nowrap", color: pageColorTokens.textFootnote }}>
      {text}
    </td>
  );
}

export function catalogChangeCell(text: string) {
  return (
    <td style={{ ...catalogReviewCellStyle, whiteSpace: "nowrap", color: pageColorTokens.brandGreenDeep, fontWeight: 700 }}>
      {text}
    </td>
  );
}
