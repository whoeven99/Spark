import { useTranslation } from "react-i18next";
import { CatalogManageTaskCard } from "../catalogManage/CatalogManageTaskCard";
import {
  InventoryExportTaskDetailPage,
  readInventoryExportResult,
} from "./InventoryExportTaskDetailPage";
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

export function InventoryExportTaskCard(props: Props) {
  const { t } = useTranslation();
  const result = readInventoryExportResult(props.task);
  return (
    <CatalogManageTaskCard
      {...props}
      i18nPrefix="inventoryExport"
      hasResult={Boolean(result)}
      summary={result?.summary ?? null}
      ruleLabel={t("inventoryExport.ruleLabel")}
      DetailPage={InventoryExportTaskDetailPage}
      appliedOutcome={null}
    />
  );
}
