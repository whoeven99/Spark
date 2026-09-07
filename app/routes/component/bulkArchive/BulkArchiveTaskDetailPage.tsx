import { useTranslation } from "react-i18next";
import { pageColorTokens } from "../../page/pageUiStyles";
import {
  CatalogMutationTaskDetailPage,
  catalogChangeCell,
  catalogSkippedCell,
} from "../catalogManage/CatalogMutationTaskDetailPage";
import { catalogReviewCellStyle } from "../catalogManage/catalogReviewUi";
import {
  buildBulkArchiveChangesetCsv,
  buildBulkArchiveRollbackCsv,
  type BulkArchiveRow,
} from "../../../lib/bulkArchive";
import type { AITaskItem, AITaskStatus, BulkArchiveTaskResult } from "../../../lib/aiTaskTypes";

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

export function readBulkArchiveResult(task: AITaskItem): BulkArchiveTaskResult | null {
  const raw = task.result;
  if (!raw || !Array.isArray(raw.rows)) return null;
  return raw as unknown as BulkArchiveTaskResult;
}

export function BulkArchiveTaskDetailPage(props: Props) {
  const { t } = useTranslation();
  const result = readBulkArchiveResult(props.task);
  if (!result) {
    return (
      <div style={{ fontSize: 13, color: pageColorTokens.textSecondary, padding: "24px 0" }}>
        {t("bulkArchive.noChangeset")}
      </div>
    );
  }
  const changed = result.rows.filter((row) => !row.skipped);
  return (
    <CatalogMutationTaskDetailPage
      {...props}
      i18nPrefix="bulkArchive"
      applyPath="/api/bulk-archive"
      rows={result.rows}
      truncated={result.truncated}
      applied={result.apply ? { succeeded: result.apply.succeeded, failed: result.apply.failed } : null}
      extraNotices={
        changed.length > 0 && !result.apply ? (
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
            {t("bulkArchive.archiveWarning", { count: changed.length })}
          </div>
        ) : null
      }
      summaryChips={[
        { label: t("bulkArchive.summaryProducts"), value: result.summary.products },
        { label: t("bulkArchive.summaryChanged"), value: result.summary.changed },
        { label: t("bulkArchive.summarySkipped"), value: result.summary.skipped },
      ]}
      headers={[
        t("bulkArchive.colProduct"),
        t("bulkArchive.colChange"),
        t("bulkArchive.colAction"),
      ]}
      rowKey={(row) => row.productId}
      renderRow={(row: BulkArchiveRow) => (
        <>
          <td style={{ ...catalogReviewCellStyle, fontWeight: 600 }}>{row.productTitle}</td>
          <td style={catalogReviewCellStyle}>
            {row.skipped
              ? row.beforeStatus
              : `${row.beforeStatus} → ${row.afterStatus}`}
          </td>
          {row.skipped
            ? catalogSkippedCell(t(`bulkArchive.skipReason.${row.skipReason ?? "no_change"}`))
            : catalogChangeCell(t("bulkArchive.actionChange"))}
        </>
      )}
      changesetCsv={buildBulkArchiveChangesetCsv(result.rows)}
      rollbackCsv={buildBulkArchiveRollbackCsv(result.rows)}
      canApplyCount={changed.length}
    />
  );
}
