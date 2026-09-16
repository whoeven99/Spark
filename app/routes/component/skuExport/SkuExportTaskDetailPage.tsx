import { useTranslation } from "react-i18next";
import { pageColorTokens } from "../../page/pageUiStyles";
import { CatalogMutationTaskDetailPage } from "../catalogManage/CatalogMutationTaskDetailPage";
import { catalogReviewCellStyle } from "../catalogManage/catalogReviewUi";
import {
  coerceSkuExportPreviewRows,
  type SkuExportPreviewRow,
} from "../../../lib/skuExport";
import type { AITaskItem, AITaskStatus, SkuExportTaskResult } from "../../../lib/aiTaskTypes";

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

export function readSkuExportResult(task: AITaskItem): SkuExportTaskResult | null {
  const raw = task.result;
  if (!raw || typeof raw.csv !== "string") return null;
  return {
    ...(raw as unknown as SkuExportTaskResult),
    preview: coerceSkuExportPreviewRows(raw.preview),
  };
}

export function SkuExportTaskDetailPage(props: Props) {
  const { t } = useTranslation();
  const result = readSkuExportResult(props.task);
  const running = props.task.status === "running" && !result;
  const previewRows = result?.preview ?? [];
  return (
    <CatalogMutationTaskDetailPage
      {...props}
      i18nPrefix="skuExport"
      downloadOnly
      rows={previewRows}
      truncated={result?.truncated}
      moreRowsTotal={result?.summary.variants}
      summaryChips={[
        { label: t("skuExport.summaryProducts"), value: result?.summary.products ?? 0 },
        { label: t("skuExport.summaryVariants"), value: result?.summary.variants ?? 0 },
        ...(result?.summary.warned
          ? [{ label: t("skuExport.summaryWarned"), value: result.summary.warned }]
          : []),
      ]}
      extraNotices={
        result ? (
          <div style={{ fontSize: 12, color: pageColorTokens.textSecondary }}>
            {t("skuExport.scopeHint")}
          </div>
        ) : null
      }
      headers={[
        t("skuExport.colProduct"),
        t("skuExport.colHandle"),
        t("skuExport.colVariant"),
        t("skuExport.colSku"),
        t("skuExport.colBarcode"),
        t("skuExport.colWeight"),
        t("skuExport.colStatus"),
      ]}
      rowKey={(row) => row.variantId}
      renderRow={(row) => <SkuExportPreviewCells row={row} />}
      extraCsv={
        result?.csv
          ? {
              filename: `sku-export-${props.task.id.slice(0, 8)}.csv`,
              content: result.csv,
              label: t("skuExport.downloadChangeset"),
            }
          : undefined
      }
      extraCsvs={
        result?.warningCsv
          ? [
              {
                filename: `sku-export-warnings-${props.task.id.slice(0, 8)}.csv`,
                content: result.warningCsv,
                label: t("skuExport.downloadWarningReport"),
              },
            ]
          : undefined
      }
      emptyNotice={running ? t("skuExport.runningPreview") : result ? null : t("skuExport.noChangeset")}
      canApplyCount={0}
    />
  );
}

function SkuExportPreviewCells({ row }: { row: SkuExportPreviewRow }) {
  const { t } = useTranslation();
  return (
    <>
      <td style={{ ...catalogReviewCellStyle, fontWeight: 600 }}>{row.productTitle || "—"}</td>
      <td style={catalogReviewCellStyle}>{row.handle || "—"}</td>
      <td style={catalogReviewCellStyle}>{row.variantTitle || "—"}</td>
      <td style={catalogReviewCellStyle}>{row.sku || "—"}</td>
      <td style={catalogReviewCellStyle}>{row.barcode || "—"}</td>
      <td style={catalogReviewCellStyle}>{row.weight || "—"}</td>
      <td
        style={{
          ...catalogReviewCellStyle,
          color: row.warned ? "#92400e" : pageColorTokens.brandGreenDeep,
          fontWeight: 700,
        }}
      >
        {row.warned ? t("skuExport.outcomeDuplicate") : t("skuExport.outcomeExported")}
      </td>
    </>
  );
}
