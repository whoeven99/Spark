import { CatalogManageTaskCard } from "../catalogManage/CatalogManageTaskCard";
import { BulkProductFieldEditTaskDetailPage, readBulkProductFieldEditResult } from "./BulkProductFieldEditTaskDetailPage";
import type { AITaskItem, AITaskStatus, BulkProductFieldEditTaskConfig } from "../../../lib/aiTaskTypes";
import { useTranslation } from "react-i18next";

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

export function BulkProductFieldEditTaskCard(props: Props) {
  const { t } = useTranslation();
  const config = props.task.config as Partial<BulkProductFieldEditTaskConfig>;
  const result = readBulkProductFieldEditResult(props.task);
  const fieldLabel = config.field
    ? t(`bulkProductFieldEdit.field.${config.field}`)
    : t("common.unknown");
  const modeLabel = config.mode === "clear" ? t("bulkProductFieldEdit.mode.clear") : t("bulkProductFieldEdit.mode.set");
  return (
    <CatalogManageTaskCard
      {...props}
      i18nPrefix="bulkProductFieldEdit"
      hasResult={Boolean(result)}
      summary={result?.summary ?? null}
      ruleLabel={`${fieldLabel} · ${modeLabel}`}
      DetailPage={BulkProductFieldEditTaskDetailPage}
      appliedOutcome={result?.apply ?? null}
    />
  );
}
