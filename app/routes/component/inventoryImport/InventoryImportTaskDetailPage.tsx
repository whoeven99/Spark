import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { pageColorTokens } from "../../page/pageUiStyles";
import { CatalogMutationTaskDetailPage } from "../catalogManage/CatalogMutationTaskDetailPage";
import { catalogReviewCellStyle } from "../catalogManage/catalogReviewUi";
import { SegmentedPageTabs } from "../shared/SegmentedPageTabs";
import {
  buildInventoryImportChangesetCsv,
  buildInventoryImportRollbackCsv,
  coerceInventoryImportIssues,
  coerceInventoryImportRows,
  type InventoryImportIssue,
  type InventoryImportRow,
} from "../../../lib/inventoryImport";
import { coerceInventoryImportSheetPreview } from "../../../lib/inventoryImportSheetPreview";
import type {
  AITaskItem,
  AITaskStatus,
  InventoryImportTaskResult,
} from "../../../lib/aiTaskTypes";

type PreviewTab = "changes" | "issues" | "skips" | "failures";
type InventoryImportReviewRow =
  | InventoryImportRow
  | InventoryImportIssue
  | { variantId: string; locationId: string; message: string };

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

export function readInventoryImportResult(task: AITaskItem): InventoryImportTaskResult | null {
  const raw = task.result;
  if (!raw || !Array.isArray(raw.rows)) return null;
  return {
    ...(raw as unknown as InventoryImportTaskResult),
    rows: coerceInventoryImportRows(raw.rows),
    issues: coerceInventoryImportIssues(raw.issues),
    sheetPreview: coerceInventoryImportSheetPreview(raw.sheetPreview) ?? undefined,
  };
}

export function InventoryImportTaskDetailPage(props: Props) {
  const { t } = useTranslation();
  const result = readInventoryImportResult(props.task);
  const rows = result?.rows ?? [];
  const issues = result?.issues ?? [];
  const changed = rows.filter((row) => !row.skipped);
  const skipped = rows.filter((row) => row.skipped);
  const failures = result?.apply?.errors ?? [];
  const [tab, setTab] = useState<PreviewTab>("changes");
  const running = props.task.status === "running" && !result;
  useEffect(() => {
    if ((result?.apply?.failed ?? 0) > 0) setTab("failures");
  }, [result?.apply?.failed]);

  const activeRows: InventoryImportReviewRow[] = useMemo(() => {
    if (tab === "issues") return issues;
    if (tab === "skips") return skipped;
    if (tab === "failures") return failures;
    return changed;
  }, [tab, issues, skipped, failures, changed]);

  const emptyNotice = running
    ? t("inventoryImport.runningPreview")
    : tab === "changes"
      ? t("inventoryImport.noChanges")
      : tab === "skips"
        ? t("inventoryImport.noSkips")
        : tab === "failures"
          ? t("inventoryImport.noFailures")
          : t("inventoryImport.noIssues");

  return (
    <CatalogMutationTaskDetailPage
      {...props}
      i18nPrefix="inventoryImport"
      applyPath="/api/inventory-import"
      rows={activeRows}
      truncated={result?.truncated}
      applied={result?.apply ?? null}
      moreRowsTotal={
        tab === "changes"
          ? changed.length
          : tab === "skips"
            ? skipped.length
            : tab === "issues"
              ? issues.length
              : failures.length
      }
      summaryChips={[
        { label: t("inventoryImport.summarySheetRows"), value: result?.summary.rows ?? 0 },
        { label: t("inventoryImport.summaryChanged"), value: result?.summary.changed ?? 0 },
        { label: t("inventoryImport.summaryIssues"), value: result?.summary.issues ?? 0 },
      ]}
      extraNotices={
        <div style={{ fontSize: 12, color: pageColorTokens.textSecondary }}>
          {t("inventoryImport.scopeHint")}
        </div>
      }
      beforeTable={
        result ? (
          <SegmentedPageTabs
            activeTab={tab}
            onTabChange={(next) => setTab(next as PreviewTab)}
            ariaLabel={t("inventoryImport.previewTabsAria")}
            density="compact"
            items={[
              { key: "changes", label: t("inventoryImport.tabChanges"), badgeCount: changed.length },
              { key: "issues", label: t("inventoryImport.tabIssues"), badgeCount: issues.length },
              { key: "skips", label: t("inventoryImport.tabSkips"), badgeCount: skipped.length },
              ...(failures.length > 0
                ? [{ key: "failures", label: t("inventoryImport.tabFailures"), badgeCount: failures.length }]
                : []),
            ]}
          />
        ) : null
      }
      headers={
        tab === "issues"
          ? [
              t("inventoryImport.colRow"),
              t("inventoryImport.colProduct"),
              t("inventoryImport.colProblem"),
              t("inventoryImport.colFix"),
            ]
          : tab === "failures"
            ? [
                t("inventoryImport.colProduct"),
                t("inventoryImport.colSku"),
                t("inventoryImport.colLocation"),
                t("inventoryImport.colProblem"),
              ]
            : [
                t("inventoryImport.colProduct"),
                t("inventoryImport.colVariant"),
                t("inventoryImport.colSku"),
                t("inventoryImport.colLocation"),
                t("inventoryImport.colOnHand"),
                t("inventoryImport.colAction"),
              ]
      }
      rowKey={(row: InventoryImportReviewRow) => inventoryImportRowKey(row, tab)}
      renderRow={(row: InventoryImportReviewRow) =>
        renderInventoryImportRow(row, tab, changed.concat(skipped), t)
      }
      changesetCsv={rows.length > 0 ? buildInventoryImportChangesetCsv(rows) : undefined}
      rollbackCsv={changed.length > 0 ? buildInventoryImportRollbackCsv(rows) : undefined}
      emptyNotice={emptyNotice}
      canApplyCount={changed.length}
    />
  );
}

function inventoryImportRowKey(row: InventoryImportReviewRow, tab: PreviewTab): string {
  if (tab === "issues") {
    const issue = row as InventoryImportIssue;
    return `issue:${issue.rowNumber}:${issue.code}:${issue.value ?? ""}`;
  }
  if (tab === "failures") {
    const error = row as { variantId: string; locationId: string; message: string };
    return `fail:${error.variantId}:${error.locationId}:${error.message}`;
  }
  const item = row as InventoryImportRow;
  return `${item.variantId}:${item.locationId}:${item.rowNumber}`;
}

function renderInventoryImportRow(
  row: InventoryImportReviewRow,
  tab: PreviewTab,
  matchedRows: InventoryImportRow[],
  t: (key: string, options?: Record<string, string | number>) => string,
) {
  if (tab === "issues") {
    const issue = row as InventoryImportIssue;
    return (
      <>
        <td style={catalogReviewCellStyle}>{issue.rowNumber || "—"}</td>
        <td style={{ ...catalogReviewCellStyle, fontWeight: 600 }}>{issue.productTitle || "—"}</td>
        <td style={catalogReviewCellStyle}>
          {issue.value
            ? t("inventoryImport.issueWithValue", {
                problem: t(`inventoryImport.issue.${issue.code}`, { defaultValue: issue.code }),
                value: issue.value,
              })
            : t(`inventoryImport.issue.${issue.code}`, { defaultValue: issue.code })}
        </td>
        <td style={catalogReviewCellStyle}>
          {t(`inventoryImport.fix.${issue.code}`, { defaultValue: "" }) || "—"}
        </td>
      </>
    );
  }
  if (tab === "failures") {
    const error = row as { variantId: string; locationId: string; message: string };
    const matched = matchedRows.find(
      (item) => item.variantId === error.variantId && item.locationId === error.locationId,
    );
    return (
      <>
        <td style={catalogReviewCellStyle}>{matched?.productTitle || error.variantId}</td>
        <td style={catalogReviewCellStyle}>{matched?.sku || "—"}</td>
        <td style={catalogReviewCellStyle}>{matched?.locationName || error.locationId}</td>
        <td style={catalogReviewCellStyle}>{error.message}</td>
      </>
    );
  }
  const item = row as InventoryImportRow;
  return (
    <>
      <td style={catalogReviewCellStyle}>{item.productTitle}</td>
      <td style={catalogReviewCellStyle}>{item.variantTitle || "—"}</td>
      <td style={catalogReviewCellStyle}>{item.sku || "—"}</td>
      <td style={catalogReviewCellStyle}>{item.locationName}</td>
      <td style={catalogReviewCellStyle}>
        {item.skipped ? (
          item.beforeOnHand
        ) : (
          <>
            <span style={{ color: pageColorTokens.textFootnote }}>{item.beforeOnHand}</span>
            <span style={{ margin: "0 6px" }}>→</span>
            <strong>{item.afterOnHand}</strong>
          </>
        )}
      </td>
      <td style={catalogReviewCellStyle}>
        {item.skipped ? (
          <span style={{ color: pageColorTokens.textFootnote }}>
            {t(`inventoryImport.skipReason.${item.skipReason ?? "no_change"}`, {
              defaultValue: item.skipReason ?? "skip",
            })}
          </span>
        ) : (
          <span style={{ color: pageColorTokens.brandGreenDeep, fontWeight: 700 }}>
            {t("inventoryImport.actionChange")}
          </span>
        )}
      </td>
    </>
  );
}
