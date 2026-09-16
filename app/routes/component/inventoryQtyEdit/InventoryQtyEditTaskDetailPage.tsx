import { useTranslation } from "react-i18next";
import { pageColorTokens } from "../../page/pageUiStyles";
import { CatalogMutationTaskDetailPage } from "../catalogManage/CatalogMutationTaskDetailPage";
import { catalogReviewCellStyle } from "../catalogManage/catalogReviewUi";
import {
  buildInventoryQtyEditChangesetCsv,
  buildInventoryQtyEditRollbackCsv,
  coerceInventoryQtyEditRows,
  type InventoryQtyEditRow,
} from "../../../lib/inventoryQtyEdit";
import type {
  AITaskItem,
  AITaskStatus,
  InventoryQtyEditTaskResult,
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

export function readInventoryQtyEditResult(task: AITaskItem): InventoryQtyEditTaskResult | null {
  const raw = task.result;
  if (!raw || !Array.isArray(raw.rows)) return null;
  return {
    ...(raw as unknown as InventoryQtyEditTaskResult),
    rows: coerceInventoryQtyEditRows(raw.rows),
  };
}

export function InventoryQtyEditTaskDetailPage(props: Props) {
  const { t } = useTranslation();
  const result = readInventoryQtyEditResult(props.task);
  const rows = result?.rows ?? [];
  const changed = rows.filter((row) => !row.skipped);
  const running = props.task.status === "running" && !result;
  return (
    <CatalogMutationTaskDetailPage
      {...props}
      i18nPrefix="inventoryQtyEdit"
      applyPath="/api/bulk-inventory-edit"
      rows={rows}
      truncated={result?.truncated}
      applied={result?.apply ?? null}
      summaryChips={[
        { label: t("inventoryQtyEdit.summaryProducts"), value: result?.summary.products ?? 0 },
        { label: t("inventoryQtyEdit.summaryVariants"), value: result?.summary.variants ?? 0 },
        { label: t("inventoryQtyEdit.summaryChanged"), value: result?.summary.changed ?? 0 },
        { label: t("inventoryQtyEdit.summarySkipped"), value: result?.summary.skipped ?? 0 },
      ]}
      extraNotices={
        <div style={{ fontSize: 12, color: pageColorTokens.textSecondary }}>
          {t("inventoryQtyEdit.scopeHint")}
        </div>
      }
      headers={[
        t("inventoryQtyEdit.colProduct"),
        t("inventoryQtyEdit.colVariant"),
        t("inventoryQtyEdit.colSku"),
        t("inventoryQtyEdit.colLocation"),
        t("inventoryQtyEdit.colAvailable"),
        t("inventoryQtyEdit.colAction"),
      ]}
      rowKey={(row) => `${row.variantId}:${row.locationId}`}
      renderRow={(row: InventoryQtyEditRow) => (
        <>
          <td style={catalogReviewCellStyle}>{row.productTitle}</td>
          <td style={catalogReviewCellStyle}>{row.variantTitle || "—"}</td>
          <td style={catalogReviewCellStyle}>{row.sku || "—"}</td>
          <td style={catalogReviewCellStyle}>{row.locationName}</td>
          <td style={catalogReviewCellStyle}>
            {row.skipped ? (
              row.beforeAvailable
            ) : (
              <>
                <span style={{ color: pageColorTokens.textFootnote }}>{row.beforeAvailable}</span>
                <span style={{ margin: "0 6px" }}>→</span>
                <strong>{row.afterAvailable}</strong>
              </>
            )}
          </td>
          <td style={catalogReviewCellStyle}>
            {row.skipped ? (
              <span style={{ color: pageColorTokens.textFootnote }}>
                {t(`inventoryQtyEdit.skipReason.${row.skipReason ?? "no_change"}`)}
              </span>
            ) : (
              <span style={{ color: pageColorTokens.brandGreenDeep, fontWeight: 700 }}>
                {t("inventoryQtyEdit.actionChange")}
              </span>
            )}
          </td>
        </>
      )}
      changesetCsv={rows.length > 0 ? buildInventoryQtyEditChangesetCsv(rows) : undefined}
      rollbackCsv={changed.length > 0 ? buildInventoryQtyEditRollbackCsv(rows) : undefined}
      emptyNotice={running ? t("inventoryQtyEdit.runningPreview") : t("inventoryQtyEdit.noChangeset")}
      canApplyCount={changed.length}
    />
  );
}
