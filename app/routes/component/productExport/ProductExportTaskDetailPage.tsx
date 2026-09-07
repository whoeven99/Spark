import { useTranslation } from "react-i18next";
import { pageColorTokens } from "../../page/pageUiStyles";
import { CatalogMutationTaskDetailPage } from "../catalogManage/CatalogMutationTaskDetailPage";
import { catalogReviewCellStyle } from "../catalogManage/catalogReviewUi";
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
        filename: `product-export-${props.task.id.slice(0, 8)}.csv`,
        content: result.csv,
        label: t("productExport.downloadChangeset"),
      }}
      changesetCsv={undefined}
      canApplyCount={0}
    />
  );
}
