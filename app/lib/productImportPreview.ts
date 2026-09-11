/**
 * 导入审核预览：把各能力 changeset 展成统一「商品 | 操作 | 字段 | 原值 | 新值」行。纯算。
 */
import type { BulkCollectionEditRow } from "./bulkCollectionEdit";
import type { BulkCostEditRow } from "./bulkCostEdit";
import type { BulkHandleEditRow } from "./bulkHandleEdit";
import type { BulkMetafieldEditRow } from "./bulkMetafieldEdit";
import type { BulkPriceEditRow } from "./bulkPriceEdit";
import type { BulkProductFieldEditRow } from "./bulkProductFieldEdit";
import type { BulkArchiveRow } from "./bulkArchive";
import type { BulkProductDeleteRow } from "./bulkProductDelete";
import type { BulkStatusEditRow } from "./bulkStatusEdit";
import type { BulkTagEditRow } from "./bulkTagEdit";
import type { ProductDuplicateRow } from "./productDuplicate";
import type { ProductImportCollectionGroup } from "./productImportPlan";
import type {
  ProductImportIssue,
  ProductImportOperation,
} from "./productImport";
import type { ProductImportTaskResult } from "./aiTaskTypes";

export type ProductImportPreviewKind = "change" | "skip" | "issue";

export type ProductImportPreviewRow = {
  key: string;
  kind: ProductImportPreviewKind;
  productTitle: string;
  operation: ProductImportOperation | "issue";
  field: string;
  beforeValue: string;
  afterValue: string;
  skipReason?: string;
  issue?: ProductImportIssue;
};

type SplitRows = { changes: ProductImportPreviewRow[]; skips: ProductImportPreviewRow[] };

function joinList(values: string[]): string {
  return values.filter((value) => value.trim()).join(", ");
}

function splitBySkipped(rows: ProductImportPreviewRow[]): SplitRows {
  const changes: ProductImportPreviewRow[] = [];
  const skips: ProductImportPreviewRow[] = [];
  for (const row of rows) {
    if (row.kind === "skip") skips.push(row);
    else changes.push(row);
  }
  return { changes, skips };
}

function mergeSplits(parts: SplitRows[]): SplitRows {
  return {
    changes: parts.flatMap((part) => part.changes),
    skips: parts.flatMap((part) => part.skips),
  };
}

function pricePreviewRows(rows: BulkPriceEditRow[]): SplitRows {
  return splitBySkipped(
    rows.map((row) => ({
      key: `price-${row.variantId}`,
      kind: row.skipped ? "skip" : "change",
      productTitle: row.productTitle,
      operation: "price",
      field: row.variantTitle || row.sku || "price",
      beforeValue: row.beforePrice,
      afterValue: row.afterPrice,
      ...(row.skipReason ? { skipReason: row.skipReason } : {}),
    })),
  );
}

function costPreviewRows(rows: BulkCostEditRow[]): SplitRows {
  return splitBySkipped(
    rows.map((row) => ({
      key: `cost-${row.variantId}`,
      kind: row.skipped ? "skip" : "change",
      productTitle: row.productTitle,
      operation: "cost",
      field: row.variantTitle || row.sku || "cost",
      beforeValue: row.beforeCost ?? "",
      afterValue: row.afterCost,
      ...(row.skipReason ? { skipReason: row.skipReason } : {}),
    })),
  );
}

function tagPreviewRows(rows: BulkTagEditRow[]): SplitRows {
  return splitBySkipped(
    rows.map((row) => ({
      key: `tags-${row.productId}`,
      kind: row.skipped ? "skip" : "change",
      productTitle: row.productTitle,
      operation: "tags",
      field: "tags",
      beforeValue: joinList(row.beforeTags),
      afterValue: joinList(row.afterTags),
      ...(row.skipReason ? { skipReason: row.skipReason } : {}),
    })),
  );
}

function statusPreviewRows(rows: BulkStatusEditRow[]): SplitRows {
  return splitBySkipped(
    rows.map((row) => ({
      key: `status-${row.productId}`,
      kind: row.skipped ? "skip" : "change",
      productTitle: row.productTitle,
      operation: "status",
      field: "status",
      beforeValue: row.beforeStatus,
      afterValue: row.afterStatus,
      ...(row.skipReason ? { skipReason: row.skipReason } : {}),
    })),
  );
}

function fieldPreviewRows(rows: BulkProductFieldEditRow[]): SplitRows {
  return splitBySkipped(
    rows.map((row) => ({
      key: `field-${row.productId}-${row.field}`,
      kind: row.skipped ? "skip" : "change",
      productTitle: row.productTitle,
      operation: row.field,
      field: row.field,
      beforeValue: row.beforeValue,
      afterValue: row.afterValue,
      ...(row.skipReason ? { skipReason: row.skipReason } : {}),
    })),
  );
}

function handlePreviewRows(rows: BulkHandleEditRow[]): SplitRows {
  return splitBySkipped(
    rows.map((row) => ({
      key: `handle-${row.productId}`,
      kind: row.skipped ? "skip" : "change",
      productTitle: row.productTitle,
      operation: "handle",
      field: "handle",
      beforeValue: row.beforeHandle,
      afterValue: row.afterHandle,
      ...(row.skipReason ? { skipReason: row.skipReason } : {}),
    })),
  );
}

function collectionPreviewRows(groups: ProductImportCollectionGroup[]): SplitRows {
  const rows: ProductImportPreviewRow[] = [];
  for (const group of groups) {
    for (const row of group.rows) {
      rows.push(collectionPreviewRow(group, row));
    }
  }
  return splitBySkipped(rows);
}

function collectionPreviewRow(
  group: ProductImportCollectionGroup,
  row: BulkCollectionEditRow,
): ProductImportPreviewRow {
  const inCollection = group.collectionTitle;
  const absent = "";
  return {
    key: `collection-${group.collectionId}-${row.productId}`,
    kind: row.skipped ? "skip" : "change",
    productTitle: row.productTitle,
    operation: "collection",
    field: group.collectionTitle,
    beforeValue: group.action === "add" ? (row.inCollection ? inCollection : absent) : inCollection,
    afterValue: group.action === "add" ? inCollection : absent,
    ...(row.skipReason ? { skipReason: row.skipReason } : {}),
  };
}

function metafieldPreviewRows(rows: BulkMetafieldEditRow[]): SplitRows {
  return splitBySkipped(
    rows.map((row) => ({
      key: `metafield-${row.ownerId}-${row.namespace}.${row.key}`,
      kind: row.skipped ? "skip" : "change",
      productTitle: row.productTitle,
      operation: "metafield",
      field: `${row.namespace}.${row.key}`,
      beforeValue: row.beforeValue,
      afterValue: row.action === "delete" ? "" : row.afterValue,
      ...(row.skipReason ? { skipReason: row.skipReason } : {}),
    })),
  );
}

function duplicatePreviewRows(rows: ProductDuplicateRow[]): SplitRows {
  return splitBySkipped(
    rows.map((row) => ({
      key: `duplicate-${row.productId}`,
      kind: row.skipped ? "skip" : "change",
      productTitle: row.productTitle,
      operation: "duplicate",
      field: "title",
      beforeValue: row.productTitle,
      afterValue: row.newTitle,
      ...(row.skipReason ? { skipReason: row.skipReason } : {}),
    })),
  );
}

function archivePreviewRows(rows: BulkArchiveRow[]): SplitRows {
  return splitBySkipped(
    rows.map((row) => ({
      key: `archive-${row.productId}`,
      kind: row.skipped ? "skip" : "change",
      productTitle: row.productTitle,
      operation: "archive",
      field: "status",
      beforeValue: row.beforeStatus,
      afterValue: row.afterStatus,
      ...(row.skipReason ? { skipReason: row.skipReason } : {}),
    })),
  );
}

function deletePreviewRows(rows: BulkProductDeleteRow[]): SplitRows {
  return splitBySkipped(
    rows.map((row) => ({
      key: `delete-${row.productId}`,
      kind: row.skipped ? "skip" : "change",
      productTitle: row.productTitle,
      operation: "delete",
      field: "handle",
      beforeValue: row.handle,
      afterValue: "",
      ...(row.skipReason ? { skipReason: row.skipReason } : {}),
    })),
  );
}

export function flattenProductImportIssues(issues: ProductImportIssue[]): ProductImportPreviewRow[] {
  return issues.map((issue, index) => ({
    key: `issue-${issue.rowNumber}-${issue.code}-${issue.column ?? ""}-${index}`,
    kind: "issue",
    productTitle: issue.rowNumber > 0 ? `#${issue.rowNumber}` : "",
    operation: "issue",
    field: issue.column ?? "",
    beforeValue: issue.value ?? "",
    afterValue: "",
    issue,
  }));
}

export function flattenProductImportPreview(result: ProductImportTaskResult): SplitRows {
  return mergeSplits([
    pricePreviewRows(result.priceRows),
    costPreviewRows(result.costRows),
    tagPreviewRows(result.tagRows),
    statusPreviewRows(result.statusRows),
    fieldPreviewRows(result.fieldRows),
    handlePreviewRows(result.handleRows),
    collectionPreviewRows(result.collectionGroups),
    metafieldPreviewRows(result.metafieldRows),
    duplicatePreviewRows(result.duplicateRows),
    archivePreviewRows(result.archiveRows),
    deletePreviewRows(result.deleteRows),
  ]);
}
