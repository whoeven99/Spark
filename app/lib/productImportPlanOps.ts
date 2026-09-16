/**
 * 导入行 → 各能力 changeset。从 productImportPlan 拆出，避免编排文件过长。
 */
import { formatCentsToMoney, parseMoneyToCents, type BulkPriceEditRow } from "./bulkPriceEdit";
import { computeVariantCostChange, type BulkCostEditRow } from "./bulkCostEdit";
import { computeProductTagChange, BULK_TAG_EDIT_MAX_TAGS_PER_PRODUCT, type BulkTagEditRow } from "./bulkTagEdit";
import type { BulkStatusEditRow } from "./bulkStatusEdit";
import { computeProductFieldChange, type BulkProductFieldEditRow } from "./bulkProductFieldEdit";
import { computeCollectionMembershipChange } from "./bulkCollectionEdit";
import {
  computeProductDuplicate,
  PRODUCT_DUPLICATE_DEFAULT_SUFFIX,
  type ProductDuplicateRow,
} from "./productDuplicate";
import { computeProductArchive, type BulkArchiveRow } from "./bulkArchive";
import {
  computeProductHandleChange,
  normalizeProductHandle,
  type BulkHandleEditRow,
} from "./bulkHandleEdit";
import {
  computeMetafieldChange,
  type BulkMetafieldDefinition,
  type BulkMetafieldEditRow,
  type ProductImportMetafieldColumn,
} from "./bulkMetafieldEdit";
import { computeProductDelete, type BulkProductDeleteRow } from "./bulkProductDelete";
import {
  computeVariantIdentityChange,
  type VariantIdentityChange,
  type VariantIdentityRow,
} from "./bulkVariantIdentityEdit";
import {
  parseImportBool,
  parseImportCollectionAction,
  parseImportStatus,
  parseImportTags,
  PRODUCT_IMPORT_REVIEW_ROW_LIMIT,
  PRODUCT_IMPORT_WORK_CHUNK_PRODUCTS,
  type ProductImportIssue,
  type ProductImportOperation,
} from "./productImport";
import type {
  ProductImportCollectionGroup,
  ProductImportCollectionRef,
  ProductImportMatch,
  ProductImportProductSnapshot,
} from "./productImportPlan";

export type ProductImportPlan = {
  issues: ProductImportIssue[];
  operations: ProductImportOperation[];
  priceRows: BulkPriceEditRow[];
  costRows: BulkCostEditRow[];
  tagRows: BulkTagEditRow[];
  statusRows: BulkStatusEditRow[];
  fieldRows: BulkProductFieldEditRow[];
  handleRows: BulkHandleEditRow[];
  collectionGroups: ProductImportCollectionGroup[];
  metafieldRows: BulkMetafieldEditRow[];
  duplicateRows: ProductDuplicateRow[];
  archiveRows: BulkArchiveRow[];
  deleteRows: BulkProductDeleteRow[];
  identityRows: VariantIdentityRow[];
};

export function emptyImportPlan(
  operations: ProductImportOperation[],
  issues: ProductImportIssue[],
): ProductImportPlan {
  return {
    issues,
    operations,
    priceRows: [],
    costRows: [],
    tagRows: [],
    statusRows: [],
    fieldRows: [],
    handleRows: [],
    collectionGroups: [],
    metafieldRows: [],
    duplicateRows: [],
    archiveRows: [],
    deleteRows: [],
    identityRows: [],
  };
}

export function planMatchedImportRow(args: {
  plan: ProductImportPlan;
  match: ProductImportMatch;
  seen: Set<string>;
  collections: Map<string, ProductImportCollectionRef>;
  membershipByCollection?: Map<string, Set<string>>;
  metafields: ProductImportMetafieldColumn[];
  definitions: Map<string, BulkMetafieldDefinition>;
  handleOwners: Map<string, string>;
  columnKeys: Set<string>;
}): void {
  const { plan, match } = args;
  if (!match.product) return;
  if (plan.operations.includes("delete") && parseImportBool(match.record.cells.delete) === true) {
    planDelete(plan, match, args.seen);
    return;
  }
  planPrice(plan, match, args.columnKeys);
  planCost(plan, match, args.columnKeys);
  planIdentity(plan, match, args.columnKeys);
  planProductLevel(plan, match, args);
}

function once(seen: Set<string>, productId: string, operation: string): boolean {
  const key = `${productId}:${operation}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
}

function planDelete(plan: ProductImportPlan, match: ProductImportMatch, seen: Set<string>): void {
  const product = match.product;
  if (!product || !once(seen, product.productId, "delete")) return;
  plan.deleteRows.push(computeProductDelete(product));
}

function planPrice(plan: ProductImportPlan, match: ProductImportMatch, columnKeys: Set<string>): void {
  if (!plan.operations.includes("price")) return;
  const { record, product, variant } = match;
  if (!product) return;
  const hasPriceCol = columnKeys.has("price");
  const hasCompareCol = columnKeys.has("compare_at");
  if (!hasPriceCol && !hasCompareCol) return;
  const priceRaw = record.cells.price;
  const compareRaw = record.cells.compare_at;
  const bothEmpty = (!hasPriceCol || !priceRaw) && (!hasCompareCol || !compareRaw);
  const continuationRow = bothEmpty && !record.sku && !String(record.cells.title ?? "").trim();
  if (continuationRow) return;
  if (bothEmpty && !variant && product.variants.length > 1 && !record.sku) return;
  if (!variant) {
    plan.issues.push({
      rowNumber: record.rowNumber,
      code: "price_needs_sku",
      column: "price",
      value: priceRaw,
      productTitle: product.productTitle,
    });
    return;
  }
  const beforeCents = parseMoneyToCents(variant.price);
  const afterCents = hasPriceCol
    ? priceRaw
      ? parseMoneyToCents(priceRaw.replace(/,/g, ""))
      : 0
    : beforeCents;
  const beforeCompare = parseMoneyToCents(variant.compareAtPrice);
  const afterCompare = hasCompareCol
    ? compareRaw
      ? parseMoneyToCents(compareRaw.replace(/,/g, ""))
      : null
    : beforeCompare;
  const afterPrice = afterCents != null ? formatCentsToMoney(afterCents) : formatCentsToMoney(beforeCents ?? 0);
  const afterCompareAt = afterCompare != null ? formatCentsToMoney(afterCompare) : null;
  const beforePrice = beforeCents != null ? formatCentsToMoney(beforeCents) : "";
  const priceChanged = hasPriceCol && afterPrice !== beforePrice;
  const compareAtChanged =
    hasCompareCol && (afterCompareAt ?? "") !== (beforeCompare != null ? formatCentsToMoney(beforeCompare) : "");
  if (!priceChanged && !compareAtChanged) {
    plan.priceRows.push({
      variantId: variant.variantId,
      productId: product.productId,
      productTitle: product.productTitle,
      variantTitle: variant.title,
      sku: variant.sku,
      beforePrice,
      afterPrice: beforePrice,
      beforeCompareAt: beforeCompare != null ? formatCentsToMoney(beforeCompare) : null,
      afterCompareAt: beforeCompare != null ? formatCentsToMoney(beforeCompare) : null,
      priceChanged: false,
      compareAtChanged: false,
      skipped: true,
      skipReason: "no_change",
    });
    return;
  }
  plan.priceRows.push({
    variantId: variant.variantId,
    productId: product.productId,
    productTitle: product.productTitle,
    variantTitle: variant.title,
    sku: variant.sku,
    beforePrice,
    afterPrice: priceChanged ? afterPrice : beforePrice,
    beforeCompareAt: beforeCompare != null ? formatCentsToMoney(beforeCompare) : null,
    afterCompareAt: compareAtChanged ? afterCompareAt : beforeCompare != null ? formatCentsToMoney(beforeCompare) : null,
    priceChanged,
    compareAtChanged,
    skipped: false,
  });
}

function planCost(plan: ProductImportPlan, match: ProductImportMatch, columnKeys: Set<string>): void {
  if (!plan.operations.includes("cost") || !columnKeys.has("cost") || !match.product) return;
  if (!match.variant) {
    if (match.product.variants.length > 1 && !match.record.sku) return;
    plan.issues.push({
      rowNumber: match.record.rowNumber,
      code: "cost_needs_sku",
      column: "cost",
      value: match.record.cells.cost,
      productTitle: match.product.productTitle,
    });
    return;
  }
  plan.costRows.push(
    computeVariantCostChange(
      {
        variantId: match.variant.variantId,
        productId: match.product.productId,
        productTitle: match.product.productTitle,
        variantTitle: match.variant.title,
        sku: match.variant.sku,
        inventoryItemId: match.variant.inventoryItemId,
        cost: match.variant.cost,
      },
      match.record.cells.cost,
    ),
  );
}

function planIdentity(plan: ProductImportPlan, match: ProductImportMatch, columnKeys: Set<string>): void {
  const wantsSku = plan.operations.includes("sku");
  const wantsBarcode = plan.operations.includes("barcode") && columnKeys.has("barcode");
  const wantsWeight = plan.operations.includes("weight") && columnKeys.has("grams");
  if (!wantsSku && !wantsBarcode && !wantsWeight) return;
  const { record, product, variant } = match;
  if (!product) return;
  if (!variant) {
    plan.issues.push({
      rowNumber: record.rowNumber,
      code: "identity_needs_sku",
      column: wantsSku ? "sku" : wantsBarcode ? "barcode" : "grams",
      value: record.sku || record.cells.barcode || record.cells.grams,
      productTitle: product.productTitle,
    });
    return;
  }
  const matchedByHandleOrId = Boolean(record.handle || record.productId);
  const change: VariantIdentityChange = {};
  if (wantsSku) {
    if (matchedByHandleOrId && columnKeys.has("sku")) {
      change.sku = record.sku || null;
    } else if (columnKeys.has("new_sku")) {
      change.sku = record.cells.new_sku || null;
    } else {
      plan.issues.push({
        rowNumber: record.rowNumber,
        code: "sku_is_identity_only",
        column: "sku",
        value: record.sku,
        productTitle: product.productTitle,
      });
    }
  }
  if (wantsBarcode) {
    change.barcode = record.cells.barcode || null;
  }
  if (wantsWeight) {
    const grams = Number((record.cells.grams ?? "").replace(/,/g, ""));
    if (Number.isFinite(grams) && grams >= 0) {
      change.weightValue = grams;
      change.weightUnit = "GRAMS";
    }
  }
  if (change.sku === undefined && change.barcode === undefined && change.weightValue === undefined) return;
  plan.identityRows.push(
    computeVariantIdentityChange(
      {
        variantId: variant.variantId,
        productId: product.productId,
        productTitle: product.productTitle,
        variantTitle: variant.title,
        sku: variant.sku,
        barcode: variant.barcode,
        inventoryItemId: variant.inventoryItemId,
        weightValue: variant.weightValue,
        weightUnit: variant.weightUnit,
      },
      change,
    ),
  );
}

function planProductLevel(
  plan: ProductImportPlan,
  match: ProductImportMatch,
  args: {
    seen: Set<string>;
    collections: Map<string, ProductImportCollectionRef>;
    membershipByCollection?: Map<string, Set<string>>;
    metafields: ProductImportMetafieldColumn[];
    definitions: Map<string, BulkMetafieldDefinition>;
    handleOwners: Map<string, string>;
    columnKeys: Set<string>;
  },
): void {
  const product = match.product;
  if (!product) return;
  const record = match.record;
  const seen = args.seen;
  if (plan.operations.includes("title") && once(seen, product.productId, "title")) {
    if (!record.cells.title.trim()) {
      plan.issues.push({
        rowNumber: record.rowNumber,
        code: "empty_title",
        column: "title",
        productTitle: product.productTitle,
      });
    } else {
      const row = computeProductFieldChange(toFieldInput(product), {
        field: "title",
        mode: "set",
        value: record.cells.title,
      });
      if (row.skipReason === "too_long") {
        plan.issues.push({
          rowNumber: record.rowNumber,
          code: "too_long_title",
          column: "title",
          value: record.cells.title,
          productTitle: product.productTitle,
        });
      }
      plan.fieldRows.push(row);
    }
  }
  if (plan.operations.includes("descriptionHtml") && once(seen, product.productId, "body")) {
    plan.fieldRows.push(
      computeProductFieldChange(
        toFieldInput(product),
        record.cells.body_html.trim()
          ? { field: "descriptionHtml", mode: "set", value: record.cells.body_html }
          : { field: "descriptionHtml", mode: "clear", value: "" },
      ),
    );
  }
  if (plan.operations.includes("vendor") && once(seen, product.productId, "vendor")) {
    plan.fieldRows.push(
      computeProductFieldChange(
        toFieldInput(product),
        record.cells.vendor.trim()
          ? { field: "vendor", mode: "set", value: record.cells.vendor }
          : { field: "vendor", mode: "clear", value: "" },
      ),
    );
  }
  if (plan.operations.includes("productType") && once(seen, product.productId, "productType")) {
    plan.fieldRows.push(
      computeProductFieldChange(
        toFieldInput(product),
        record.cells.product_type.trim()
          ? { field: "productType", mode: "set", value: record.cells.product_type }
          : { field: "productType", mode: "clear", value: "" },
      ),
    );
  }
  if (plan.operations.includes("seoTitle") && once(seen, product.productId, "seoTitle")) {
    plan.fieldRows.push(
      computeProductFieldChange(
        toFieldInput(product),
        record.cells.seo_title.trim()
          ? { field: "seoTitle", mode: "set", value: record.cells.seo_title }
          : { field: "seoTitle", mode: "clear", value: "" },
      ),
    );
  }
  if (plan.operations.includes("seoDescription") && once(seen, product.productId, "seoDescription")) {
    plan.fieldRows.push(
      computeProductFieldChange(
        toFieldInput(product),
        record.cells.seo_description.trim()
          ? { field: "seoDescription", mode: "set", value: record.cells.seo_description }
          : { field: "seoDescription", mode: "clear", value: "" },
      ),
    );
  }
  if (plan.operations.includes("handle") && record.cells.new_handle && once(seen, product.productId, "handle")) {
    planHandle(plan, match, args.handleOwners);
  }
  if (plan.operations.includes("tags") && once(seen, product.productId, "tags")) {
    const row = planTags(product, record.cells, args.columnKeys);
    if (row.skipReason === "too_many_tags") {
      plan.issues.push({
        rowNumber: record.rowNumber,
        code: "too_many_tags",
        column: record.cells.tags || args.columnKeys.has("tags") ? "tags" : "add_tags",
        value: String(BULK_TAG_EDIT_MAX_TAGS_PER_PRODUCT),
        productTitle: product.productTitle,
      });
    }
    plan.tagRows.push(row);
  }
  if (plan.operations.includes("status") && once(seen, product.productId, "status")) {
    if (!record.cells.status.trim()) {
      plan.issues.push({
        rowNumber: record.rowNumber,
        code: "invalid_status",
        column: "status",
        value: record.cells.status,
        productTitle: product.productTitle,
      });
    } else {
      const target = parseImportStatus(record.cells.status);
      if (target === "ARCHIVED") {
        if (once(seen, product.productId, "archive")) {
          plan.archiveRows.push(computeProductArchive(product));
        }
      } else if (target === "ACTIVE" || target === "DRAFT") {
        plan.statusRows.push(planStatus(product, target));
      }
    }
  }
  if (
    plan.operations.includes("archive") &&
    parseImportBool(record.cells.archive) === true &&
    once(seen, product.productId, "archive")
  ) {
    plan.archiveRows.push(computeProductArchive(product));
  }
  if (plan.operations.includes("duplicate") && parseImportBool(record.cells.duplicate) === true && once(seen, product.productId, "duplicate")) {
    const statusRaw = parseImportStatus(record.cells.duplicate_status);
    plan.duplicateRows.push(
      computeProductDuplicate(product, {
        titleSuffix: record.cells.duplicate_suffix || PRODUCT_DUPLICATE_DEFAULT_SUFFIX,
        includeImages: parseImportBool(record.cells.duplicate_images) !== false,
        newStatus: statusRaw === "ACTIVE" ? "ACTIVE" : "DRAFT",
      }),
    );
  }
  if (plan.operations.includes("collection") && record.cells.collection && once(seen, product.productId, "collection")) {
    planCollection(plan, product, record.cells, record.rowNumber, args.collections, args.membershipByCollection);
  }
  if (plan.operations.includes("metafield")) {
    planMetafields(plan, match, args.metafields, args.definitions, args.seen);
  }
}

function toFieldInput(product: ProductImportProductSnapshot) {
  return {
    productId: product.productId,
    productTitle: product.productTitle,
    title: product.productTitle,
    descriptionHtml: product.descriptionHtml,
    vendor: product.vendor,
    productType: product.productType,
    seoTitle: product.seoTitle,
    seoDescription: product.seoDescription,
  };
}

function planHandle(
  plan: ProductImportPlan,
  match: ProductImportMatch,
  handleOwners: Map<string, string>,
): void {
  const product = match.product;
  if (!product) return;
  const afterHandle = normalizeProductHandle(match.record.cells.new_handle);
  const takenBy = handleOwners.get(afterHandle) ?? null;
  const row = computeProductHandleChange(product, match.record.cells.new_handle, takenBy);
  if (row.skipReason === "invalid_handle") {
    plan.issues.push({
      rowNumber: match.record.rowNumber,
      code: "invalid_handle",
      column: "new_handle",
      value: match.record.cells.new_handle,
      productTitle: product.productTitle,
    });
  } else if (row.skipReason === "handle_taken") {
    plan.issues.push({
      rowNumber: match.record.rowNumber,
      code: "handle_taken",
      column: "new_handle",
      value: afterHandle,
      productTitle: product.productTitle,
    });
  } else if (!row.skipped) {
    handleOwners.set(afterHandle, product.productId);
  }
  plan.handleRows.push(row);
}

function planTags(
  product: ProductImportProductSnapshot,
  cells: Record<string, string>,
  columnKeys: Set<string>,
): BulkTagEditRow {
  if (columnKeys.has("tags")) {
    const desired = parseImportTags(cells.tags);
    const desiredKeys = new Set(desired.map((tag) => tag.toLowerCase()));
    const beforeKeys = new Set(product.tags.map((tag) => tag.toLowerCase()));
    return computeProductTagChange(product, {
      addTags: desired.filter((tag) => !beforeKeys.has(tag.toLowerCase())),
      removeTags: product.tags.filter((tag) => !desiredKeys.has(tag.toLowerCase())),
      removePrefixes: [],
    });
  }
  return computeProductTagChange(product, {
    addTags: parseImportTags(cells.add_tags),
    removeTags: parseImportTags(cells.remove_tags),
    removePrefixes: [],
  });
}

function planStatus(product: ProductImportProductSnapshot, target: "ACTIVE" | "DRAFT"): BulkStatusEditRow {
  const skipped = product.status.toUpperCase() === target;
  return {
    productId: product.productId,
    productTitle: product.productTitle,
    beforeStatus: product.status,
    afterStatus: target,
    totalInventory: product.totalInventory,
    tracksInventory: product.tracksInventory,
    needsPublishCheck: target === "ACTIVE" && !product.publishedAt,
    skipped,
    ...(skipped ? { skipReason: "no_change" as const } : {}),
  };
}

function planCollection(
  plan: ProductImportPlan,
  product: ProductImportProductSnapshot,
  cells: Record<string, string>,
  rowNumber: number,
  collections: Map<string, ProductImportCollectionRef>,
  membershipByCollection?: Map<string, Set<string>>,
): void {
  const action = parseImportCollectionAction(cells.collection_action) ?? "add";
  const key = cells.collection.trim().toLowerCase();
  const collection = collections.get(cells.collection) ?? collections.get(key);
  if (!collection) {
    plan.issues.push({
      rowNumber,
      code: "collection_not_found",
      column: "collection",
      value: cells.collection,
      productTitle: product.productTitle,
    });
    return;
  }
  if (!collection.writable) {
    plan.issues.push({
      rowNumber,
      code: "collection_not_writable",
      column: "collection",
      value: collection.title,
      productTitle: product.productTitle,
    });
    return;
  }
  const row = computeCollectionMembershipChange(
    {
      productId: product.productId,
      productTitle: product.productTitle,
      status: product.status,
      inCollection: membershipByCollection?.get(collection.id)?.has(product.productId) === true,
    },
    action,
  );
  const existing = plan.collectionGroups.find(
    (group) => group.collectionId === collection.id && group.action === action,
  );
  if (existing) existing.rows.push(row);
  else {
    plan.collectionGroups.push({
      collectionId: collection.id,
      collectionTitle: collection.title,
      action,
      rows: [row],
    });
  }
}

function planMetafields(
  plan: ProductImportPlan,
  match: ProductImportMatch,
  columns: ProductImportMetafieldColumn[],
  definitions: Map<string, BulkMetafieldDefinition>,
  seen: Set<string>,
): void {
  const product = match.product;
  if (!product) return;
  for (const column of columns) {
    const rawValue = match.record.cells[column.cellKey] ?? "";
    if (column.owner === "variant" && !match.variant) {
      if (!rawValue) continue;
      plan.issues.push({
        rowNumber: match.record.rowNumber,
        code: "metafield_needs_sku",
        column: column.header,
        value: rawValue,
        productTitle: product.productTitle,
      });
      continue;
    }
    const ownerId = column.owner === "variant" ? match.variant?.variantId : product.productId;
    if (!ownerId) continue;
    const onceKey = `${ownerId}:${column.cellKey}`;
    if (seen.has(onceKey)) continue;
    seen.add(onceKey);
    const definition = definitions.get(`${column.owner}:${column.namespace}.${column.key}`.toLowerCase());
    const type = definition?.type ?? column.type ?? "";
    const current = (column.owner === "variant" ? match.variant?.metafields : product.metafields)?.find(
      (item) => item.namespace === column.namespace && item.key === column.key,
    );
    const row = computeMetafieldChange({
      ownerId,
      owner: column.owner,
      productId: product.productId,
      productTitle: product.productTitle,
      namespace: column.namespace,
      key: column.key,
      type,
      beforeValue: current?.value ?? "",
      rawValue,
      hasDefinition: Boolean(definition),
    });
    if (row.skipReason === "missing_definition") {
      plan.issues.push({
        rowNumber: match.record.rowNumber,
        code: "metafield_definition_missing",
        column: column.header,
        value: `${column.namespace}.${column.key}`,
        productTitle: product.productTitle,
      });
    } else if (row.skipReason === "unsupported_type") {
      plan.issues.push({
        rowNumber: match.record.rowNumber,
        code: "metafield_type_unsupported",
        column: column.header,
        value: type,
        productTitle: product.productTitle,
      });
    } else if (row.skipReason === "invalid_value") {
      plan.issues.push({
        rowNumber: match.record.rowNumber,
        code: "metafield_invalid_value",
        column: column.header,
        value: rawValue,
        productTitle: product.productTitle,
      });
    }
    plan.metafieldRows.push(row);
  }
}

export function sampleImportPlanForReview(
  plan: ProductImportPlan,
  limit = PRODUCT_IMPORT_REVIEW_ROW_LIMIT,
): ProductImportPlan {
  return {
    ...plan,
    priceRows: plan.priceRows.slice(0, limit),
    costRows: plan.costRows.slice(0, limit),
    tagRows: plan.tagRows.slice(0, limit),
    statusRows: plan.statusRows.slice(0, limit),
    fieldRows: plan.fieldRows.slice(0, limit),
    handleRows: plan.handleRows.slice(0, limit),
    collectionGroups: plan.collectionGroups.map((group) => ({
      ...group,
      rows: group.rows.slice(0, limit),
    })),
    metafieldRows: plan.metafieldRows.slice(0, limit),
    duplicateRows: plan.duplicateRows.slice(0, limit),
    archiveRows: plan.archiveRows.slice(0, limit),
    deleteRows: plan.deleteRows.slice(0, limit),
    identityRows: plan.identityRows.slice(0, limit),
  };
}

function collectPlanProductIds(plan: ProductImportPlan): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const push = (id: string) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  };
  for (const row of plan.priceRows) push(row.productId);
  for (const row of plan.costRows) push(row.productId);
  for (const row of plan.tagRows) push(row.productId);
  for (const row of plan.statusRows) push(row.productId);
  for (const row of plan.fieldRows) push(row.productId);
  for (const row of plan.handleRows) push(row.productId);
  for (const group of plan.collectionGroups) {
    for (const row of group.rows) push(row.productId);
  }
  for (const row of plan.metafieldRows) push(row.productId);
  for (const row of plan.duplicateRows) push(row.productId);
  for (const row of plan.archiveRows) push(row.productId);
  for (const row of plan.deleteRows) push(row.productId);
  for (const row of plan.identityRows) push(row.productId);
  return ids;
}

export function chunkImportPlanByProduct(
  plan: ProductImportPlan,
  size = PRODUCT_IMPORT_WORK_CHUNK_PRODUCTS,
): ProductImportPlan[] {
  const ids = collectPlanProductIds(plan);
  if (ids.length === 0) return [];
  const chunks: ProductImportPlan[] = [];
  for (let i = 0; i < ids.length; i += size) {
    const allowed = new Set(ids.slice(i, i + size));
    chunks.push({
      issues: [],
      operations: plan.operations,
      priceRows: plan.priceRows.filter((row) => allowed.has(row.productId)),
      costRows: plan.costRows.filter((row) => allowed.has(row.productId)),
      tagRows: plan.tagRows.filter((row) => allowed.has(row.productId)),
      statusRows: plan.statusRows.filter((row) => allowed.has(row.productId)),
      fieldRows: plan.fieldRows.filter((row) => allowed.has(row.productId)),
      handleRows: plan.handleRows.filter((row) => allowed.has(row.productId)),
      collectionGroups: plan.collectionGroups
        .map((group) => ({
          ...group,
          rows: group.rows.filter((row) => allowed.has(row.productId)),
        }))
        .filter((group) => group.rows.length > 0),
      metafieldRows: plan.metafieldRows.filter((row) => allowed.has(row.productId)),
      duplicateRows: plan.duplicateRows.filter((row) => allowed.has(row.productId)),
      archiveRows: plan.archiveRows.filter((row) => allowed.has(row.productId)),
      deleteRows: plan.deleteRows.filter((row) => allowed.has(row.productId)),
      identityRows: plan.identityRows.filter((row) => allowed.has(row.productId)),
    });
  }
  return chunks;
}

export function countImportWritable(plan: ProductImportPlan): number {
  const collections = plan.collectionGroups.flatMap((group) => group.rows);
  return (
    plan.priceRows.filter((row) => !row.skipped).length +
    plan.costRows.filter((row) => !row.skipped).length +
    plan.tagRows.filter((row) => !row.skipped).length +
    plan.statusRows.filter((row) => !row.skipped).length +
    plan.fieldRows.filter((row) => !row.skipped).length +
    plan.handleRows.filter((row) => !row.skipped).length +
    collections.filter((row) => !row.skipped).length +
    plan.metafieldRows.filter((row) => !row.skipped).length +
    plan.duplicateRows.filter((row) => !row.skipped).length +
    plan.archiveRows.filter((row) => !row.skipped).length +
    plan.deleteRows.filter((row) => !row.skipped).length +
    plan.identityRows.filter((row) => !row.skipped).length
  );
}
