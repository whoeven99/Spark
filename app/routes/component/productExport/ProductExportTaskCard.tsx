import { useTranslation } from "react-i18next";
import { CatalogManageTaskCard } from "../catalogManage/CatalogManageTaskCard";
import { ProductExportTaskDetailPage, readProductExportResult } from "./ProductExportTaskDetailPage";
import type { AITaskItem, AITaskStatus, ProductExportTaskConfig } from "../../../lib/aiTaskTypes";

type Props = {
  task: AITaskItem;
  locationSearch: string;
  onDelete: () => void;
  onTaskUpdated?: (
    taskId: string,
    status: AITaskStatus,
    result?: Record<string, unknown>,
  ) => void;
  deleting: boolean;
};

export function ProductExportTaskCard(props: Props) {
  const { t } = useTranslation();
  const config = props.task.config as Partial<ProductExportTaskConfig>;
  const result = readProductExportResult(props.task);
  return (
    <CatalogManageTaskCard
      {...props}
      i18nPrefix="productExport"
      hasResult={Boolean(result)}
      summary={result?.summary ?? null}
      ruleLabel={t(`productExport.format.${config.format ?? "shopify_csv"}`)}
      DetailPage={ProductExportTaskDetailPage}
      appliedOutcome={null}
    />
  );
}
