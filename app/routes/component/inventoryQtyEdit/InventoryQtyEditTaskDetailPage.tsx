import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { pageColorTokens } from "../../page/pageUiStyles";
import { CatalogMutationTaskDetailPage } from "../catalogManage/CatalogMutationTaskDetailPage";
import { catalogReviewCellStyle } from "../catalogManage/catalogReviewUi";
import {
  buildInventoryQtyChangesetCsv,
  buildInventoryQtyRollbackCsv,
  coerceInventoryQtyRows,
  type InventoryQtyRow,
  type InventoryQtySkipReason,
} from "../../../lib/inventoryQtyEdit";
import type {
  AITaskItem,
  AITaskStatus,
  InventoryQtyTaskConfig,
  InventoryQtyTaskResult,
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

export function readInventoryQtyResult(task: AITaskItem): InventoryQtyTaskResult | null {
  const raw = task.result;
  if (!raw || !Array.isArray(raw.rows)) return null;
  return {
    ...(raw as unknown as InventoryQtyTaskResult),
    rows: coerceInventoryQtyRows(raw.rows),
  };
}

function skipReasonLabel(
  reason: InventoryQtySkipReason | undefined,
  t: (key: string, options?: { defaultValue?: string }) => string,
): string {
  if (!reason) return "";
  return t(`inventoryQty.skipReason.${reason}`, { defaultValue: reason });
}

export function InventoryQtyEditTaskDetailPage(props: Props) {
  const { t } = useTranslation();
  const result = readInventoryQtyResult(props.task);
  const config = props.task.config as Partial<InventoryQtyTaskConfig>;
  const rows = useMemo(() => result?.rows ?? [], [result]);
  const running = props.task.status === "running" && !result;
  const canApplyCount = rows.filter((row) => !row.skipped).length;
  const mode = result?.mode ?? config.mode ?? "set";
  const locationName = result?.locationName || config.locationName || "";

  return (
    <CatalogMutationTaskDetailPage
      {...props}
      i18nPrefix="inventoryQty"
      applyPath="/api/bulk-inventory-edit"
      rows={rows}
      truncated={result?.truncated}
      applied={result?.apply ?? null}
      summaryChips={[
        { label: t("inventoryQty.summaryProducts"), value: result?.summary.products ?? 0 },
        { label: t("inventoryQty.summaryChanged"), value: result?.summary.changed ?? 0 },
        { label: t("inventoryQty.summarySkipped"), value: result?.summary.skipped ?? 0 },
      ]}
      extraNotices={
        <div style={{ fontSize: 12, color: pageColorTokens.textSecondary }}>
          {t(`inventoryQty.mode.${mode}`)}
          {locationName ? ` · ${locationName}` : ""}
        </div>
      }
      emptyNotice={running ? t("inventoryQty.runningPreview") : t("inventoryQty.noChangeset")}
      headers={[
        t("inventoryQty.colProduct"),
        t("inventoryQty.colVariant"),
        t("inventoryQty.colSku"),
        t("inventoryQty.colBefore"),
        t("inventoryQty.colAfter"),
        t("inventoryQty.colStatus"),
      ]}
      rowKey={(row) => `${row.inventoryItemId}:${row.locationId}`}
      renderRow={(row: InventoryQtyRow) => (
        <>
          <td style={{ ...catalogReviewCellStyle, fontWeight: 600 }}>{row.productTitle}</td>
          <td style={catalogReviewCellStyle}>{row.variantTitle}</td>
          <td style={catalogReviewCellStyle}>{row.sku ?? "—"}</td>
          <td style={catalogReviewCellStyle}>{row.availableBefore}</td>
          <td style={catalogReviewCellStyle}>{row.availableAfter}</td>
          <td
            style={{
              ...catalogReviewCellStyle,
              color: row.skipped ? pageColorTokens.textFootnote : pageColorTokens.brandGreenDeep,
            }}
          >
            {row.skipped
              ? skipReasonLabel(row.skipReason, t) || t("inventoryQty.outcomeSkipped")
              : t("inventoryQty.outcomeChanged")}
          </td>
        </>
      )}
      changesetCsv={rows.length > 0 ? buildInventoryQtyChangesetCsv(rows) : undefined}
      rollbackCsv={canApplyCount > 0 ? buildInventoryQtyRollbackCsv(rows) : undefined}
      canApplyCount={canApplyCount}
    />
  );
}
