import { useTranslation } from "react-i18next";
import { CatalogManageTaskCard } from "../catalogManage/CatalogManageTaskCard";
import {
  InventoryImportTaskDetailPage,
  readInventoryImportResult,
} from "./InventoryImportTaskDetailPage";
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

export function InventoryImportTaskCard(props: Props) {
  const { t } = useTranslation();
  const result = readInventoryImportResult(props.task);
  const fileName =
    (props.task.config as { fileName?: string }).fileName || result?.fileName;
  return (
    <CatalogManageTaskCard
      {...props}
      i18nPrefix="inventoryImport"
      hasResult={Boolean(result)}
      summary={
        result
          ? { changed: result.summary.changed, skipped: result.summary.issues }
          : null
      }
      ruleLabel={fileName || t("inventoryImport.ruleLabel")}
      DetailPage={InventoryImportTaskDetailPage}
      appliedOutcome={result?.apply ?? null}
    />
  );
}
