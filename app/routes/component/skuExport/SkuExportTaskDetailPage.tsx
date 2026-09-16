import { useTranslation } from "react-i18next";
import { pageColorTokens } from "../../page/pageUiStyles";
import { CatalogMutationTaskDetailPage } from "../catalogManage/CatalogMutationTaskDetailPage";
import { catalogReviewCellStyle } from "../catalogManage/catalogReviewUi";
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
  return raw as unknown as SkuExportTaskResult;
}

export function SkuExportTaskDetailPage(props: Props) {
  const { t } = useTranslation();
  const result = readSkuExportResult(props.task);
  const running = props.task.status === "running" && !result;
  const rows = result ? [{ key: "ready" }] : [];
  return (
    <CatalogMutationTaskDetailPage
      {...props}
      i18nPrefix="skuExport"
      downloadOnly
      rows={rows}
      truncated={result?.truncated}
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
      headers={[t("skuExport.colStatus")]}
      rowKey={(row) => row.key}
      renderRow={() => (
        <td style={{ ...catalogReviewCellStyle, color: pageColorTokens.brandGreenDeep, fontWeight: 700 }}>
          {t("skuExport.outcomeExported")}
        </td>
      )}
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
      emptyNotice={running ? t("skuExport.runningPreview") : t("skuExport.noChangeset")}
      canApplyCount={0}
    />
  );
}
