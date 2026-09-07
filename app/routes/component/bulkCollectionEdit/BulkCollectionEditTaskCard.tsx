import { useTranslation } from "react-i18next";
import { CatalogManageTaskCard } from "../catalogManage/CatalogManageTaskCard";
import { BulkCollectionEditTaskDetailPage, readBulkCollectionEditResult } from "./BulkCollectionEditTaskDetailPage";
import type { AITaskItem, AITaskStatus, BulkCollectionEditTaskConfig } from "../../../lib/aiTaskTypes";

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

export function BulkCollectionEditTaskCard(props: Props) {
  const { t } = useTranslation();
  const config = props.task.config as Partial<BulkCollectionEditTaskConfig>;
  const result = readBulkCollectionEditResult(props.task);
  const action = config.action === "remove" ? t("bulkCollectionEdit.ruleAction.remove") : t("bulkCollectionEdit.ruleAction.add");
  return (
    <CatalogManageTaskCard
      {...props}
      i18nPrefix="bulkCollectionEdit"
      hasResult={Boolean(result)}
      summary={result?.summary ?? null}
      ruleLabel={action}
      extraMeta={
        result?.collectionTitle
          ? t("bulkCollectionEdit.metaCollection", { collection: result.collectionTitle })
          : undefined
      }
      DetailPage={BulkCollectionEditTaskDetailPage}
      appliedOutcome={result?.apply ?? null}
    />
  );
}
