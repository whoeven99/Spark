import { useTranslation } from "react-i18next";
import { pageColorTokens } from "../../page/pageUiStyles";
import { CatalogMutationTaskDetailPage } from "../catalogManage/CatalogMutationTaskDetailPage";
import { catalogReviewCellStyle } from "../catalogManage/catalogReviewUi";
import {
  buildProductImportIssueCsv,
  coerceProductImportIssues,
  coerceProductImportOperations,
  type ProductImportIssue,
} from "../../../lib/productImport";
import { countImportWritable, type ProductImportCollectionGroup } from "../../../lib/productImportPlan";
import type { AITaskItem, AITaskStatus, ProductImportTaskResult } from "../../../lib/aiTaskTypes";
import { coerceBulkPriceEditRows } from "../../../lib/bulkPriceEdit";
import { coerceBulkTagEditRows } from "../../../lib/bulkTagEdit";
import { coerceBulkStatusEditRows } from "../../../lib/bulkStatusEdit";
import { coerceBulkProductFieldEditRows } from "../../../lib/bulkProductFieldEdit";
import { coerceBulkCollectionEditRows } from "../../../lib/bulkCollectionEdit";
import { coerceProductDuplicateRows } from "../../../lib/productDuplicate";
import { coerceBulkArchiveRows } from "../../../lib/bulkArchive";

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

export function readProductImportResult(task: AITaskItem): ProductImportTaskResult | null {
  const raw = task.result;
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if (typeof record.fileName !== "string" || !record.summary || typeof record.summary !== "object") {
    return null;
  }
  const summary = record.summary as Record<string, unknown>;
  return {
    fileName: record.fileName,
    operations: coerceProductImportOperations(record.operations),
    issues: coerceProductImportIssues(record.issues),
    summary: {
      rows: Number(summary.rows) || 0,
      matched: Number(summary.matched) || 0,
      changed: Number(summary.changed) || 0,
      issues: Number(summary.issues) || 0,
    },
    priceRows: coerceBulkPriceEditRows(record.priceRows),
    tagRows: coerceBulkTagEditRows(record.tagRows),
    statusRows: coerceBulkStatusEditRows(record.statusRows),
    fieldRows: coerceBulkProductFieldEditRows(record.fieldRows),
    collectionGroups: Array.isArray(record.collectionGroups)
      ? (record.collectionGroups as ProductImportCollectionGroup[]).map((group) => ({
          ...group,
          rows: coerceBulkCollectionEditRows(group.rows),
        }))
      : [],
    duplicateRows: coerceProductDuplicateRows(record.duplicateRows),
    archiveRows: coerceBulkArchiveRows(record.archiveRows),
    truncated: record.truncated === true,
    ...(record.apply && typeof record.apply === "object"
      ? { apply: record.apply as ProductImportTaskResult["apply"] }
      : {}),
  };
}

export function ProductImportTaskDetailPage(props: Props) {
  const { t } = useTranslation();
  const result = readProductImportResult(props.task);
  if (!result) {
    return (
      <div style={{ fontSize: 13, color: pageColorTokens.textSecondary, padding: "24px 0" }}>
        {t("productImport.noChangeset")}
      </div>
    );
  }
  const writable = countImportWritable(result);
  const issueCsv =
    result.issues.length > 0
      ? buildProductImportIssueCsv(
          result.issues,
          (code) => t(`productImport.issue.${code}`, { defaultValue: code }),
          (code) => t(`productImport.fix.${code}`, { defaultValue: "" }),
        )
      : undefined;
  return (
    <CatalogMutationTaskDetailPage
      {...props}
      i18nPrefix="productImport"
      applyPath="/api/product-import"
      rows={result.issues}
      truncated={result.truncated}
      applied={result.apply ? { succeeded: result.apply.succeeded, failed: result.apply.failed } : null}
      summaryChips={[
        { label: t("productImport.summaryRows"), value: result.summary.rows },
        { label: t("productImport.summaryMatched"), value: result.summary.matched },
        { label: t("productImport.summaryChanged"), value: result.summary.changed },
        { label: t("productImport.summaryIssues"), value: result.summary.issues },
      ]}
      extraNotices={
        <div style={{ fontSize: 12, color: pageColorTokens.textSecondary }}>
          {t("productImport.sourceFile")} {result.fileName}
          {result.operations.length > 0
            ? ` · ${result.operations.map((operation) => t(`productImport.operation.${operation}`)).join("、")}`
            : null}
        </div>
      }
      emptyNotice={t("productImport.noIssues")}
      headers={[
        t("productImport.colRow"),
        t("productImport.colColumn"),
        t("productImport.colProblem"),
        t("productImport.colFix"),
      ]}
      rowKey={(row: ProductImportIssue) => `${row.rowNumber}-${row.code}-${row.column ?? ""}`}
      renderRow={(row: ProductImportIssue) => (
        <>
          <td style={catalogReviewCellStyle}>{row.rowNumber > 0 ? row.rowNumber : "—"}</td>
          <td style={catalogReviewCellStyle}>{row.column || "—"}</td>
          <td style={catalogReviewCellStyle}>
            {t(`productImport.issue.${row.code}`, { defaultValue: row.code })}
          </td>
          <td style={catalogReviewCellStyle}>
            {t(`productImport.fix.${row.code}`, { defaultValue: "" })}
          </td>
        </>
      )}
      extraCsv={
        issueCsv
          ? {
              filename: `product-import-issues-${props.task.id.slice(0, 8)}.csv`,
              content: issueCsv,
              label: t("productImport.downloadIssues"),
            }
          : undefined
      }
      canApplyCount={writable}
    />
  );
}
