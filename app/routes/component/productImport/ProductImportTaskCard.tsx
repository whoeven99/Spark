import { useTranslation } from "react-i18next";
import { CatalogManageTaskCard } from "../catalogManage/CatalogManageTaskCard";
import { ProductImportTaskDetailPage, readProductImportResult } from "./ProductImportTaskDetailPage";
import type { AITaskItem, AITaskStatus } from "../../../lib/aiTaskTypes";

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

export function ProductImportTaskCard(props: Props) {
  const { t } = useTranslation();
  const result = readProductImportResult(props.task);
  return (
    <CatalogManageTaskCard
      {...props}
      i18nPrefix="productImport"
      hasResult={Boolean(result)}
      summary={
        result
          ? { changed: result.summary.changed, skipped: result.summary.issues }
          : null
      }
      ruleLabel={result?.fileName || t("productImport.ruleLabel")}
      DetailPage={ProductImportTaskDetailPage}
      appliedOutcome={result?.apply ?? null}
    />
  );
}
