import { useTranslation } from "react-i18next";
import { pageColorTokens } from "../../page/pageUiStyles";
import { CatalogMutationTaskDetailPage } from "../catalogManage/CatalogMutationTaskDetailPage";
import { catalogReviewCellStyle, downloadCatalogCsv } from "../catalogManage/catalogReviewUi";
import { AI_TASK_FETCH_INIT } from "../../../lib/aiTaskStatusSync";
import type { AITaskItem, AITaskStatus, ProductExportTaskConfig, ProductExportTaskResult } from "../../../lib/aiTaskTypes";
import {
  buildProductExportSkipCsv,
  normalizeProductExportSkipReason,
  type ProductExportFormat,
  type ProductExportSkip,
} from "../../../lib/productExport";

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

export function readProductExportResult(task: AITaskItem): ProductExportTaskResult | null {
  const raw = task.result;
  if (!raw || typeof raw.csv !== "string") return null;
  return raw as unknown as ProductExportTaskResult;
}

function formatFromTask(task: AITaskItem): ProductExportFormat | undefined {
  const fromResult = readProductExportResult(task)?.format;
  if (fromResult === "shopify_csv" || fromResult === "tiktok_csv") return fromResult;
  const fromConfig = (task.config as Partial<ProductExportTaskConfig>).format;
  if (fromConfig === "shopify_csv" || fromConfig === "tiktok_csv") return fromConfig;
  return undefined;
}

export function productExportDownloadFilename(
  taskId: string,
  format?: ProductExportFormat | string | null,
): string {
  const suffix = format === "tiktok_csv" ? "tiktok" : format === "shopify_csv" ? "shopify" : "export";
  return `product-export-${suffix}-${taskId.slice(0, 8)}.csv`;
}

export function productExportSkipDownloadFilename(taskId: string): string {
  return `product-export-skip-${taskId.slice(0, 8)}.csv`;
}

/** 进度卡一键下载：列表快照已有 csv 则直接下，否则拉单条任务。 */
export async function downloadProductExportCsv(
  task: AITaskItem,
  locationSearch: string,
): Promise<boolean> {
  try {
    const filename = productExportDownloadFilename(task.id, formatFromTask(task));
    const existing = readProductExportResult(task);
    if (existing?.csv) {
      downloadCatalogCsv(filename, existing.csv);
      return true;
    }
    const params = new URLSearchParams(
      locationSearch.startsWith("?") ? locationSearch.slice(1) : locationSearch,
    );
    const response = await fetch(
      `/api/ai-task/${encodeURIComponent(task.id)}?${params.toString()}`,
      AI_TASK_FETCH_INIT,
    );
    if (!response.ok) return false;
    const body = (await response.json()) as { task?: AITaskItem };
    const fetched = body.task ? readProductExportResult(body.task) : null;
    if (!fetched?.csv) return false;
    downloadCatalogCsv(
      productExportDownloadFilename(body.task?.id ?? task.id, fetched.format ?? formatFromTask(task)),
      fetched.csv,
    );
    return true;
  } catch {
    return false;
  }
}

export function ProductExportTaskDetailPage(props: Props) {
  const { t } = useTranslation();
  const result = readProductExportResult(props.task);
  if (!result) {
    return (
      <div style={{ fontSize: 13, color: pageColorTokens.textSecondary, padding: "24px 0" }}>
        {t("productExport.noChangeset")}
      </div>
    );
  }
  const skips = result.skips ?? [];
  const skipReasonLabel = (reason: string) =>
    t(`productExport.skipReason.${normalizeProductExportSkipReason(reason)}`, {
      defaultValue: reason,
    });
  const skipCsv = skips.length > 0 ? buildProductExportSkipCsv(skips, skipReasonLabel) : undefined;
  return (
    <CatalogMutationTaskDetailPage
      {...props}
      i18nPrefix="productExport"
      downloadOnly
      rows={skips}
      truncated={result.truncated}
      summaryChips={[
        { label: t("productExport.summaryProducts"), value: result.summary.products },
        { label: t("productExport.summaryExported"), value: result.summary.exported },
        { label: t("productExport.summarySkipped"), value: result.summary.skipped },
      ]}
      extraNotices={
        <div style={{ fontSize: 12, color: pageColorTokens.textSecondary }}>
          {t(`productExport.format.${result.format}`)}
        </div>
      }
      emptyNotice={t("productExport.allExported")}
      headers={[t("productExport.colProduct"), t("productExport.colReason")]}
      rowKey={(row) => row.productId}
      renderRow={(row: ProductExportSkip) => (
        <>
          <td style={{ ...catalogReviewCellStyle, fontWeight: 600 }}>{row.productTitle}</td>
          <td style={catalogReviewCellStyle}>{skipReasonLabel(row.reason)}</td>
        </>
      )}
      extraCsv={{
        filename: productExportDownloadFilename(props.task.id, result.format),
        content: result.csv,
        label: t("productExport.downloadChangeset"),
      }}
      extraCsvs={
        skipCsv
          ? [
              {
                filename: productExportSkipDownloadFilename(props.task.id),
                content: skipCsv,
                label: t("productExport.downloadSkipReport"),
              },
            ]
          : undefined
      }
      changesetCsv={undefined}
      canApplyCount={0}
    />
  );
}
