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
import { coerceVariantIdentityRows } from "../../lib/bulkVariantIdentityEdit";
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
import { applyVariantIdentityEdit } from "../bulkVariantIdentityEdit/bulkVariantIdentityEditApply.server";
import type { ProductImportCollectionGroup } from "../../lib/productImportPlan";
import type { ProductImportOperation } from "../../lib/productImport";
import {
  PRODUCT_IMPORT_APPLY_ERROR_LIMIT,
  emptyImportApplyLookups,
  enrichImportApplyErrors,
  type ImportApplyErrorLookup,
  type ImportApplyLookupMaps,
  type ProductImportApplyError,
  type RawImportApplyError,
} from "../../lib/productImportApplyError";

export type { ProductImportApplyError };

export type ProductImportApplyOutcome = {
  succeeded: number;
  failed: number;
  byOperation: Record<string, { succeeded: number; failed: number }>;
  errors: ProductImportApplyError[];
};

function emptyOutcome(): ProductImportApplyOutcome {
  return { succeeded: 0, failed: 0, byOperation: {}, errors: [] };
}

function addCounts(
  total: ProductImportApplyOutcome,
  key: string,
  succeeded: number,
  failed: number,
): void {
  total.succeeded += succeeded;
  total.failed += failed;
  const prev = total.byOperation[key] ?? { succeeded: 0, failed: 0 };
  total.byOperation[key] = { succeeded: prev.succeeded + succeeded, failed: prev.failed + failed };
}

function putLookup(
  map: Map<string, ImportApplyErrorLookup>,
  id: string,
  lookup: ImportApplyErrorLookup,
): void {
  if (!id || map.has(id)) return;
  map.set(id, lookup);
}

function addOperation(
  total: ProductImportApplyOutcome,
  key: string,
  operation: ProductImportOperation,
  outcome: { succeeded: number; failed: number; errors?: RawImportApplyError[] },
  lookups: ImportApplyLookupMaps,
): void {
  addCounts(total, key, outcome.succeeded, outcome.failed);
  const room = PRODUCT_IMPORT_APPLY_ERROR_LIMIT - total.errors.length;
  if (room <= 0 || !outcome.errors?.length) return;
  total.errors.push(...enrichImportApplyErrors(operation, outcome.errors, lookups).slice(0, room));
}

function mergeOutcome(total: ProductImportApplyOutcome, part: ProductImportApplyOutcome): void {
  total.succeeded += part.succeeded;
  total.failed += part.failed;
  for (const [key, value] of Object.entries(part.byOperation)) {
    const prev = total.byOperation[key] ?? { succeeded: 0, failed: 0 };
    total.byOperation[key] = {
      succeeded: prev.succeeded + value.succeeded,
      failed: prev.failed + value.failed,
    };
  }
  const room = PRODUCT_IMPORT_APPLY_ERROR_LIMIT - total.errors.length;
  if (room > 0) total.errors.push(...part.errors.slice(0, room));
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

function buildLookups(raw: Record<string, unknown>): ImportApplyLookupMaps {
  const lookups = emptyImportApplyLookups();
  for (const row of coerceBulkPriceEditRows(raw.priceRows)) {
    putLookup(lookups.byVariantId, row.variantId, {
      productTitle: row.productTitle,
      field: row.variantTitle || row.sku || "price",
      beforeValue: row.beforePrice,
      afterValue: row.afterPrice,
      productId: row.productId,
      variantId: row.variantId,
    });
    putLookup(lookups.byProductId, row.productId, {
      productTitle: row.productTitle,
      field: row.variantTitle || row.sku || "price",
      beforeValue: row.beforePrice,
      afterValue: row.afterPrice,
      productId: row.productId,
      variantId: row.variantId,
    });
  }
  for (const row of coerceBulkCostEditRows(raw.costRows)) {
    putLookup(lookups.byVariantId, row.variantId, {
      productTitle: row.productTitle,
      field: row.variantTitle || row.sku || "cost",
      beforeValue: row.beforeCost ?? "",
      afterValue: row.afterCost,
      productId: row.productId,
      variantId: row.variantId,
    });
  }
  for (const row of coerceBulkTagEditRows(raw.tagRows)) {
    putLookup(lookups.byProductId, row.productId, {
      productTitle: row.productTitle,
      field: "tags",
      beforeValue: row.beforeTags.join(", "),
      afterValue: row.afterTags.join(", "),
      productId: row.productId,
    });
  }
  for (const row of coerceBulkStatusEditRows(raw.statusRows)) {
    putLookup(lookups.byProductId, row.productId, {
      productTitle: row.productTitle,
      field: "status",
      beforeValue: row.beforeStatus,
      afterValue: row.afterStatus,
      productId: row.productId,
    });
  }
  for (const row of coerceBulkProductFieldEditRows(raw.fieldRows)) {
    putLookup(lookups.byProductId, row.productId, {
      productTitle: row.productTitle,
      field: row.field,
      beforeValue: row.beforeValue,
      afterValue: row.afterValue,
      productId: row.productId,
    });
  }
  for (const row of coerceBulkHandleEditRows(raw.handleRows)) {
    putLookup(lookups.byProductId, row.productId, {
      productTitle: row.productTitle,
      field: "handle",
      beforeValue: row.beforeHandle,
      afterValue: row.afterHandle,
      productId: row.productId,
    });
  }
  for (const group of coerceCollectionGroups(raw.collectionGroups)) {
    for (const row of group.rows) {
      putLookup(lookups.byProductId, row.productId, {
        productTitle: row.productTitle,
        field: group.collectionTitle,
        beforeValue: row.inCollection ? "in" : "out",
        afterValue: group.action,
        productId: row.productId,
      });
    }
  }
  for (const row of coerceBulkMetafieldEditRows(raw.metafieldRows)) {
    const lookup = {
      productTitle: row.productTitle,
      field: `${row.namespace}.${row.key}`,
      beforeValue: row.beforeValue,
      afterValue: row.afterValue,
      productId: row.productId,
    };
    putLookup(lookups.byOwnerId, row.ownerId, lookup);
    putLookup(lookups.byProductId, row.productId, lookup);
  }
  for (const row of coerceProductDuplicateRows(raw.duplicateRows)) {
    putLookup(lookups.byProductId, row.productId, {
      productTitle: row.productTitle,
      field: "title",
      beforeValue: row.productTitle,
      afterValue: row.newTitle,
      productId: row.productId,
    });
  }
  for (const row of coerceBulkArchiveRows(raw.archiveRows)) {
    putLookup(lookups.byProductId, row.productId, {
      productTitle: row.productTitle,
      field: "status",
      beforeValue: row.beforeStatus,
      afterValue: row.afterStatus,
      productId: row.productId,
    });
  }
  for (const row of coerceBulkProductDeleteRows(raw.deleteRows)) {
    putLookup(lookups.byProductId, row.productId, {
      productTitle: row.productTitle,
      field: "handle",
      beforeValue: row.handle,
      afterValue: "",
      productId: row.productId,
    });
  }
  for (const row of coerceVariantIdentityRows(raw.identityRows)) {
    putLookup(lookups.byVariantId, row.variantId, {
      productTitle: row.productTitle,
      field: row.variantTitle || row.beforeSku || "identity",
      beforeValue: [row.beforeSku, row.beforeBarcode, row.beforeWeight].filter(Boolean).join(" / "),
      afterValue: [row.afterSku, row.afterBarcode, row.afterWeight].filter(Boolean).join(" / "),
      productId: row.productId,
      variantId: row.variantId,
    });
  }
  return lookups;
}

export async function applyProductImport(args: {
  admin: ShopifyAdminGraphqlClient;
  shop: string;
  rawResult: Record<string, unknown>;
}): Promise<ProductImportApplyOutcome> {
  const total = emptyOutcome();
  const lookups = buildLookups(args.rawResult);
  const price = await applyBulkPriceEdit({
    admin: args.admin,
    shop: args.shop,
    rows: coerceBulkPriceEditRows(args.rawResult.priceRows),
  });
  addOperation(total, "price", "price", price, lookups);

  const cost = await applyBulkCostEdit({
    admin: args.admin,
    shop: args.shop,
    rows: coerceBulkCostEditRows(args.rawResult.costRows),
  });
  addOperation(total, "cost", "cost", cost, lookups);

  const tags = await applyBulkTagEdit({
    admin: args.admin,
    shop: args.shop,
    rows: coerceBulkTagEditRows(args.rawResult.tagRows),
  });
  addOperation(total, "tags", "tags", tags, lookups);

  const status = await applyBulkStatusEdit({
    admin: args.admin,
    shop: args.shop,
    rows: coerceBulkStatusEditRows(args.rawResult.statusRows),
  });
  addOperation(total, "status", "status", status, lookups);

  const fields = await applyBulkProductFieldEdit({
    admin: args.admin,
    shop: args.shop,
    rows: coerceBulkProductFieldEditRows(args.rawResult.fieldRows),
  });
  addOperation(total, "fields", "title", fields, lookups);

  const handles = await applyBulkHandleEdit({
    admin: args.admin,
    shop: args.shop,
    rows: coerceBulkHandleEditRows(args.rawResult.handleRows),
  });
  addOperation(total, "handle", "handle", handles, lookups);

  for (const group of coerceCollectionGroups(args.rawResult.collectionGroups)) {
    const outcome = await applyBulkCollectionEdit({
      admin: args.admin,
      shop: args.shop,
      collectionId: group.collectionId,
      action: group.action,
      rows: group.rows,
    });
    addOperation(
      total,
      `collection:${group.collectionId}:${group.action}`,
      "collection",
      outcome,
      lookups,
    );
  }

  const metafields = await applyBulkMetafieldEdit({
    admin: args.admin,
    shop: args.shop,
    rows: coerceBulkMetafieldEditRows(args.rawResult.metafieldRows),
  });
  addOperation(total, "metafield", "metafield", metafields, lookups);

  const duplicate = await applyProductDuplicate({
    admin: args.admin,
    shop: args.shop,
    rows: coerceProductDuplicateRows(args.rawResult.duplicateRows),
  });
  addOperation(total, "duplicate", "duplicate", duplicate, lookups);

  const archive = await applyBulkArchive({
    admin: args.admin,
    shop: args.shop,
    rows: coerceBulkArchiveRows(args.rawResult.archiveRows),
  });
  addOperation(total, "archive", "archive", archive, lookups);

  const deleted = await applyBulkProductDelete({
    admin: args.admin,
    shop: args.shop,
    rows: coerceBulkProductDeleteRows(args.rawResult.deleteRows),
  });
  addOperation(total, "delete", "delete", deleted, lookups);

  const identity = await applyVariantIdentityEdit({
    admin: args.admin,
    shop: args.shop,
    rows: coerceVariantIdentityRows(args.rawResult.identityRows),
  });
  addOperation(total, "identity", "sku", identity, lookups);

  return total;
}

const LOG_PREFIX = "[ProductImport][Apply]";
const APPLY_STALE_MS = 2 * 60 * 60 * 1000;

export type EnqueueProductImportApplyParams = {
  taskId: string;
  shop: string;
  locale: string;
};

export function enqueueProductImportApply(params: EnqueueProductImportApplyParams): void {
  void runProductImportApplyJob(params).catch((error) => {
    console.error(`${LOG_PREFIX} unhandled taskId=${params.taskId}`, error);
  });
}

async function runProductImportApplyJob(params: EnqueueProductImportApplyParams): Promise<void> {
  const startedAt = Date.now();
  const { getTaskForShop } = await import("../aiTask/aiTaskStore.server");
  const { appendLog, appliedTask } = await import("../aiTask/aiTaskLogger.server");
  const { unauthenticated } = await import("../../shopify.server");
  const { initI18n } = await import("../../i18n");
  const { DEFAULT_LOCALE, normalizeLocale } = await import("../../i18n/config");
  const { buildAITaskMessage } = await import("../../lib/aiTaskMessage");
  const { chunkImportPlanByProduct, countImportWritable } = await import("../../lib/productImportPlan");
  const { importPlanFromRawResult } = await import("../../lib/productImportEmptyReview");
  const { loadProductImportChangeset } = await import("./productImportChangeset.server");

  const i18n = initI18n(normalizeLocale(params.locale) ?? DEFAULT_LOCALE);
  const t = i18n.t.bind(i18n);
  const msg = (key: string, vars?: Record<string, string | number>) =>
    buildAITaskMessage(key, t(key, vars), vars);

  const task = await getTaskForShop({ taskId: params.taskId, shop: params.shop });
  if (!task || task.taskType !== "product_import") return;
  const rawResult = { ...(task.result ?? {}) };
  const blobPath = typeof rawResult.changesetBlobPath === "string" ? rawResult.changesetBlobPath.trim() : "";

  try {
    const plan = blobPath
      ? await loadProductImportChangeset(params.shop, params.taskId, blobPath)
      : importPlanFromRawResult(rawResult);
    if (!plan) {
      throw new Error(t("productImport.applyChangesetMissing"));
    }
    if (countImportWritable(plan) === 0) {
      throw new Error(t("productImport.noChanges"));
    }
    const chunks = chunkImportPlanByProduct(plan);
    const { admin } = await unauthenticated.admin(params.shop);
    const total = emptyOutcome();
    const work = chunks.length > 0 ? chunks : [plan];

    for (let index = 0; index < work.length; index += 1) {
      await appendLog({
        taskId: params.taskId,
        startedAt,
        message: msg("productImport.logApplyingBatch", {
          current: index + 1,
          total: work.length,
        }),
      });
      const outcome = await applyProductImport({
        admin,
        shop: params.shop,
        rawResult: work[index] as unknown as Record<string, unknown>,
      });
      mergeOutcome(total, outcome);
    }

    delete rawResult.applyStartedAt;
    await appliedTask({
      taskId: params.taskId,
      result: {
        ...rawResult,
        apply: {
          at: new Date().toISOString(),
          succeeded: total.succeeded,
          failed: total.failed,
          byOperation: total.byOperation,
          errors: total.errors,
        },
      },
      startedAt,
      finalMessage: msg("productImport.logApplyFinished", {
        succeeded: total.succeeded,
        failed: total.failed,
      }),
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} failed taskId=${params.taskId}`, error);
    await appendLog({
      taskId: params.taskId,
      startedAt,
      message: msg("productImport.logApplyFailed", {
        reason: error instanceof Error ? error.message : t("productImport.applyFailed"),
      }),
    });
    await clearProductImportApplyStarted(params.taskId, rawResult);
  }
}

export function isProductImportApplyInFlight(rawResult: Record<string, unknown> | null | undefined): boolean {
  if (!rawResult) return false;
  if (rawResult.apply && typeof rawResult.apply === "object") return false;
  const applyStartedAt = typeof rawResult.applyStartedAt === "string" ? rawResult.applyStartedAt : null;
  if (!applyStartedAt) return false;
  const startedMs = new Date(applyStartedAt).getTime();
  return Number.isFinite(startedMs) && Date.now() - startedMs < APPLY_STALE_MS;
}

export async function markProductImportApplyStarted(taskId: string, rawResult: Record<string, unknown>): Promise<void> {
  const { updateTaskResult } = await import("../aiTask/aiTaskStore.server");
  const next = { ...rawResult };
  delete next.applyStartedAt;
  await updateTaskResult({
    taskId,
    result: { ...next, applyStartedAt: new Date().toISOString() },
  });
}

export async function clearProductImportApplyStarted(taskId: string, rawResult: Record<string, unknown>): Promise<void> {
  const { updateTaskResult } = await import("../aiTask/aiTaskStore.server");
  const next = { ...rawResult };
  delete next.applyStartedAt;
  await updateTaskResult({ taskId, result: next });
}
