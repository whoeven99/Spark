import { useTranslation } from "react-i18next";
import { pageColorTokens } from "../../page/pageUiStyles";
import { CatalogMutationTaskDetailPage } from "../catalogManage/CatalogMutationTaskDetailPage";
import { catalogReviewCellStyle } from "../catalogManage/catalogReviewUi";
import type {
  AITaskItem,
  AITaskStatus,
  InventoryExportTaskConfig,
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
  return raw as unknown as InventoryExportTaskResult;
}

function readExportConfig(task: AITaskItem): InventoryExportTaskConfig {
  const raw = task.config as Partial<InventoryExportTaskConfig>;
  const productIds = Array.isArray(raw.productIds)
    ? raw.productIds.filter((id): id is string => typeof id === "string" && Boolean(id.trim()))
    : [];
  return {
    productIds,
    totalProducts: Number(raw.totalProducts) || productIds.length,
    products: Array.isArray(raw.products) ? raw.products : [],
  };
}

export function inventoryExportDownloadFilename(taskId: string): string {
  return `inventory-export-${taskId.slice(0, 8)}.csv`;
}

type PreviewRow = {
  productId: string;
  title: string;
  handle: string;
};

export function InventoryExportTaskDetailPage(props: Props) {
  const { t } = useTranslation();
  const result = readInventoryExportResult(props.task);
  const config = readExportConfig(props.task);
  const running = props.task.status === "running" && !result;
  const rows: PreviewRow[] =
    result?.products?.map((product) => ({
      productId: product.productId,
      title: product.title,
      handle: product.handle,
    })) ??
    config.products?.map((product) => ({
      productId: product.productId,
      title: product.title,
      handle: product.handle,
    })) ??
    [];

  return (
    <CatalogMutationTaskDetailPage
      {...props}
      i18nPrefix="inventoryExport"
      downloadOnly
      rows={rows}
      truncated={result?.truncated}
      summaryChips={[
        {
          label: t("inventoryExport.summaryProducts"),
          value: result?.summary.products ?? config.totalProducts,
        },
        { label: t("inventoryExport.summaryExported"), value: result?.summary.exported ?? 0 },
        { label: t("inventoryExport.summaryRows"), value: result?.summary.rows ?? 0 },
      ]}
      emptyNotice={running ? t("inventoryExport.runningPreview") : t("inventoryExport.noChangeset")}
      headers={[
        t("inventoryExport.colProduct"),
        t("inventoryExport.colHandle"),
      ]}
      rowKey={(row) => row.productId}
      renderRow={(row: PreviewRow) => (
        <>
          <td style={{ ...catalogReviewCellStyle, fontWeight: 600 }}>{row.title || row.productId}</td>
          <td style={catalogReviewCellStyle}>{row.handle || "—"}</td>
        </>
      )}
      extraCsv={
        result?.csv
          ? {
              filename: inventoryExportDownloadFilename(props.task.id),
              content: result.csv,
              label: t("inventoryExport.downloadChangeset"),
            }
          : undefined
      }
      extraNotices={
        <div style={{ fontSize: 12, color: pageColorTokens.textSecondary }}>
          {t("inventoryExport.formatHint")}
        </div>
      }
      changesetCsv={undefined}
      canApplyCount={0}
    />
  );
}
