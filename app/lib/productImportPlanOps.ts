/**
 * 导入行 → 各能力 changeset。从 productImportPlan 拆出，避免编排文件过长。
 */
import { formatCentsToMoney, parseMoneyToCents, type BulkPriceEditRow } from "./bulkPriceEdit";
import { computeVariantCostChange, type BulkCostEditRow } from "./bulkCostEdit";
import { computeProductTagChange, type BulkTagEditRow } from "./bulkTagEdit";
import type { BulkStatusEditRow } from "./bulkStatusEdit";
import { computeProductFieldChange, type BulkProductFieldEditRow } from "./bulkProductFieldEdit";
import { computeCollectionMembershipChange, type BulkCollectionEditRow } from "./bulkCollectionEdit";
import {
  computeProductDuplicate,
  PRODUCT_DUPLICATE_DEFAULT_SUFFIX,
  PRODUCT_DUPLICATE_MAX_PRODUCTS,
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
  parseImportBool,
  parseImportCollectionAction,
  parseImportStatus,
  parseImportTags,
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
}): void {
  const { plan, match } = args;
  if (!match.product) return;
  if (plan.operations.includes("delete") && parseImportBool(match.record.cells.delete) === true) {
    planDelete(plan, match, args.seen);
    return;
  }
  planPrice(plan, match);
  planCost(plan, match);
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

function planPrice(plan: ProductImportPlan, match: ProductImportMatch): void {
  if (!plan.operations.includes("price")) return;
  const { record, product, variant } = match;
  if (!product) return;
  const hasPrice = Boolean(record.cells.price || record.cells.compare_at);
  if (!hasPrice) return;
  if (!variant) {
    plan.issues.push({
      rowNumber: record.rowNumber,
      code: "price_needs_sku",
      column: "price",
      value: record.cells.price,
    });
    return;
  }
  const beforeCents = parseMoneyToCents(variant.price);
  const afterCents = record.cells.price ? parseMoneyToCents(record.cells.price.replace(/,/g, "")) : beforeCents;
  const beforeCompare = parseMoneyToCents(variant.compareAtPrice);
  const afterCompare = record.cells.compare_at
    ? parseMoneyToCents(record.cells.compare_at.replace(/,/g, ""))
    : beforeCompare;
  const afterPrice = afterCents != null ? formatCentsToMoney(afterCents) : formatCentsToMoney(beforeCents ?? 0);
  const afterCompareAt = afterCompare != null ? formatCentsToMoney(afterCompare) : null;
  const beforePrice = beforeCents != null ? formatCentsToMoney(beforeCents) : "";
  const priceChanged = Boolean(record.cells.price) && afterPrice !== beforePrice;
  const compareAtChanged =
    Boolean(record.cells.compare_at) &&
    (afterCompareAt ?? "") !== (beforeCompare != null ? formatCentsToMoney(beforeCompare) : "");
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
    skipped: !priceChanged && !compareAtChanged,
    ...(priceChanged || compareAtChanged ? {} : { skipReason: "no_change" }),
  });
}

function planCost(plan: ProductImportPlan, match: ProductImportMatch): void {
  if (!plan.operations.includes("cost") || !match.record.cells.cost || !match.product) return;
  if (!match.variant) {
    plan.issues.push({
      rowNumber: match.record.rowNumber,
      code: "cost_needs_sku",
      column: "cost",
      value: match.record.cells.cost,
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
  },
): void {
  const product = match.product;
  if (!product) return;
  const record = match.record;
  const seen = args.seen;
  if (plan.operations.includes("title") && record.cells.title && once(seen, product.productId, "title")) {
    plan.fieldRows.push(
      computeProductFieldChange(toFieldInput(product), { field: "title", mode: "set", value: record.cells.title }),
    );
  }
  if (plan.operations.includes("descriptionHtml") && record.cells.body_html && once(seen, product.productId, "body")) {
    plan.fieldRows.push(
      computeProductFieldChange(toFieldInput(product), {
        field: "descriptionHtml",
        mode: "set",
        value: record.cells.body_html,
      }),
    );
  }
  if (plan.operations.includes("vendor") && record.cells.vendor && once(seen, product.productId, "vendor")) {
    plan.fieldRows.push(
      computeProductFieldChange(toFieldInput(product), { field: "vendor", mode: "set", value: record.cells.vendor }),
    );
  }
  if (plan.operations.includes("productType") && record.cells.product_type && once(seen, product.productId, "productType")) {
    plan.fieldRows.push(
      computeProductFieldChange(toFieldInput(product), {
        field: "productType",
        mode: "set",
        value: record.cells.product_type,
      }),
    );
  }
  if (plan.operations.includes("seoTitle") && record.cells.seo_title && once(seen, product.productId, "seoTitle")) {
    plan.fieldRows.push(
      computeProductFieldChange(toFieldInput(product), { field: "seoTitle", mode: "set", value: record.cells.seo_title }),
    );
  }
  if (
    plan.operations.includes("seoDescription") &&
    record.cells.seo_description &&
    once(seen, product.productId, "seoDescription")
  ) {
    plan.fieldRows.push(
      computeProductFieldChange(toFieldInput(product), {
        field: "seoDescription",
        mode: "set",
        value: record.cells.seo_description,
      }),
    );
  }
  if (plan.operations.includes("handle") && record.cells.new_handle && once(seen, product.productId, "handle")) {
    planHandle(plan, match, args.handleOwners);
  }
  if (plan.operations.includes("tags") && once(seen, product.productId, "tags")) {
    plan.tagRows.push(planTags(product, record.cells));
  }
  if (plan.operations.includes("status") && record.cells.status && once(seen, product.productId, "status")) {
    const target = parseImportStatus(record.cells.status);
    if (target === "ARCHIVED") plan.archiveRows.push(computeProductArchive(product));
    else if (target === "ACTIVE" || target === "DRAFT") plan.statusRows.push(planStatus(product, target));
  }
  if (plan.operations.includes("archive") && parseImportBool(record.cells.archive) === true && once(seen, product.productId, "archive")) {
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
    });
  } else if (row.skipReason === "handle_taken") {
    plan.issues.push({
      rowNumber: match.record.rowNumber,
      code: "handle_taken",
      column: "new_handle",
      value: afterHandle,
    });
  } else if (!row.skipped) {
    handleOwners.set(afterHandle, product.productId);
  }
  plan.handleRows.push(row);
}

function planTags(product: ProductImportProductSnapshot, cells: Record<string, string>): BulkTagEditRow {
  if (cells.tags) {
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
    plan.issues.push({ rowNumber, code: "collection_not_found", column: "collection", value: cells.collection });
    return;
  }
  if (!collection.writable) {
    plan.issues.push({
      rowNumber,
      code: "collection_not_writable",
      column: "collection",
      value: collection.title,
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
    const rawValue = match.record.cells[column.cellKey];
    if (rawValue == null || rawValue === "") continue;
    if (column.owner === "variant" && !match.variant) {
      plan.issues.push({
        rowNumber: match.record.rowNumber,
        code: "metafield_needs_sku",
        column: column.header,
        value: rawValue,
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
      });
    } else if (row.skipReason === "unsupported_type") {
      plan.issues.push({
        rowNumber: match.record.rowNumber,
        code: "metafield_type_unsupported",
        column: column.header,
        value: type,
      });
    } else if (row.skipReason === "invalid_value") {
      plan.issues.push({
        rowNumber: match.record.rowNumber,
        code: "metafield_invalid_value",
        column: column.header,
        value: rawValue,
      });
    }
    plan.metafieldRows.push(row);
  }
}

export function capDuplicates(plan: ProductImportPlan, issues: ProductImportIssue[]): void {
  if (plan.duplicateRows.length <= PRODUCT_DUPLICATE_MAX_PRODUCTS) return;
  const extra = plan.duplicateRows.slice(PRODUCT_DUPLICATE_MAX_PRODUCTS);
  plan.duplicateRows = plan.duplicateRows.slice(0, PRODUCT_DUPLICATE_MAX_PRODUCTS);
  for (const row of extra) {
    issues.push({ rowNumber: 0, code: "duplicate_over_limit", value: row.productTitle });
  }
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
    plan.deleteRows.filter((row) => !row.skipped).length
  );
}
