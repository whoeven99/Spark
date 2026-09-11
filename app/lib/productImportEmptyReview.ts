import { coerceBulkPriceEditRows } from "./bulkPriceEdit";
import { coerceBulkCostEditRows } from "./bulkCostEdit";
import { coerceBulkTagEditRows } from "./bulkTagEdit";
import { coerceBulkStatusEditRows } from "./bulkStatusEdit";
import { coerceBulkProductFieldEditRows } from "./bulkProductFieldEdit";
import { coerceBulkHandleEditRows } from "./bulkHandleEdit";
import { coerceBulkCollectionEditRows } from "./bulkCollectionEdit";
import { coerceBulkMetafieldEditRows } from "./bulkMetafieldEdit";
import { coerceProductDuplicateRows } from "./productDuplicate";
import { coerceBulkArchiveRows } from "./bulkArchive";
import { coerceBulkProductDeleteRows } from "./bulkProductDelete";
import {
  countImportWritable,
  type ProductImportPlan,
} from "./productImportPlanOps";
import type { ProductImportCollectionGroup } from "./productImportPlan";

export type EmptyImportReviewDecision =
  | "complete"
  | "already_completed"
  | "has_writes"
  | "not_reviewable";

function coerceImportCollectionGroups(raw: unknown): ProductImportCollectionGroup[] {
  if (!Array.isArray(raw)) return [];
  const out: ProductImportCollectionGroup[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const collectionId = typeof record.collectionId === "string" ? record.collectionId.trim() : "";
    const action = record.action === "remove" ? "remove" : record.action === "add" ? "add" : null;
    if (!collectionId || !action) continue;
    out.push({
      collectionId,
      collectionTitle: typeof record.collectionTitle === "string" ? record.collectionTitle : collectionId,
      action,
      rows: coerceBulkCollectionEditRows(record.rows),
    });
  }
  return out;
}

function importPlanFromRawResult(raw: Record<string, unknown>): ProductImportPlan {
  return {
    issues: [],
    operations: [],
    priceRows: coerceBulkPriceEditRows(raw.priceRows),
    costRows: coerceBulkCostEditRows(raw.costRows),
    tagRows: coerceBulkTagEditRows(raw.tagRows),
    statusRows: coerceBulkStatusEditRows(raw.statusRows),
    fieldRows: coerceBulkProductFieldEditRows(raw.fieldRows),
    handleRows: coerceBulkHandleEditRows(raw.handleRows),
    collectionGroups: coerceImportCollectionGroups(raw.collectionGroups),
    metafieldRows: coerceBulkMetafieldEditRows(raw.metafieldRows),
    duplicateRows: coerceProductDuplicateRows(raw.duplicateRows),
    archiveRows: coerceBulkArchiveRows(raw.archiveRows),
    deleteRows: coerceBulkProductDeleteRows(raw.deleteRows),
  };
}

export function countImportWritableFromResult(raw: Record<string, unknown>): number {
  return countImportWritable(importPlanFromRawResult(raw));
}

export function decideEmptyImportReview(params: {
  taskType: string;
  status: string;
  rawResult: Record<string, unknown> | null | undefined;
}): EmptyImportReviewDecision {
  if (params.taskType !== "product_import") return "not_reviewable";
  if (params.status === "succeeded" || params.status === "applied") return "already_completed";
  if (params.status !== "pending_review" || !params.rawResult) return "not_reviewable";
  if (countImportWritableFromResult(params.rawResult) > 0) return "has_writes";
  return "complete";
}
