import { useTranslation } from "react-i18next";
import { pageColorTokens } from "../../page/pageUiStyles";
import {
  CatalogMutationTaskDetailPage,
  catalogChangeCell,
  catalogSkippedCell,
} from "../catalogManage/CatalogMutationTaskDetailPage";
import { catalogReviewCellStyle } from "../catalogManage/catalogReviewUi";
import {
  buildBulkProductFieldEditChangesetCsv,
  buildBulkProductFieldEditRollbackCsv,
  type BulkProductFieldEditRow,
} from "../../../lib/bulkProductFieldEdit";
import type { AITaskItem, AITaskStatus, BulkProductFieldEditTaskResult } from "../../../lib/aiTaskTypes";

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

export function readBulkProductFieldEditResult(
  task: AITaskItem,
): BulkProductFieldEditTaskResult | null {
  const raw = task.result;
  if (!raw || !Array.isArray(raw.rows)) return null;
  return raw as unknown as BulkProductFieldEditTaskResult;
}

export function BulkProductFieldEditTaskDetailPage(props: Props) {
  const { t } = useTranslation();
  const result = readBulkProductFieldEditResult(props.task);
  if (!result) {
    return (
      <div style={{ fontSize: 13, color: pageColorTokens.textSecondary, padding: "24px 0" }}>
        {t("bulkProductFieldEdit.noChangeset")}
      </div>
    );
  }
  const changed = result.rows.filter((row) => !row.skipped);
  return (
    <CatalogMutationTaskDetailPage
      {...props}
      i18nPrefix="bulkProductFieldEdit"
      applyPath="/api/bulk-product-field-edit"
      rows={result.rows}
      truncated={result.truncated}
      applied={result.apply ? { succeeded: result.apply.succeeded, failed: result.apply.failed } : null}
      summaryChips={[
        { label: t("bulkProductFieldEdit.summaryProducts"), value: result.summary.products },
        { label: t("bulkProductFieldEdit.summaryChanged"), value: result.summary.changed },
        { label: t("bulkProductFieldEdit.summarySkipped"), value: result.summary.skipped },
      ]}
      headers={[
        t("bulkProductFieldEdit.colProduct"),
        t("bulkProductFieldEdit.colField"),
        t("bulkProductFieldEdit.colChange"),
        t("bulkProductFieldEdit.colAction"),
      ]}
      rowKey={(row) => row.productId}
      renderRow={(row: BulkProductFieldEditRow) => (
        <>
          <td style={{ ...catalogReviewCellStyle, fontWeight: 600 }}>{row.productTitle}</td>
          <td style={catalogReviewCellStyle}>{t(`bulkProductFieldEdit.field.${row.field}`)}</td>
          <td style={catalogReviewCellStyle}>
            {row.skipped
              ? row.beforeValue || t("bulkProductFieldEdit.emptyValue")
              : `${row.beforeValue || t("bulkProductFieldEdit.emptyValue")} → ${row.afterValue || t("bulkProductFieldEdit.emptyValue")}`}
          </td>
          {row.skipped
            ? catalogSkippedCell(t(`bulkProductFieldEdit.skipReason.${row.skipReason ?? "no_change"}`))
            : catalogChangeCell(t("bulkProductFieldEdit.actionChange"))}
        </>
      )}
      changesetCsv={buildBulkProductFieldEditChangesetCsv(result.rows)}
      rollbackCsv={buildBulkProductFieldEditRollbackCsv(result.rows)}
      canApplyCount={changed.length}
    />
  );
}
