import { useTranslation } from "react-i18next";
import { CatalogManageTaskCard } from "../catalogManage/CatalogManageTaskCard";
import {
  InventoryQtyEditTaskDetailPage,
  readInventoryQtyResult,
} from "./InventoryQtyEditTaskDetailPage";
import type { AITaskItem, AITaskStatus, InventoryQtyTaskConfig } from "../../../lib/aiTaskTypes";

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
  const config = props.task.config as Partial<InventoryQtyTaskConfig>;
  const result = readInventoryQtyResult(props.task);
  const mode = result?.mode ?? config.mode ?? "set";
  return (
    <CatalogManageTaskCard
      {...props}
      i18nPrefix="inventoryQty"
      hasResult={Boolean(result)}
      summary={result?.summary ?? null}
      ruleLabel={t(`inventoryQty.mode.${mode}`)}
      extraMeta={result?.locationName || config.locationName}
      DetailPage={InventoryQtyEditTaskDetailPage}
      appliedOutcome={result?.apply ?? null}
    />
  );
}
