import { useTranslation } from "react-i18next";
import { pageColorTokens } from "../../page/pageUiStyles";
import {
  CatalogMutationTaskDetailPage,
  catalogChangeCell,
  catalogSkippedCell,
} from "../catalogManage/CatalogMutationTaskDetailPage";
import { catalogReviewCellStyle } from "../catalogManage/catalogReviewUi";
import {
  buildBulkCollectionEditChangesetCsv,
  buildBulkCollectionEditRollbackCsv,
  type BulkCollectionEditRow,
} from "../../../lib/bulkCollectionEdit";
import type { AITaskItem, AITaskStatus, BulkCollectionEditTaskResult } from "../../../lib/aiTaskTypes";

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

export function readBulkCollectionEditResult(task: AITaskItem): BulkCollectionEditTaskResult | null {
  const raw = task.result;
  if (!raw || !Array.isArray(raw.rows)) return null;
  return raw as unknown as BulkCollectionEditTaskResult;
}

export function BulkCollectionEditTaskDetailPage(props: Props) {
  const { t } = useTranslation();
  const result = readBulkCollectionEditResult(props.task);
  if (!result) {
    return (
      <div style={{ fontSize: 13, color: pageColorTokens.textSecondary, padding: "24px 0" }}>
        {t("bulkCollectionEdit.noChangeset")}
      </div>
    );
  }
  const changed = result.rows.filter((row) => !row.skipped);
  const removeCount = changed.filter((row) => row.action === "remove").length;
  return (
    <CatalogMutationTaskDetailPage
      {...props}
      i18nPrefix="bulkCollectionEdit"
      applyPath="/api/bulk-collection-edit"
      rows={result.rows}
      truncated={result.truncated}
      applied={result.apply ? { succeeded: result.apply.succeeded, failed: result.apply.failed } : null}
      summaryChips={[
        { label: t("bulkCollectionEdit.summaryProducts"), value: result.summary.products },
        { label: t("bulkCollectionEdit.summaryAdded"), value: result.summary.added },
        { label: t("bulkCollectionEdit.summaryRemoved"), value: result.summary.removed },
        { label: t("bulkCollectionEdit.summarySkipped"), value: result.summary.skipped },
      ]}
      extraNotices={
        <>
          <div style={{ fontSize: 12, color: pageColorTokens.textSecondary }}>
            {t("bulkCollectionEdit.targetCollection", { collection: result.collectionTitle })}
          </div>
          {removeCount > 0 && !result.apply ? (
            <div
              style={{
                fontSize: 12,
                borderRadius: 8,
                padding: "8px 10px",
                color: "#92400e",
                background: "#fffbeb",
                border: "1px solid #fde68a",
              }}
            >
              {t("bulkCollectionEdit.removeWarning", {
                count: removeCount,
                collection: result.collectionTitle,
              })}
            </div>
          ) : null}
        </>
      }
      headers={[
        t("bulkCollectionEdit.colProduct"),
        t("bulkCollectionEdit.colStatus"),
        t("bulkCollectionEdit.colChange"),
        t("bulkCollectionEdit.colAction"),
      ]}
      rowKey={(row) => row.productId}
      renderRow={(row: BulkCollectionEditRow) => (
        <>
          <td style={{ ...catalogReviewCellStyle, fontWeight: 600 }}>{row.productTitle}</td>
          <td style={catalogReviewCellStyle}>
            {t(`bulkCollectionEdit.productStatus.${row.status}`, { defaultValue: row.status })}
          </td>
          <td style={catalogReviewCellStyle}>
            {row.inCollection ? t("bulkCollectionEdit.memberIn") : t("bulkCollectionEdit.memberOut")}
          </td>
          {row.skipped
            ? catalogSkippedCell(t(`bulkCollectionEdit.skipReason.${row.skipReason ?? "already_in"}`))
            : catalogChangeCell(
                row.action === "add" ? t("bulkCollectionEdit.actionAdd") : t("bulkCollectionEdit.actionRemove"),
              )}
        </>
      )}
      changesetCsv={buildBulkCollectionEditChangesetCsv(result.rows)}
      rollbackCsv={buildBulkCollectionEditRollbackCsv(result.rows)}
      canApplyCount={changed.length}
      applyConfirmHintVars={{ collection: result.collectionTitle }}
    />
  );
}
