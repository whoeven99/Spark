import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { pageColorTokens } from "../../page/pageUiStyles";
import { CatalogMutationTaskDetailPage } from "../catalogManage/CatalogMutationTaskDetailPage";
import { catalogReviewCellStyle } from "../catalogManage/catalogReviewUi";
import {
  buildInventoryImportChangesetCsv,
  coerceInventoryImportRows,
  type InventoryCsvIssueCode,
  type InventoryImportRow,
} from "../../../lib/inventoryCsv";
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
  };
}

function skipReasonLabel(
  reason: InventoryCsvIssueCode | undefined,
  t: (key: string, options?: { defaultValue?: string }) => string,
): string {
  if (!reason) return "";
  return t(`inventoryImport.skipReason.${reason}`, { defaultValue: reason });
}

export function InventoryImportTaskDetailPage(props: Props) {
  const { t } = useTranslation();
  const result = readInventoryImportResult(props.task);
  const rows = useMemo(() => result?.rows ?? [], [result]);
  const running = props.task.status === "running" && !result;
  const canApplyCount = rows.filter((row) => !row.skipped).length;

  return (
    <CatalogMutationTaskDetailPage
      {...props}
      i18nPrefix="inventoryImport"
      applyPath="/api/inventory-import"
      rows={rows}
      truncated={result?.truncated}
      applied={result?.apply ?? null}
      summaryChips={[
        { label: t("inventoryImport.summaryRows"), value: result?.summary.rows ?? 0 },
        { label: t("inventoryImport.summaryChanged"), value: result?.summary.changed ?? 0 },
        { label: t("inventoryImport.summaryIssues"), value: result?.summary.issues ?? 0 },
      ]}
      extraNotices={
        result?.fileName ? (
          <div style={{ fontSize: 12, color: pageColorTokens.textSecondary }}>
            {t("inventoryImport.sourceFile")} {result.fileName}
          </div>
        ) : null
      }
      emptyNotice={running ? t("inventoryImport.runningPreview") : t("inventoryImport.noChangeset")}
      headers={[
        t("inventoryImport.colProduct"),
        t("inventoryImport.colSku"),
        t("inventoryImport.colLocation"),
        t("inventoryImport.colBefore"),
        t("inventoryImport.colAfter"),
        t("inventoryImport.colStatus"),
      ]}
      rowKey={(row) => `${row.inventoryItemId}:${row.locationId}:${row.rowNumber}`}
      renderRow={(row: InventoryImportRow) => (
        <>
          <td style={{ ...catalogReviewCellStyle, fontWeight: 600 }}>{row.productTitle || row.handle}</td>
          <td style={catalogReviewCellStyle}>{row.sku ?? "—"}</td>
          <td style={catalogReviewCellStyle}>{row.locationName}</td>
          <td style={catalogReviewCellStyle}>{row.onHandBefore}</td>
          <td style={catalogReviewCellStyle}>{row.onHandAfter}</td>
          <td
            style={{
              ...catalogReviewCellStyle,
              color: row.skipped ? pageColorTokens.textFootnote : pageColorTokens.brandGreenDeep,
            }}
          >
            {row.skipped
              ? skipReasonLabel(row.skipReason, t) || t("inventoryImport.outcomeSkipped")
              : t("inventoryImport.outcomeChanged")}
          </td>
        </>
      )}
      changesetCsv={rows.length > 0 ? buildInventoryImportChangesetCsv(rows) : undefined}
      canApplyCount={canApplyCount}
    />
  );
}
