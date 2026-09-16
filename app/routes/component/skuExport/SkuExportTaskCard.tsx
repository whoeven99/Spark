import { useTranslation } from "react-i18next";
import { CatalogManageTaskCard } from "../catalogManage/CatalogManageTaskCard";
import { SkuExportTaskDetailPage, readSkuExportResult } from "./SkuExportTaskDetailPage";
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

export function SkuExportTaskCard(props: Props) {
  const { t } = useTranslation();
  const result = readSkuExportResult(props.task);
  return (
    <CatalogManageTaskCard
      {...props}
      i18nPrefix="skuExport"
      hasResult={Boolean(result)}
      summary={
        result
          ? { exported: result.summary.variants, skipped: result.summary.warned }
          : null
      }
      ruleLabel={t("skuExport.ruleLabel")}
      DetailPage={SkuExportTaskDetailPage}
      appliedOutcome={null}
    />
  );
}
