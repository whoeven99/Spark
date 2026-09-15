import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { pageColorTokens } from "../../page/pageUiStyles";
import { CatalogMutationTaskDetailPage } from "../catalogManage/CatalogMutationTaskDetailPage";
import { catalogReviewCellStyle } from "../catalogManage/catalogReviewUi";
import { SegmentedPageTabs } from "../shared/SegmentedPageTabs";
import {
  buildProductImportIssueCsv,
  coerceProductImportIssues,
  coerceProductImportOperations,
  collapseRepeatedImportIssues,
  filterActionableImportIssues,
  type ProductImportOperation,
} from "../../../lib/productImport";
import { type ProductImportCollectionGroup } from "../../../lib/productImportPlan";
import {
  flattenProductImportApplyErrors,
  flattenProductImportIssues,
  flattenProductImportPreview,
  type ProductImportPreviewRow,
} from "../../../lib/productImportPreview";
import {
  buildProductImportApplyErrorCsv,
  coerceProductImportApplyErrors,
  type ProductImportApplyFailCode,
} from "../../../lib/productImportApplyError";
import {
  coerceProductImportSheetPreview,
  type ProductImportSheetPreview,
} from "../../../lib/productImportSheetPreview";
import { ProductImportSheetPreviewView } from "./ProductImportSheetPreviewView";
import type {
  AITaskItem,
  AITaskStatus,
  ProductImportTaskConfig,
  ProductImportTaskResult,
} from "../../../lib/aiTaskTypes";
import { coerceBulkPriceEditRows } from "../../../lib/bulkPriceEdit";
import { coerceBulkCostEditRows } from "../../../lib/bulkCostEdit";
import { coerceBulkTagEditRows } from "../../../lib/bulkTagEdit";
import { coerceBulkStatusEditRows } from "../../../lib/bulkStatusEdit";
import { coerceBulkProductFieldEditRows } from "../../../lib/bulkProductFieldEdit";
import { coerceBulkHandleEditRows } from "../../../lib/bulkHandleEdit";
import { coerceBulkCollectionEditRows } from "../../../lib/bulkCollectionEdit";
import { coerceBulkMetafieldEditRows } from "../../../lib/bulkMetafieldEdit";
import { coerceProductDuplicateRows } from "../../../lib/productDuplicate";
import { coerceBulkArchiveRows } from "../../../lib/bulkArchive";
import { coerceBulkProductDeleteRows } from "../../../lib/bulkProductDelete";

type PreviewTab = "changes" | "issues" | "skips" | "failures";

type Props = {
  task: AITaskItem;
  onBack: () => void;
  showBackButton?: boolean;
  onTaskUpdated?: (
    taskId: string,
    status: AITaskStatus,
    result?: Record<string, unknown>,
  ) => void;
  onBusyChange?: (busy: boolean) => void;
};

function coerceProductImportApply(raw: unknown): ProductImportTaskResult["apply"] {
  if (!raw || typeof raw !== "object") return undefined;
  const record = raw as Record<string, unknown>;
  const errors = coerceProductImportApplyErrors(record.errors);
  return {
    at: typeof record.at === "string" ? record.at : "",
    succeeded: Number(record.succeeded) || 0,
    failed: Number(record.failed) || 0,
    ...(record.byOperation && typeof record.byOperation === "object"
      ? { byOperation: record.byOperation as NonNullable<ProductImportTaskResult["apply"]>["byOperation"] }
      : {}),
    ...(errors.length ? { errors } : {}),
  };
}

export function readProductImportResult(task: AITaskItem): ProductImportTaskResult | null {
  const raw = task.result;
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if (typeof record.fileName !== "string" || !record.summary || typeof record.summary !== "object") {
    return null;
  }
  const summary = record.summary as Record<string, unknown>;
  return {
    fileName: record.fileName,
    operations: coerceProductImportOperations(record.operations),
    issues: coerceProductImportIssues(record.issues),
    summary: {
      rows: Number(summary.rows) || 0,
      matched: Number(summary.matched) || 0,
      changed: Number(summary.changed) || 0,
      issues: Number(summary.issues) || 0,
      deletes: Number(summary.deletes) || 0,
      handles: Number(summary.handles) || 0,
    },
    priceRows: coerceBulkPriceEditRows(record.priceRows),
    costRows: coerceBulkCostEditRows(record.costRows),
    tagRows: coerceBulkTagEditRows(record.tagRows),
    statusRows: coerceBulkStatusEditRows(record.statusRows),
    fieldRows: coerceBulkProductFieldEditRows(record.fieldRows),
    handleRows: coerceBulkHandleEditRows(record.handleRows),
    collectionGroups: Array.isArray(record.collectionGroups)
      ? (record.collectionGroups as ProductImportCollectionGroup[]).map((group) => ({
          ...group,
          rows: coerceBulkCollectionEditRows(group.rows),
        }))
      : [],
    metafieldRows: coerceBulkMetafieldEditRows(record.metafieldRows),
    duplicateRows: coerceProductDuplicateRows(record.duplicateRows),
    archiveRows: coerceBulkArchiveRows(record.archiveRows),
    deleteRows: coerceBulkProductDeleteRows(record.deleteRows),
    truncated: record.truncated === true,
    ...(typeof record.changesetBlobPath === "string" ? { changesetBlobPath: record.changesetBlobPath } : {}),
    ...(typeof record.applyStartedAt === "string" ? { applyStartedAt: record.applyStartedAt } : {}),
    ...(record.apply && typeof record.apply === "object"
      ? { apply: coerceProductImportApply(record.apply) }
      : {}),
  };
}

export function readProductImportSheetPreview(task: AITaskItem): ProductImportSheetPreview | null {
  const raw = task.result;
  if (!raw || typeof raw !== "object") return null;
  return coerceProductImportSheetPreview((raw as Record<string, unknown>).sheetPreview);
}

export function readProductImportConfig(task: AITaskItem): ProductImportTaskConfig {
  const raw = task.config as Partial<ProductImportTaskConfig>;
  return {
    fileId: typeof raw.fileId === "string" ? raw.fileId : "",
    fileName: typeof raw.fileName === "string" ? raw.fileName : undefined,
    operations: coerceProductImportOperations(raw.operations),
  };
}

function operationLabel(
  operation: ProductImportOperation | "issue",
  t: (key: string, options?: Record<string, string>) => string,
): string {
  if (operation === "issue") return t("productImport.tabIssueOp");
  return t(`productImport.operation.${operation}`);
}

function fieldLabel(row: ProductImportPreviewRow, t: (key: string, options?: Record<string, string>) => string): string {
  if (row.operation === "issue") return row.field || "—";
  if (row.field === "compareAt") return t("productImport.field.compareAt");
  if (row.field === row.operation) return operationLabel(row.operation, t);
  return row.field || "—";
}

function skipReasonLabel(
  row: ProductImportPreviewRow,
  t: (key: string, options?: Record<string, string>) => string,
): string {
  if (!row.skipReason) return "";
  return t(`productImport.changeSkipReason.${row.skipReason}`, { defaultValue: row.skipReason });
}

function issueProblemLabel(
  row: ProductImportPreviewRow,
  t: (key: string, options?: Record<string, string>) => string,
): string {
  if (row.kind === "failure" && row.applyError) {
    const problem = t(`productImport.applyFail.${row.applyError.code}`, {
      defaultValue: row.applyError.message,
    });
    if (row.applyError.code === "shopify_user_error") return row.applyError.message;
    return problem;
  }
  if (row.kind !== "issue" || !row.issue) return skipReasonLabel(row, t) || "—";
  const problem = t(`productImport.issue.${row.issue.code}`, { defaultValue: row.issue.code });
  if (!row.issue.value) return problem;
  return t("productImport.issueWithValue", { problem, value: row.issue.value });
}

function applyFixLabel(
  code: ProductImportApplyFailCode | undefined,
  t: (key: string, options?: Record<string, string>) => string,
): string {
  if (!code) return "—";
  return t(`productImport.applyFix.${code}`, { defaultValue: "" }) || "—";
}

function isImportApplyInFlight(result: ProductImportTaskResult | null): boolean {
  if (!result?.applyStartedAt || result.apply) return false;
  const startedMs = new Date(result.applyStartedAt).getTime();
  return Number.isFinite(startedMs) && Date.now() - startedMs < 2 * 60 * 60 * 1000;
}

export function ProductImportTaskDetailPage(props: Props) {
  const { t } = useTranslation();
  const [deleteAcknowledged, setDeleteAcknowledged] = useState(false);
  const result = readProductImportResult(props.task);
  const [tab, setTab] = useState<PreviewTab>(
    result?.apply && result.apply.failed > 0 ? "failures" : "changes",
  );
  const failureRows = useMemo(
    () => flattenProductImportApplyErrors(result?.apply?.errors ?? []),
    [result],
  );
  const sheetPreview = readProductImportSheetPreview(props.task);
  const config = readProductImportConfig(props.task);
  const preview = useMemo(
    () => (result ? flattenProductImportPreview(result) : { changes: [], skips: [] }),
    [result],
  );
  const issueRows = useMemo(
    () => (result ? flattenProductImportIssues(filterActionableImportIssues(result.issues)) : []),
    [result],
  );
  const writable = result?.summary.changed ?? 0;
  const actionableIssueCount = issueRows.length;
  const hasResult = Boolean(result);
  const onTaskUpdatedRef = useRef(props.onTaskUpdated);
  const taskResultRef = useRef(props.task.result);
  onTaskUpdatedRef.current = props.onTaskUpdated;
  taskResultRef.current = props.task.result;

  useEffect(() => {
    if (props.task.status !== "pending_review" || !hasResult || writable > 0) return;
    const taskId = props.task.id;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/product-import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId, completeReview: true }),
        });
        const json = (await response.json()) as { ok?: boolean };
        if (cancelled || !json.ok) return;
        onTaskUpdatedRef.current?.(
          taskId,
          "succeeded",
          (taskResultRef.current ?? {}) as Record<string, unknown>,
        );
      } catch {
        // 保持 pending_review，商户关闭后再打开可重试
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.task.id, props.task.status, hasResult, writable]);
  useEffect(() => {
    if ((result?.apply?.failed ?? 0) > 0) setTab("failures");
  }, [result?.apply?.failed]);
  const deleteCount = result?.summary.deletes ?? 0;
  const handleCount = result?.summary.handles ?? 0;
    const fileName = result?.fileName || sheetPreview?.fileName || config.fileName || t("productImport.ruleLabel");
  const operations = result?.operations.length ? result.operations : config.operations;
  const failedCount = result?.apply?.failed ?? 0;
  const activeRows =
    tab === "changes"
      ? preview.changes
      : tab === "skips"
        ? preview.skips
        : tab === "failures"
          ? failureRows
          : issueRows;
  const running = props.task.status === "running" && !result;
  const showSheetPreview = running && Boolean(sheetPreview);
  const issueCsv =
    result && actionableIssueCount > 0
      ? buildProductImportIssueCsv(
          collapseRepeatedImportIssues(filterActionableImportIssues(result.issues)),
          (code) => t(`productImport.issue.${code}`, { defaultValue: code }),
          (code) => t(`productImport.fix.${code}`, { defaultValue: "" }),
        )
      : undefined;
  const applyErrorCsv =
    failureRows.length > 0
      ? buildProductImportApplyErrorCsv(
          result?.apply?.errors ?? [],
          (code, message) =>
            code === "shopify_user_error"
              ? message
              : t(`productImport.applyFail.${code}`, { defaultValue: message }),
          (code) => t(`productImport.applyFix.${code}`, { defaultValue: "" }),
        )
      : undefined;

  const emptyNotice = showSheetPreview
    ? null
    : running
      ? t("productImport.runningPreview")
      : tab === "changes"
        ? t("productImport.noChanges")
        : tab === "skips"
          ? t("productImport.noSkips")
          : tab === "failures"
            ? failedCount > 0 && failureRows.length === 0
              ? t("productImport.applyErrorsMissing", { count: failedCount })
              : t("productImport.noFailures")
            : t("productImport.noIssues");

  return (
    <CatalogMutationTaskDetailPage
      {...props}
      i18nPrefix="productImport"
      applyPath="/api/product-import"
      applyInFlight={isImportApplyInFlight(result)}
      rows={activeRows}
      truncated={result?.truncated}
      applied={
        result?.apply
          ? {
              succeeded: result.apply.succeeded,
              failed: result.apply.failed,
              ...(result.apply.errors?.length ? { errors: result.apply.errors } : {}),
            }
          : null
      }
      summaryChips={[
        { label: t("productImport.summaryRows"), value: result?.summary.rows ?? sheetPreview?.rowCount ?? "—" },
        { label: t("productImport.summaryMatched"), value: result?.summary.matched ?? "—" },
        { label: t("productImport.summaryChanged"), value: result?.summary.changed ?? writable },
        {
          label: t("productImport.summaryIssues"),
          value: result ? actionableIssueCount : (sheetPreview ? sheetPreview.issueCount : issueRows.length),
        },
      ]}
      extraNotices={
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 12, color: pageColorTokens.textSecondary }}>
            {t("productImport.sourceFile")} {fileName}
            {operations.length > 0
              ? ` · ${operations.map((operation) => t(`productImport.operation.${operation}`)).join("、")}`
              : null}
          </div>
          {result ? (
            <div style={{ fontSize: 12, color: pageColorTokens.textSecondary }}>
              {t("productImport.emptyCellsNotice")}
            </div>
          ) : null}
          {result && result.summary.changed > preview.changes.length ? (
            <div style={{ fontSize: 12, color: pageColorTokens.textSecondary }}>
              {t("productImport.reviewSampleHint", { count: result.summary.changed })}
            </div>
          ) : null}
          {handleCount > 0 ? (
            <div style={{ fontSize: 12, color: "#92400e" }}>{t("productImport.handleRedirectNotice")}</div>
          ) : null}
          {deleteCount > 0 ? (
            <div style={{ fontSize: 12, color: pageColorTokens.criticalText }}>
              {t("productImport.deleteWarning", { count: deleteCount })}
            </div>
          ) : null}
          {failedCount > 0 && failureRows.length === 0 ? (
            <div style={{ fontSize: 12, color: "#92400e" }}>
              {t("productImport.applyErrorsMissing", { count: failedCount })}
            </div>
          ) : null}
        </div>
      }
      beforeTable={
        result ? (
          <SegmentedPageTabs
            activeTab={tab}
            onTabChange={(next) => setTab(next as PreviewTab)}
            ariaLabel={t("productImport.previewTabsAria")}
            density="compact"
            items={[
              { key: "changes", label: t("productImport.tabChanges"), badgeCount: preview.changes.length },
              { key: "issues", label: t("productImport.tabIssues"), badgeCount: issueRows.length },
              { key: "skips", label: t("productImport.tabSkips"), badgeCount: preview.skips.length },
              ...(failedCount > 0
                ? [{ key: "failures", label: t("productImport.tabFailures"), badgeCount: failureRows.length || failedCount }]
                : []),
            ]}
          />
        ) : sheetPreview ? (
          <ProductImportSheetPreviewView
            preview={sheetPreview}
            matchingHint={running}
            density="compact"
          />
        ) : null
      }
      emptyNotice={emptyNotice}
      headers={
        tab === "changes"
          ? [
              t("productImport.colProduct"),
              t("productImport.colOperation"),
              t("productImport.colField"),
              t("productImport.colBefore"),
              t("productImport.colAfter"),
            ]
          : tab === "skips"
            ? [
                t("productImport.colProduct"),
                t("productImport.colOperation"),
                t("productImport.colField"),
                t("productImport.colBefore"),
                t("productImport.colAfter"),
                t("productImport.colProblem"),
              ]
            : tab === "failures"
              ? [
                  t("productImport.colProduct"),
                  t("productImport.colOperation"),
                  t("productImport.colField"),
                  t("productImport.colBefore"),
                  t("productImport.colAfter"),
                  t("productImport.colProblem"),
                  t("productImport.colFix"),
                ]
              : [
                  t("productImport.colProduct"),
                  t("productImport.colOperation"),
                  t("productImport.colField"),
                  t("productImport.colProblem"),
                  t("productImport.colFix"),
                ]
      }
      rowKey={(row: ProductImportPreviewRow) => row.key}
      renderRow={(row: ProductImportPreviewRow) =>
        tab === "issues" ? (
          <>
            <td style={{ ...catalogReviewCellStyle, fontWeight: 600 }}>{row.productTitle || "—"}</td>
            <td style={catalogReviewCellStyle}>{operationLabel(row.operation, t)}</td>
            <td style={catalogReviewCellStyle}>{fieldLabel(row, t)}</td>
            <td style={catalogReviewCellStyle}>{issueProblemLabel(row, t)}</td>
            <td style={catalogReviewCellStyle}>
              {row.issue ? t(`productImport.fix.${row.issue.code}`, { defaultValue: "" }) : "—"}
            </td>
          </>
        ) : (
          <>
            <td style={{ ...catalogReviewCellStyle, fontWeight: 600 }}>{row.productTitle || "—"}</td>
            <td style={catalogReviewCellStyle}>{operationLabel(row.operation, t)}</td>
            <td style={catalogReviewCellStyle}>{fieldLabel(row, t)}</td>
            <td
              style={{
                ...catalogReviewCellStyle,
                ...(row.beforeValue
                  ? { color: pageColorTokens.textSecondary, textDecoration: "line-through" }
                  : {}),
              }}
            >
              {row.beforeValue || "—"}
            </td>
            <td
              style={{
                ...catalogReviewCellStyle,
                fontWeight: 700,
                color:
                  row.operation === "delete" || tab === "failures"
                    ? pageColorTokens.criticalText
                    : pageColorTokens.brandGreenDeep,
              }}
            >
              {row.operation === "delete" && !row.afterValue
                ? t("productImport.willDelete")
                : row.afterValue || "—"}
            </td>
            {tab === "skips" ? (
              <td style={catalogReviewCellStyle}>{skipReasonLabel(row, t) || "—"}</td>
            ) : null}
            {tab === "failures" ? (
              <>
                <td style={catalogReviewCellStyle}>{issueProblemLabel(row, t)}</td>
                <td style={catalogReviewCellStyle}>{applyFixLabel(row.applyError?.code, t)}</td>
              </>
            ) : null}
          </>
        )
      }
      extraCsv={
        issueCsv
          ? {
              filename: `product-import-issues-${props.task.id.slice(0, 8)}.csv`,
              content: issueCsv,
              label: t("productImport.downloadIssues"),
            }
          : undefined
      }
      extraCsvs={
        applyErrorCsv
          ? [
              {
                filename: `product-import-failures-${props.task.id.slice(0, 8)}.csv`,
                content: applyErrorCsv,
                label: t("productImport.downloadApplyErrors"),
              },
            ]
          : undefined
      }
      moreRowsTotal={tab === "changes" ? writable : undefined}
      moreRowsHintKey={tab === "changes" ? "reviewSampleFooter" : undefined}
      canApplyCount={writable}
      applyExtraBody={deleteCount > 0 && deleteAcknowledged ? { confirmDelete: true } : undefined}
      confirmBlocked={deleteCount > 0 && !deleteAcknowledged}
      confirmSlot={
        deleteCount > 0 ? (
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: pageColorTokens.criticalText }}>
            <input
              type="checkbox"
              checked={deleteAcknowledged}
              onChange={(event) => setDeleteAcknowledged(event.target.checked)}
            />
            {t("productImport.deleteConfirmCheckbox", { count: deleteCount })}
          </label>
        ) : null
      }
    />
  );
}
