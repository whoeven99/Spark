import { useTranslation } from "react-i18next";
import { pageColorTokens } from "../../page/pageUiStyles";
import { CatalogMutationTaskDetailPage } from "../catalogManage/CatalogMutationTaskDetailPage";
import { catalogReviewCellStyle, downloadCatalogCsv } from "../catalogManage/catalogReviewUi";
import { AI_TASK_FETCH_INIT } from "../../../lib/aiTaskStatusSync";
import type { AITaskItem, AITaskStatus, ProductExportTaskResult } from "../../../lib/aiTaskTypes";
import type { ProductExportSkip } from "../../../lib/productExport";

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

export function productExportDownloadFilename(taskId: string): string {
  return `product-export-${taskId.slice(0, 8)}.csv`;
}

/** 进度卡一键下载：列表快照已有 csv 则直接下，否则拉单条任务。 */
export async function downloadProductExportCsv(
  task: AITaskItem,
  locationSearch: string,
): Promise<boolean> {
  try {
    const filename = productExportDownloadFilename(task.id);
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
    downloadCatalogCsv(filename, fetched.csv);
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
  return (
    <CatalogMutationTaskDetailPage
      {...props}
      i18nPrefix="productExport"
      downloadOnly
      rows={skips.length > 0 ? skips : [{ productId: "_ok", productTitle: "", reason: "" }]}
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
      headers={
        skips.length > 0
          ? [t("productExport.colProduct"), t("productExport.colReason")]
          : [t("productExport.colStatus")]
      }
      rowKey={(row) => row.productId}
      renderRow={(row: ProductExportSkip) =>
        skips.length > 0 ? (
          <>
            <td style={{ ...catalogReviewCellStyle, fontWeight: 600 }}>{row.productTitle}</td>
            <td style={catalogReviewCellStyle}>{row.reason}</td>
          </>
        ) : (
          <td style={catalogReviewCellStyle}>{t("productExport.allExported")}</td>
        )
      }
      extraCsv={{
        filename: productExportDownloadFilename(props.task.id),
        content: result.csv,
        label: t("productExport.downloadChangeset"),
      }}
      changesetCsv={undefined}
      canApplyCount={0}
    />
  );
}
