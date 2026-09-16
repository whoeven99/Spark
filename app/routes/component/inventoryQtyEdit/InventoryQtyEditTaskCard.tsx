import { useTranslation } from "react-i18next";
import { CatalogManageTaskCard } from "../catalogManage/CatalogManageTaskCard";
import {
  InventoryQtyEditTaskDetailPage,
  readInventoryQtyEditResult,
} from "./InventoryQtyEditTaskDetailPage";
import type { AITaskItem, AITaskStatus, InventoryQtyEditTaskConfig } from "../../../lib/aiTaskTypes";

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

export function InventoryQtyEditTaskCard(props: Props) {
  const { t } = useTranslation();
  const result = readInventoryQtyEditResult(props.task);
  const config = props.task.config as Partial<InventoryQtyEditTaskConfig>;
  const mode = config.mode ?? result?.mode ?? "set";
  return (
    <CatalogManageTaskCard
      {...props}
      i18nPrefix="inventoryQtyEdit"
      hasResult={Boolean(result)}
      summary={
        result
          ? { changed: result.summary.changed, skipped: result.summary.skipped }
          : null
      }
      ruleLabel={t(`inventoryQtyEdit.mode.${mode}`)}
      extraMeta={config.locationName || result?.locationName}
      DetailPage={InventoryQtyEditTaskDetailPage}
      appliedOutcome={result?.apply ?? null}
    />
  );
}
