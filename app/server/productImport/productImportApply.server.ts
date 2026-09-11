/**
 * 商品导入写回：按列调用各能力已有 apply，不新增 Shopify mutation。
 */
import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";
import { coerceBulkPriceEditRows } from "../../lib/bulkPriceEdit";
import { coerceBulkCostEditRows } from "../../lib/bulkCostEdit";
import { coerceBulkTagEditRows } from "../../lib/bulkTagEdit";
import { coerceBulkStatusEditRows } from "../../lib/bulkStatusEdit";
import { coerceBulkProductFieldEditRows } from "../../lib/bulkProductFieldEdit";
import { coerceBulkHandleEditRows } from "../../lib/bulkHandleEdit";
import { coerceBulkCollectionEditRows } from "../../lib/bulkCollectionEdit";
import { coerceBulkMetafieldEditRows } from "../../lib/bulkMetafieldEdit";
import { coerceProductDuplicateRows } from "../../lib/productDuplicate";
import { coerceBulkArchiveRows } from "../../lib/bulkArchive";
import { coerceBulkProductDeleteRows } from "../../lib/bulkProductDelete";
import { applyBulkPriceEdit } from "../bulkPriceEdit/bulkPriceEditApply.server";
import { applyBulkCostEdit } from "../bulkCostEdit/bulkCostEditApply.server";
import { applyBulkTagEdit } from "../bulkTagEdit/bulkTagEditApply.server";
import { applyBulkStatusEdit } from "../bulkStatusEdit/bulkStatusEditApply.server";
import { applyBulkProductFieldEdit } from "../bulkProductFieldEdit/bulkProductFieldEditApply.server";
import { applyBulkHandleEdit } from "../bulkHandleEdit/bulkHandleEditApply.server";
import { applyBulkCollectionEdit } from "../bulkCollectionEdit/bulkCollectionEditApply.server";
import { applyBulkMetafieldEdit } from "../bulkMetafieldEdit/bulkMetafieldEditApply.server";
import { applyProductDuplicate } from "../productDuplicate/productDuplicateApply.server";
import { applyBulkArchive } from "../bulkArchive/bulkArchiveApply.server";
import { applyBulkProductDelete } from "../bulkProductDelete/bulkProductDeleteApply.server";
import type { ProductImportCollectionGroup } from "../../lib/productImportPlan";

export type ProductImportApplyOutcome = {
  succeeded: number;
  failed: number;
  byOperation: Record<string, { succeeded: number; failed: number }>;
};

function emptyOutcome(): ProductImportApplyOutcome {
  return { succeeded: 0, failed: 0, byOperation: {} };
}

function addOutcome(
  total: ProductImportApplyOutcome,
  key: string,
  succeeded: number,
  failed: number,
): void {
  total.succeeded += succeeded;
  total.failed += failed;
  total.byOperation[key] = { succeeded, failed };
}

function coerceCollectionGroups(raw: unknown): ProductImportCollectionGroup[] {
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

export async function applyProductImport(args: {
  admin: ShopifyAdminGraphqlClient;
  shop: string;
  rawResult: Record<string, unknown>;
}): Promise<ProductImportApplyOutcome> {
  const total = emptyOutcome();
  const price = await applyBulkPriceEdit({
    admin: args.admin,
    shop: args.shop,
    rows: coerceBulkPriceEditRows(args.rawResult.priceRows),
  });
  addOutcome(total, "price", price.succeeded, price.failed);

  const cost = await applyBulkCostEdit({
    admin: args.admin,
    shop: args.shop,
    rows: coerceBulkCostEditRows(args.rawResult.costRows),
  });
  addOutcome(total, "cost", cost.succeeded, cost.failed);

  const tags = await applyBulkTagEdit({
    admin: args.admin,
    shop: args.shop,
    rows: coerceBulkTagEditRows(args.rawResult.tagRows),
  });
  addOutcome(total, "tags", tags.succeeded, tags.failed);

  const status = await applyBulkStatusEdit({
    admin: args.admin,
    shop: args.shop,
    rows: coerceBulkStatusEditRows(args.rawResult.statusRows),
  });
  addOutcome(total, "status", status.succeeded, status.failed);

  const fields = await applyBulkProductFieldEdit({
    admin: args.admin,
    shop: args.shop,
    rows: coerceBulkProductFieldEditRows(args.rawResult.fieldRows),
  });
  addOutcome(total, "fields", fields.succeeded, fields.failed);

  const handles = await applyBulkHandleEdit({
    admin: args.admin,
    shop: args.shop,
    rows: coerceBulkHandleEditRows(args.rawResult.handleRows),
  });
  addOutcome(total, "handle", handles.succeeded, handles.failed);

  for (const group of coerceCollectionGroups(args.rawResult.collectionGroups)) {
    const outcome = await applyBulkCollectionEdit({
      admin: args.admin,
      shop: args.shop,
      collectionId: group.collectionId,
      action: group.action,
      rows: group.rows,
    });
    addOutcome(total, `collection:${group.collectionId}:${group.action}`, outcome.succeeded, outcome.failed);
  }

  const metafields = await applyBulkMetafieldEdit({
    admin: args.admin,
    shop: args.shop,
    rows: coerceBulkMetafieldEditRows(args.rawResult.metafieldRows),
  });
  addOutcome(total, "metafield", metafields.succeeded, metafields.failed);

  const duplicate = await applyProductDuplicate({
    admin: args.admin,
    shop: args.shop,
    rows: coerceProductDuplicateRows(args.rawResult.duplicateRows),
  });
  addOutcome(total, "duplicate", duplicate.succeeded, duplicate.failed);

  const archive = await applyBulkArchive({
    admin: args.admin,
    shop: args.shop,
    rows: coerceBulkArchiveRows(args.rawResult.archiveRows),
  });
  addOutcome(total, "archive", archive.succeeded, archive.failed);

  const deleted = await applyBulkProductDelete({
    admin: args.admin,
    shop: args.shop,
    rows: coerceBulkProductDeleteRows(args.rawResult.deleteRows),
  });
  addOutcome(total, "delete", deleted.succeeded, deleted.failed);

  return total;
}
