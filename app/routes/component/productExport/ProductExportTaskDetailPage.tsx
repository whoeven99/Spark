import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { pageColorTokens } from "../../page/pageUiStyles";
import { CatalogMutationTaskDetailPage } from "../catalogManage/CatalogMutationTaskDetailPage";
import { catalogReviewCellStyle, downloadCatalogCsv } from "../catalogManage/catalogReviewUi";
import { AI_TASK_FETCH_INIT } from "../../../lib/aiTaskStatusSync";
import type {
  AITaskItem,
  AITaskStatus,
  ProductExportTaskConfig,
  ProductExportTaskResult,
} from "../../../lib/aiTaskTypes";
import {
  buildProductExportPreviewRows,
  buildProductExportSkipCsv,
  coerceProductExportPreviewProducts,
  isProductExportFormat,
  isProductExportStarterFormat,
  normalizeProductExportSkipReason,
  productExportFormatFilenameSuffix,
  type ProductExportFormat,
  type ProductExportPreviewRow,
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
  return {
    ...(raw as unknown as ProductExportTaskResult),
    products: coerceProductExportPreviewProducts(raw.products),
    skips: Array.isArray(raw.skips) ? (raw.skips as ProductExportSkip[]) : [],
    warnings: Array.isArray(raw.warnings) ? (raw.warnings as ProductExportSkip[]) : [],
  };
}

function formatFromTask(task: AITaskItem): ProductExportFormat | undefined {
  const fromResult = readProductExportResult(task)?.format;
  if (isProductExportFormat(fromResult)) return fromResult;
  const fromConfig = (task.config as Partial<ProductExportTaskConfig>).format;
  return isProductExportFormat(fromConfig) ? fromConfig : undefined;
}

export function productExportDownloadFilename(
  taskId: string,
  format?: ProductExportFormat | string | null,
): string {
  return `product-export-${productExportFormatFilenameSuffix(format)}-${taskId.slice(0, 8)}.csv`;
}

export function productExportSkipDownloadFilename(taskId: string): string {
  return `product-export-skip-${taskId.slice(0, 8)}.csv`;
}

export function productExportWarningDownloadFilename(taskId: string): string {
  return `product-export-warnings-${taskId.slice(0, 8)}.csv`;
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

function readExportConfig(task: AITaskItem): ProductExportTaskConfig {
  const raw = task.config as Partial<ProductExportTaskConfig>;
  const productIds = Array.isArray(raw.productIds)
    ? raw.productIds.filter((id): id is string => typeof id === "string" && Boolean(id.trim()))
    : [];
  return {
    format: isProductExportFormat(raw.format) ? raw.format : "shopify_csv",
    productIds,
    totalProducts: Number(raw.totalProducts) || productIds.length,
    products: coerceProductExportPreviewProducts(raw.products),
  };
}

export function ProductExportTaskDetailPage(props: Props) {
  const { t } = useTranslation();
  const result = readProductExportResult(props.task);
  const config = readExportConfig(props.task);
  const completed = Boolean(result) || props.task.status === "succeeded" || props.task.status === "failed";
  const previewRows = useMemo(
    () =>
      buildProductExportPreviewRows({
        productIds: config.productIds,
        configProducts: config.products ?? [],
        resultProducts: result?.products ?? [],
        skips: result?.skips ?? [],
        completed,
      }),
    [completed, config.productIds, config.products, result],
  );
  const skips = result?.skips ?? [];
  const warnings = result?.warnings ?? [];
  const format = result?.format ?? config.format;
  const skipReasonLabel = (reason: string) =>
    t(`productExport.skipReason.${normalizeProductExportSkipReason(reason)}`, {
      defaultValue: reason,
    });
  const skipCsv = skips.length > 0 ? buildProductExportSkipCsv(skips, skipReasonLabel) : undefined;
  const warningCsv =
    warnings.length > 0 ? buildProductExportSkipCsv(warnings, skipReasonLabel) : undefined;
  const extraDownloads = [
    ...(skipCsv
      ? [
          {
            filename: productExportSkipDownloadFilename(props.task.id),
            content: skipCsv,
            label: t("productExport.downloadSkipReport"),
          },
        ]
      : []),
    ...(warningCsv
      ? [
          {
            filename: productExportWarningDownloadFilename(props.task.id),
            content: warningCsv,
            label: t("productExport.downloadWarningReport"),
          },
        ]
      : []),
  ];
  const outcomeLabel = (row: ProductExportPreviewRow) => {
    if (row.outcome === "skipped") {
      return row.skipReason
        ? `${t("productExport.outcomeSkipped")} · ${skipReasonLabel(row.skipReason)}`
        : t("productExport.outcomeSkipped");
    }
    if (row.outcome === "exported") return t("productExport.outcomeExported");
    return t("productExport.outcomePending");
  };
  const running = props.task.status === "running" && !result;
  const warned = result?.summary.warned ?? 0;

  return (
    <CatalogMutationTaskDetailPage
      {...props}
      i18nPrefix="productExport"
      downloadOnly
      rows={previewRows}
      truncated={result?.truncated}
      summaryChips={[
        { label: t("productExport.summaryProducts"), value: result?.summary.products ?? config.totalProducts },
        { label: t("productExport.summaryExported"), value: result?.summary.exported ?? 0 },
        { label: t("productExport.summarySkipped"), value: result?.summary.skipped ?? 0 },
        ...(warned > 0 ? [{ label: t("productExport.summaryWarned"), value: warned }] : []),
      ]}
      extraNotices={
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 12, color: pageColorTokens.textSecondary }}>
            {t(`productExport.format.${format}`)}
          </div>
          {isProductExportStarterFormat(format) || format === "tiktok_csv" ? (
            <div style={{ fontSize: 12, color: pageColorTokens.textSecondary }}>
              {t(`productExport.formatHint.${format}`)}
            </div>
          ) : null}
        </div>
      }
      emptyNotice={running ? t("productExport.runningPreview") : t("productExport.noChangeset")}
      headers={[
        t("productExport.colProduct"),
        t("productExport.colHandle"),
        t("productExport.colStatus"),
      ]}
      rowKey={(row) => row.productId}
      renderRow={(row: ProductExportPreviewRow) => (
        <>
          <td style={{ ...catalogReviewCellStyle, fontWeight: 600 }}>{row.title || row.productId}</td>
          <td style={catalogReviewCellStyle}>{row.handle || "—"}</td>
          <td
            style={{
              ...catalogReviewCellStyle,
              color:
                row.outcome === "exported"
                  ? pageColorTokens.brandGreenDeep
                  : row.outcome === "skipped"
                    ? pageColorTokens.textFootnote
                    : pageColorTokens.textSecondary,
            }}
          >
            {outcomeLabel(row)}
          </td>
        </>
      )}
      extraCsv={
        result?.csv
          ? {
              filename: productExportDownloadFilename(props.task.id, result.format),
              content: result.csv,
              label: t("productExport.downloadChangeset"),
            }
          : undefined
      }
      extraCsvs={extraDownloads.length > 0 ? extraDownloads : undefined}
      changesetCsv={undefined}
      canApplyCount={0}
    />
  );
}
