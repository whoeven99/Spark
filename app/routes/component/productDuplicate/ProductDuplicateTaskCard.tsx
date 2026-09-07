import { useTranslation } from "react-i18next";
import { CatalogManageTaskCard } from "../catalogManage/CatalogManageTaskCard";
import { ProductDuplicateTaskDetailPage, readProductDuplicateResult } from "./ProductDuplicateTaskDetailPage";
import type { AITaskItem, AITaskStatus, ProductDuplicateTaskConfig } from "../../../lib/aiTaskTypes";

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

export function ProductDuplicateTaskCard(props: Props) {
  const { t } = useTranslation();
  const config = props.task.config as Partial<ProductDuplicateTaskConfig>;
  const result = readProductDuplicateResult(props.task);
  return (
    <CatalogManageTaskCard
      {...props}
      i18nPrefix="productDuplicate"
      hasResult={Boolean(result)}
      summary={result?.summary ?? null}
      ruleLabel={t("productDuplicate.metaSuffix", { suffix: config.titleSuffix || " (Copy)" })}
      DetailPage={ProductDuplicateTaskDetailPage}
      appliedOutcome={result?.apply ?? null}
    />
  );
}
