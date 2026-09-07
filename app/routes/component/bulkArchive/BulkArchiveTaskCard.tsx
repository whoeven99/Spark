import { useTranslation } from "react-i18next";
import { CatalogManageTaskCard } from "../catalogManage/CatalogManageTaskCard";
import { BulkArchiveTaskDetailPage, readBulkArchiveResult } from "./BulkArchiveTaskDetailPage";
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

export function BulkArchiveTaskCard(props: Props) {
  const { t } = useTranslation();
  const result = readBulkArchiveResult(props.task);
  return (
    <CatalogManageTaskCard
      {...props}
      i18nPrefix="bulkArchive"
      hasResult={Boolean(result)}
      summary={result?.summary ?? null}
      ruleLabel={t("bulkArchive.ruleLabel")}
      DetailPage={BulkArchiveTaskDetailPage}
      appliedOutcome={result?.apply ?? null}
    />
  );
}
