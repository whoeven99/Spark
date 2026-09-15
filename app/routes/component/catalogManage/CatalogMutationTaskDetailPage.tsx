import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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

type ApplyError = { productId?: string; message: string };
type ApplyOutcome = { succeeded: number; failed: number; errors?: ApplyError[] };

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
  beforeTable?: ReactNode;
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
  applyExtraBody?: Record<string, unknown>;
  confirmSlot?: ReactNode;
  confirmBlocked?: boolean;
  applyInFlight?: boolean;
  moreRowsTotal?: number;
  moreRowsHintKey?: string;
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
  beforeTable,
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
  applyExtraBody,
  confirmSlot,
  confirmBlocked = false,
  applyInFlight = false,
  moreRowsTotal,
  moreRowsHintKey = "moreRowsHint",
}: Props<TRow>) {
  const { t } = useTranslation();
  const [applying, setApplying] = useState(applyInFlight);
  const [confirmingWrite, setConfirmingWrite] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<ApplyOutcome | null>(appliedProp ?? null);
  const [queuedApply, setQueuedApply] = useState(false);
  const onTaskUpdatedRef = useRef(onTaskUpdated);
  onTaskUpdatedRef.current = onTaskUpdated;
  const shortId = task.id.slice(0, 8).toUpperCase();
  const visibleRows = useMemo(() => rows.slice(0, CATALOG_REVIEW_VISIBLE_ROWS), [rows]);
  const moreRowsHintTotal = moreRowsTotal ?? rows.length;
  const extraDownloads = [...(extraCsv ? [extraCsv] : []), ...(extraCsvs ?? [])];
  const watchQueuedApply = applyInFlight || queuedApply;
  const writeInFlight = applying || (watchQueuedApply && applied == null);
  const canApply =
    !downloadOnly &&
    Boolean(applyPath) &&
    task.status === "pending_review" &&
    applied == null &&
    canApplyCount > 0 &&
    !writeInFlight;

  useEffect(() => {
    if (appliedProp) setApplied(appliedProp);
  }, [appliedProp]);

  useEffect(() => {
    if (!watchQueuedApply || applied) return;
    setApplying(true);
    onBusyChange?.(true);
  }, [watchQueuedApply, applied, onBusyChange]);

  useEffect(() => {
    if (applied || !watchQueuedApply) return;
    let cancelled = false;
    let sawStarted = false;
    const begun = Date.now();
    const poll = async () => {
      try {
        const response = await fetch(`/api/ai-task/${task.id}`);
        const json = (await response.json()) as { task?: AITaskItem };
        if (cancelled || !json.task) return;
        const next = json.task;
        onTaskUpdatedRef.current?.(next.id, next.status, next.result ?? undefined);
        if (next.status === "applied") {
          const rawApply = next.result?.apply;
          if (rawApply && typeof rawApply === "object") {
            const record = rawApply as Record<string, unknown>;
            setApplied({
              succeeded: Number(record.succeeded) || 0,
              failed: Number(record.failed) || 0,
              ...(Array.isArray(record.errors) ? { errors: record.errors as ApplyError[] } : {}),
            });
          }
          setApplying(false);
          setQueuedApply(false);
          onBusyChange?.(false);
          return;
        }
        if (next.status === "failed") {
          setError(next.errorMsg || t(`${i18nPrefix}.applyFailed`));
          setApplying(false);
          setQueuedApply(false);
          onBusyChange?.(false);
          return;
        }
        const started = typeof next.result?.applyStartedAt === "string";
        const hasApply = Boolean(next.result?.apply && typeof next.result.apply === "object");
        if (started) sawStarted = true;
        if (
          next.status === "pending_review" &&
          !hasApply &&
          ((sawStarted && !started) || (!started && Date.now() - begun > 20_000))
        ) {
          setError(t(`${i18nPrefix}.applyFailed`));
          setApplying(false);
          setQueuedApply(false);
          onBusyChange?.(false);
        }
      } catch {
        // 瞬时读任务失败时继续轮询
      }
    };
    const timer = window.setInterval(() => void poll(), 2000);
    void poll();
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [applied, watchQueuedApply, applyInFlight, task.id, t, i18nPrefix, onBusyChange]);

  const handleApply = async () => {
    if (!applyPath) return;
    setApplying(true);
    onBusyChange?.(true);
    setError(null);
    let queued = false;
    try {
      const response = await fetch(applyPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: task.id, confirm: true, ...applyExtraBody }),
      });
      const json = (await response.json()) as CatalogBulkApplyResponse;
      if (!json.ok) {
        setError(json.error);
        return;
      }
      if ("queued" in json && json.queued === true) {
        queued = true;
        setQueuedApply(true);
        setConfirmingWrite(false);
        onTaskUpdatedRef.current?.(task.id, "pending_review", {
          ...(task.result ?? {}),
          applyStartedAt: new Date().toISOString(),
        });
        return;
      }
      if (!("succeeded" in json)) {
        setError(t(`${i18nPrefix}.applyFailed`));
        return;
      }
      const errors = json.errors;
      const outcome: ApplyOutcome = {
        succeeded: json.succeeded,
        failed: json.failed,
        ...(errors?.length ? { errors } : {}),
      };
      setApplied(outcome);
      setConfirmingWrite(false);
      onTaskUpdatedRef.current?.(task.id, "applied", {
        ...(task.result ?? {}),
        apply: { at: new Date().toISOString(), ...outcome },
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t(`${i18nPrefix}.applyFailed`));
    } finally {
      if (!queued) {
        setApplying(false);
        onBusyChange?.(false);
      }
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
          {applied.errors?.length ? (
            <div style={{ marginTop: 8, fontWeight: 500, fontSize: 12, display: "flex", flexDirection: "column", gap: 4 }}>
              {applied.errors.slice(0, 5).map((item, index) => (
                <div key={`${item.productId ?? "err"}-${index}`}>{item.message}</div>
              ))}
              {applied.errors.length > 5
                ? t(`${i18nPrefix}.appliedErrorMore`, {
                    count: applied.errors.length - 5,
                    defaultValue: `+${applied.errors.length - 5}`,
                  })
                : null}
            </div>
          ) : null}
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

      {beforeTable}

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

      {rows.length > 0 && moreRowsHintTotal > visibleRows.length ? (
        <div style={{ fontSize: 12, color: pageColorTokens.textFootnote }}>
          {t(`${i18nPrefix}.${moreRowsHintKey}`, {
            shown: visibleRows.length,
            total: moreRowsHintTotal,
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
          {writeInFlight && !applied ? (
            <button type="button" style={actionButtonStyle("primary", true)} disabled>
              {t(`${i18nPrefix}.applying`)}
            </button>
          ) : canApply && confirmingWrite ? (
            <>
              {confirmSlot}
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
                style={actionButtonStyle("primary", applying || confirmBlocked)}
                disabled={applying || confirmBlocked}
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
