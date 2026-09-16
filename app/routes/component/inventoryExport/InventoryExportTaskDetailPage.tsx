import { useTranslation } from "react-i18next";
import { pageColorTokens } from "../../page/pageUiStyles";
import { CatalogMutationTaskDetailPage } from "../catalogManage/CatalogMutationTaskDetailPage";
import { catalogReviewCellStyle } from "../catalogManage/catalogReviewUi";
import {
  coerceInventoryExportPreviewRows,
  type InventoryExportPreviewRow,
} from "../../../lib/inventoryCsv";
import type {
  AITaskItem,
  AITaskStatus,
  InventoryExportTaskResult,
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

export function readInventoryExportResult(task: AITaskItem): InventoryExportTaskResult | null {
  const raw = task.result;
  if (!raw || typeof raw.csv !== "string") return null;
  return {
    ...(raw as unknown as InventoryExportTaskResult),
    preview: coerceInventoryExportPreviewRows(raw.preview),
  };
}

export function InventoryExportTaskDetailPage(props: Props) {
  const { t } = useTranslation();
  const result = readInventoryExportResult(props.task);
  const running = props.task.status === "running" && !result;
  const previewRows = result?.preview ?? [];
  return (
    <CatalogMutationTaskDetailPage
      {...props}
      i18nPrefix="inventoryExport"
      downloadOnly
      rows={previewRows}
      truncated={result?.truncated}
      moreRowsTotal={result?.summary.rows}
      summaryChips={[
        { label: t("inventoryExport.summaryProducts"), value: result?.summary.products ?? 0 },
        { label: t("inventoryExport.summaryRows"), value: result?.summary.rows ?? 0 },
        { label: t("inventoryExport.summaryLocations"), value: result?.summary.locations ?? 0 },
      ]}
      extraNotices={
        result ? (
          <div style={{ fontSize: 12, color: pageColorTokens.textSecondary }}>
            {t("inventoryExport.scopeHint")}
          </div>
        ) : null
      }
      headers={[
        t("inventoryExport.colProduct"),
        t("inventoryExport.colVariant"),
        t("inventoryExport.colSku"),
        t("inventoryExport.colLocation"),
        t("inventoryExport.colAvailable"),
        t("inventoryExport.colOnHand"),
        t("inventoryExport.colStatus"),
      ]}
      rowKey={(row) => row.key}
      renderRow={(row) => <InventoryExportPreviewCells row={row} />}
      extraCsv={
        result?.csv
          ? {
              filename: `inventory-export-${props.task.id.slice(0, 8)}.csv`,
              content: result.csv,
              label: t("inventoryExport.downloadChangeset"),
            }
          : undefined
      }
      emptyNotice={running ? t("inventoryExport.runningPreview") : result ? null : t("inventoryExport.noChangeset")}
      canApplyCount={0}
    />
  );
}

function InventoryExportPreviewCells({ row }: { row: InventoryExportPreviewRow }) {
  const { t } = useTranslation();
  return (
    <>
      <td style={{ ...catalogReviewCellStyle, fontWeight: 600 }}>{row.productTitle || "—"}</td>
      <td style={catalogReviewCellStyle}>{row.variantTitle || "—"}</td>
      <td style={catalogReviewCellStyle}>{row.sku || "—"}</td>
      <td style={catalogReviewCellStyle}>{row.location || "—"}</td>
      <td style={catalogReviewCellStyle}>{row.available}</td>
      <td style={catalogReviewCellStyle}>{row.onHand}</td>
      <td style={{ ...catalogReviewCellStyle, color: pageColorTokens.brandGreenDeep, fontWeight: 700 }}>
        {t("inventoryExport.outcomeExported")}
      </td>
    </>
  );
}
