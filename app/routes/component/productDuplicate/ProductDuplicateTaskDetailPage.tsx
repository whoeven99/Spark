import { useTranslation } from "react-i18next";
import { pageColorTokens } from "../../page/pageUiStyles";
import {
  CatalogMutationTaskDetailPage,
  catalogChangeCell,
  catalogSkippedCell,
} from "../catalogManage/CatalogMutationTaskDetailPage";
import { catalogReviewCellStyle } from "../catalogManage/catalogReviewUi";
import { buildProductDuplicateChangesetCsv, type ProductDuplicateRow } from "../../../lib/productDuplicate";
import type { AITaskItem, AITaskStatus, ProductDuplicateTaskResult } from "../../../lib/aiTaskTypes";

type Props = {
  task: AITaskItem;
  onBack: () => void;
  showBackButton?: boolean;
  onTaskUpdated?: (
    taskId: string,
    status: AITaskStatus,
    result?: Record<string, unknown>,
  ) => void;
  onBusyChange?: (busy: boolean) => void;
};

export function readProductDuplicateResult(task: AITaskItem): ProductDuplicateTaskResult | null {
  const raw = task.result;
  if (!raw || !Array.isArray(raw.rows)) return null;
  return raw as unknown as ProductDuplicateTaskResult;
}

export function ProductDuplicateTaskDetailPage(props: Props) {
  const { t } = useTranslation();
  const result = readProductDuplicateResult(props.task);
  if (!result) {
    return (
      <div style={{ fontSize: 13, color: pageColorTokens.textSecondary, padding: "24px 0" }}>
        {t("productDuplicate.noChangeset")}
      </div>
    );
  }
  const changed = result.rows.filter((row) => !row.skipped);
  return (
    <CatalogMutationTaskDetailPage
      {...props}
      i18nPrefix="productDuplicate"
      applyPath="/api/product-duplicate"
      rows={result.rows}
      truncated={result.truncated}
      applied={result.apply ? { succeeded: result.apply.succeeded, failed: result.apply.failed } : null}
      summaryChips={[
        { label: t("productDuplicate.summaryProducts"), value: result.summary.products },
        { label: t("productDuplicate.summaryChanged"), value: result.summary.changed },
        { label: t("productDuplicate.summarySkipped"), value: result.summary.skipped },
      ]}
      headers={[
        t("productDuplicate.colProduct"),
        t("productDuplicate.colNewTitle"),
        t("productDuplicate.colStatus"),
        t("productDuplicate.colAction"),
      ]}
      rowKey={(row) => row.productId}
      renderRow={(row: ProductDuplicateRow) => (
        <>
          <td style={{ ...catalogReviewCellStyle, fontWeight: 600 }}>{row.productTitle}</td>
          <td style={catalogReviewCellStyle}>{row.skipped ? "—" : row.newTitle}</td>
          <td style={catalogReviewCellStyle}>{row.newStatus}</td>
          {row.skipped
            ? catalogSkippedCell(t(`productDuplicate.skipReason.${row.skipReason ?? "empty_title"}`))
            : catalogChangeCell(t("productDuplicate.actionChange"))}
        </>
      )}
      changesetCsv={buildProductDuplicateChangesetCsv(result.rows)}
      canApplyCount={changed.length}
    />
  );
}
