import { useTranslation } from "react-i18next";
import { pageColorTokens } from "../../page/pageUiStyles";
import { CatalogMutationTaskDetailPage } from "../catalogManage/CatalogMutationTaskDetailPage";
import { catalogReviewCellStyle } from "../catalogManage/catalogReviewUi";
import {
  buildInventoryImportChangesetCsv,
  buildInventoryImportRollbackCsv,
  coerceInventoryImportIssues,
  coerceInventoryImportRows,
  type InventoryImportRow,
} from "../../../lib/inventoryImport";
import type {
  AITaskItem,
  AITaskStatus,
  InventoryImportTaskResult,
} from "../../../lib/aiTaskTypes";

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
  };
}

export function InventoryImportTaskDetailPage(props: Props) {
  const { t } = useTranslation();
  const result = readInventoryImportResult(props.task);
  const rows = result?.rows ?? [];
  const issues = result?.issues ?? [];
  const changed = rows.filter((row) => !row.skipped);
  const running = props.task.status === "running" && !result;
  return (
    <CatalogMutationTaskDetailPage
      {...props}
      i18nPrefix="inventoryImport"
      applyPath="/api/inventory-import"
      rows={rows}
      truncated={result?.truncated}
      applied={result?.apply ?? null}
      summaryChips={[
        { label: t("inventoryImport.summarySheetRows"), value: result?.summary.rows ?? 0 },
        { label: t("inventoryImport.summaryChanged"), value: result?.summary.changed ?? 0 },
        { label: t("inventoryImport.summaryIssues"), value: result?.summary.issues ?? 0 },
      ]}
      extraNotices={
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 12, color: pageColorTokens.textSecondary }}>
            {t("inventoryImport.scopeHint")}
          </div>
          {issues.length > 0 ? (
            <div style={{ fontSize: 12, color: pageColorTokens.textSecondary }}>
              {t("inventoryImport.issuesTitle", { count: issues.length })}
            </div>
          ) : null}
        </div>
      }
      headers={[
        t("inventoryImport.colProduct"),
        t("inventoryImport.colVariant"),
        t("inventoryImport.colSku"),
        t("inventoryImport.colLocation"),
        t("inventoryImport.colOnHand"),
        t("inventoryImport.colAction"),
      ]}
      rowKey={(row) => `${row.variantId}:${row.locationId}:${row.rowNumber}`}
      renderRow={(row: InventoryImportRow) => (
        <>
          <td style={catalogReviewCellStyle}>{row.productTitle}</td>
          <td style={catalogReviewCellStyle}>{row.variantTitle || "—"}</td>
          <td style={catalogReviewCellStyle}>{row.sku || "—"}</td>
          <td style={catalogReviewCellStyle}>{row.locationName}</td>
          <td style={catalogReviewCellStyle}>
            {row.skipped ? (
              row.beforeOnHand
            ) : (
              <>
                <span style={{ color: pageColorTokens.textFootnote }}>{row.beforeOnHand}</span>
                <span style={{ margin: "0 6px" }}>→</span>
                <strong>{row.afterOnHand}</strong>
              </>
            )}
          </td>
          <td style={catalogReviewCellStyle}>
            {row.skipped ? (
              <span style={{ color: pageColorTokens.textFootnote }}>
                {t(`inventoryImport.skipReason.${row.skipReason ?? "no_change"}`, {
                  defaultValue: row.skipReason ?? "skip",
                })}
              </span>
            ) : (
              <span style={{ color: pageColorTokens.brandGreenDeep, fontWeight: 700 }}>
                {t("inventoryImport.actionChange")}
              </span>
            )}
          </td>
        </>
      )}
      changesetCsv={rows.length > 0 ? buildInventoryImportChangesetCsv(rows) : undefined}
      rollbackCsv={changed.length > 0 ? buildInventoryImportRollbackCsv(rows) : undefined}
      emptyNotice={running ? t("inventoryImport.runningPreview") : t("inventoryImport.noChangeset")}
      canApplyCount={changed.length}
    />
  );
}
