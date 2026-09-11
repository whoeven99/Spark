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
  type ProductImportOperation,
} from "../../../lib/productImport";
import { countImportWritable, type ProductImportCollectionGroup } from "../../../lib/productImportPlan";
import {
  flattenProductImportIssues,
  flattenProductImportPreview,
  type ProductImportPreviewRow,
} from "../../../lib/productImportPreview";
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
import { coerceBulkProductDeleteRows, countWritableProductDeletes } from "../../../lib/bulkProductDelete";

type PreviewTab = "changes" | "issues";

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
    ...(record.apply && typeof record.apply === "object"
      ? { apply: record.apply as ProductImportTaskResult["apply"] }
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

export function ProductImportTaskDetailPage(props: Props) {
  const { t } = useTranslation();
  const [deleteAcknowledged, setDeleteAcknowledged] = useState(false);
  const [tab, setTab] = useState<PreviewTab>("changes");
  const result = readProductImportResult(props.task);
  const sheetPreview = readProductImportSheetPreview(props.task);
  const config = readProductImportConfig(props.task);
  const preview = useMemo(
    () => (result ? flattenProductImportPreview(result) : { changes: [], skips: [] }),
    [result],
  );
  const issueRows = useMemo(
    () => (result ? flattenProductImportIssues(result.issues) : []),
    [result],
  );
  const issueAndSkipRows = useMemo(() => [...issueRows, ...preview.skips], [issueRows, preview.skips]);
  const writable = result ? countImportWritable(result) : 0;
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
  const deleteCount = result ? countWritableProductDeletes(result.deleteRows) : 0;
  const handleCount = result ? result.handleRows.filter((row) => !row.skipped).length : 0;
    const fileName = result?.fileName || sheetPreview?.fileName || config.fileName || t("productImport.ruleLabel");
  const operations = result?.operations.length ? result.operations : config.operations;
  const activeRows = tab === "changes" ? preview.changes : issueAndSkipRows;
  const running = props.task.status === "running" && !result;
  const showSheetPreview = running && Boolean(sheetPreview);
  const issueCsv =
    result && result.issues.length > 0
      ? buildProductImportIssueCsv(
          result.issues,
          (code) => t(`productImport.issue.${code}`, { defaultValue: code }),
          (code) => t(`productImport.fix.${code}`, { defaultValue: "" }),
        )
      : undefined;

  const emptyNotice = showSheetPreview
    ? null
    : running
      ? t("productImport.runningPreview")
      : tab === "changes"
        ? t("productImport.noChanges")
        : t("productImport.noIssues");

  return (
    <CatalogMutationTaskDetailPage
      {...props}
      i18nPrefix="productImport"
      applyPath="/api/product-import"
      rows={activeRows}
      truncated={result?.truncated}
      applied={result?.apply ? { succeeded: result.apply.succeeded, failed: result.apply.failed } : null}
      summaryChips={[
        { label: t("productImport.summaryRows"), value: result?.summary.rows ?? sheetPreview?.rowCount ?? "—" },
        { label: t("productImport.summaryMatched"), value: result?.summary.matched ?? "—" },
        { label: t("productImport.summaryChanged"), value: result?.summary.changed ?? writable },
        {
          label: t("productImport.summaryIssues"),
          value: result?.summary.issues ?? (sheetPreview ? sheetPreview.issueCount : issueAndSkipRows.length),
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
          {handleCount > 0 ? (
            <div style={{ fontSize: 12, color: "#92400e" }}>{t("productImport.handleRedirectNotice")}</div>
          ) : null}
          {deleteCount > 0 ? (
            <div style={{ fontSize: 12, color: pageColorTokens.criticalText }}>
              {t("productImport.deleteWarning", { count: deleteCount })}
            </div>
          ) : null}
        </div>
      }
      beforeTable={
        result ? (
          <SegmentedPageTabs
            activeTab={tab}
            onTabChange={setTab}
            ariaLabel={t("productImport.previewTabsAria")}
            density="compact"
            items={[
              { key: "changes", label: t("productImport.tabChanges"), badgeCount: preview.changes.length },
              { key: "issues", label: t("productImport.tabIssues"), badgeCount: issueAndSkipRows.length },
            ]}
          />
        ) : sheetPreview ? (
          <ProductImportSheetPreviewView preview={sheetPreview} matchingHint={running} />
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
        tab === "changes" ? (
          <>
            <td style={{ ...catalogReviewCellStyle, fontWeight: 600 }}>{row.productTitle || "—"}</td>
            <td style={catalogReviewCellStyle}>{operationLabel(row.operation, t)}</td>
            <td style={catalogReviewCellStyle}>{fieldLabel(row, t)}</td>
            <td style={catalogReviewCellStyle}>{row.beforeValue || "—"}</td>
            <td style={{ ...catalogReviewCellStyle, fontWeight: 700, color: pageColorTokens.brandGreenDeep }}>
              {row.afterValue || "—"}
            </td>
          </>
        ) : (
          <>
            <td style={{ ...catalogReviewCellStyle, fontWeight: 600 }}>{row.productTitle || "—"}</td>
            <td style={catalogReviewCellStyle}>{operationLabel(row.operation, t)}</td>
            <td style={catalogReviewCellStyle}>{fieldLabel(row, t)}</td>
            <td style={catalogReviewCellStyle}>
              {row.kind === "issue" && row.issue
                ? t(`productImport.issue.${row.issue.code}`, { defaultValue: row.issue.code })
                : skipReasonLabel(row, t) || "—"}
            </td>
            <td style={catalogReviewCellStyle}>
              {row.kind === "issue" && row.issue
                ? t(`productImport.fix.${row.issue.code}`, { defaultValue: "" })
                : "—"}
            </td>
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
