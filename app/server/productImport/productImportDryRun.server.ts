/**
 * 商品导入 dry-run：读文件 → 校验 → 匹配店铺 → pending_review。零 mutation。
 */
import { appendLog, failTask, pendingReviewTask, updateTaskProgress } from "../aiTask/aiTaskLogger.server";
import { buildAITaskMessage } from "../../lib/aiTaskMessage";
import { initI18n } from "../../i18n";
import { DEFAULT_LOCALE, normalizeLocale } from "../../i18n/config";
import { unauthenticated } from "../../shopify.server";
import { loadOriginalFileBuffer } from "../fileContext/fileStore.server";
import {
  fetchCollectionMembershipByProductIds,
  fetchCollectionSnapshot,
  listManualCollections,
} from "../shopify/collectionMembershipReader.server";
import { fetchProductsForImport, indexImportCatalog } from "../shopify/productImportReader.server";
import {
  fetchImportMetafieldDefinitions,
  indexMetafieldDefinitions,
} from "../shopify/productMetafieldReader.server";
import { parseImportSpreadsheet } from "./parseImportSpreadsheet.server";
import { analyzeImportSheet, coerceProductImportOperations, PRODUCT_IMPORT_MAX_PRODUCTS } from "../../lib/productImport";
import { buildProductImportSheetPreview } from "../../lib/productImportSheetPreview";
import {
  buildProductImportPlan,
  countImportWritable,
  matchImportRecord,
  type ProductImportCollectionRef,
} from "../../lib/productImportPlan";
import type { ProductImportTaskResult } from "../../lib/aiTaskTypes";

const LOG_PREFIX = "[ProductImport][DryRun]";

export type EnqueueProductImportDryRunParams = {
  taskId: string;
  shop: string;
  locale: string;
  fileId: string;
  operations: string[];
};

export function enqueueProductImportDryRun(params: EnqueueProductImportDryRunParams): void {
  void runProductImportDryRun(params).catch((error) => {
    console.error(`${LOG_PREFIX} unhandled taskId=${params.taskId}`, error);
    const t = translator(params.locale);
    void failTask({
      taskId: params.taskId,
      errorMsg: buildAITaskMessage("productImport.dryRunFailed", t("productImport.dryRunFailed")),
      startedAt: Date.now(),
    });
  });
}

function translator(locale: string) {
  const i18n = initI18n(normalizeLocale(locale) ?? DEFAULT_LOCALE);
  return i18n.t.bind(i18n);
}

async function runProductImportDryRun(params: EnqueueProductImportDryRunParams): Promise<void> {
  const startedAt = Date.now();
  const t = translator(params.locale);
  const msg = (key: string, vars?: Record<string, string | number>) =>
    buildAITaskMessage(key, t(key, vars), vars);

  await appendLog({
    taskId: params.taskId,
    startedAt,
    message: msg("productImport.logReadingFile"),
  });

  const file = await loadOriginalFileBuffer(params.shop, params.fileId);
  if (!file) {
    await failTask({
      taskId: params.taskId,
      errorMsg: buildAITaskMessage("productImport.fileNotFound", t("productImport.fileNotFound")),
      startedAt,
    });
    return;
  }

  let sheet;
  try {
    sheet = await parseImportSpreadsheet(file.buffer, file.name);
  } catch (error) {
    await failTask({
      taskId: params.taskId,
      errorMsg: buildAITaskMessage(
        "productImport.parseFailed",
        error instanceof Error ? error.message : t("productImport.parseFailed"),
      ),
      startedAt,
    });
    return;
  }

  const selected = coerceProductImportOperations(params.operations);
  if (selected.length === 0) {
    await failTask({
      taskId: params.taskId,
      errorMsg: buildAITaskMessage("productImport.noOperationsSelected", t("productImport.noOperationsSelected")),
      startedAt,
    });
    return;
  }

  const analysis = analyzeImportSheet(sheet.headers, sheet.rows, selected);
  if (analysis.records.length === 0) {
    await failTask({
      taskId: params.taskId,
      errorMsg: buildAITaskMessage("productImport.noUsableRows", t("productImport.noUsableRows")),
      startedAt,
    });
    return;
  }

  await updateTaskProgress({
    taskId: params.taskId,
    result: {
      fileName: file.name,
      sheetPreview: buildProductImportSheetPreview({
        fileName: file.name,
        analysis,
        selectedOperations: selected,
      }),
    },
  });

  await appendLog({
    taskId: params.taskId,
    startedAt,
    message: msg("productImport.logMatching", { count: analysis.records.length }),
  });

  const { admin } = await unauthenticated.admin(params.shop);
  const handles = unique([
    ...analysis.records.map((record) => record.handle),
    ...analysis.records.map((record) => record.cells.new_handle),
  ]);
  const skus = unique(analysis.records.map((record) => record.sku));
  const productIds = unique(analysis.records.map((record) => record.productId));
  const includeMetafields = analysis.operations.includes("metafield");
  const catalogProducts = await fetchProductsForImport(
    admin,
    { handles, skus, productIds },
    { includeMetafields },
  );
  const catalog = indexImportCatalog(catalogProducts);
  const matches = analysis.records.map((record) => matchImportRecord(record, catalog));

  const collectionTitles = unique(
    analysis.records.map((record) => record.cells.collection).filter(Boolean),
  );
  const collections = await loadCollectionRefs(admin, collectionTitles);
  const membershipByCollection = await loadMembership(
    admin,
    collections,
    catalogProducts.map((item) => item.productId),
  );
  const definitions = includeMetafields
    ? indexMetafieldDefinitions(await fetchImportMetafieldDefinitions(admin))
    : new Map();

  const plan = buildProductImportPlan({
    matches,
    sheetIssues: analysis.issues,
    operations: analysis.operations,
    collections,
    membershipByCollection,
    metafields: analysis.mapping.metafields,
    definitions,
  });
  const changed = countImportWritable(plan);
  const result: ProductImportTaskResult = {
    fileName: file.name,
    operations: plan.operations,
    issues: plan.issues,
    summary: {
      rows: analysis.records.length,
      matched: matches.filter((item) => item.product).length,
      changed,
      issues: plan.issues.length,
    },
    priceRows: plan.priceRows,
    costRows: plan.costRows,
    tagRows: plan.tagRows,
    statusRows: plan.statusRows,
    fieldRows: plan.fieldRows,
    handleRows: plan.handleRows,
    collectionGroups: plan.collectionGroups,
    metafieldRows: plan.metafieldRows,
    duplicateRows: plan.duplicateRows,
    archiveRows: plan.archiveRows,
    deleteRows: plan.deleteRows,
    ...(analysis.truncated || catalogProducts.length > PRODUCT_IMPORT_MAX_PRODUCTS
      ? { truncated: true }
      : {}),
  };

  await pendingReviewTask({
    taskId: params.taskId,
    result: result as unknown as Record<string, unknown>,
    startedAt,
    finalMessage: msg("productImport.logReadyForReview", {
      changed,
      issues: plan.issues.length,
    }),
  });
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

async function loadCollectionRefs(
  admin: Parameters<typeof listManualCollections>[0],
  titles: string[],
): Promise<ProductImportCollectionRef[]> {
  if (titles.length === 0) return [];
  const listed = await listManualCollections(admin);
  const refs: ProductImportCollectionRef[] = [];
  const wanted = new Set(titles.map((title) => title.trim().toLowerCase()));
  for (const option of listed) {
    if (!wanted.has(option.label.trim().toLowerCase()) && !wanted.has(option.value)) continue;
    const snapshot = await fetchCollectionSnapshot(admin, option.value);
    refs.push({
      id: option.value,
      title: option.label,
      writable: Boolean(snapshot?.sourceId),
    });
  }
  return refs;
}

async function loadMembership(
  admin: Parameters<typeof fetchCollectionMembershipByProductIds>[0],
  collections: ProductImportCollectionRef[],
  productIds: string[],
): Promise<Map<string, Set<string>>> {
  const map = new Map<string, Set<string>>();
  if (productIds.length === 0) return map;
  for (const collection of collections) {
    if (!collection.writable) continue;
    const { products } = await fetchCollectionMembershipByProductIds(
      admin,
      collection.id,
      productIds,
      { maxProducts: PRODUCT_IMPORT_MAX_PRODUCTS },
    );
    map.set(
      collection.id,
      new Set(products.filter((item) => item.inCollection).map((item) => item.productId)),
    );
  }
  return map;
}
