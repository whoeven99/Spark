/**
 * 把已匹配的店铺快照 + 导入行收成各能力现有的 changeset 行。纯算。
 */
import {
  formatCentsToMoney,
  parseMoneyToCents,
  type BulkPriceEditRow,
} from "./bulkPriceEdit";
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
  parseImportBool,
  parseImportCollectionAction,
  parseImportStatus,
  parseImportTags,
  rowHasBlockingIssue,
  type ProductImportIssue,
  type ProductImportOperation,
  type ProductImportRecord,
} from "./productImport";

export type ProductImportVariantSnapshot = {
  variantId: string;
  title: string;
  sku: string | null;
  price: string | null;
  compareAtPrice: string | null;
};

export type ProductImportProductSnapshot = {
  productId: string;
  productTitle: string;
  handle: string;
  vendor: string;
  productType: string;
  seoTitle: string;
  seoDescription: string;
  tags: string[];
  status: string;
  totalInventory: number;
  tracksInventory: boolean;
  publishedAt: string | null;
  variants: ProductImportVariantSnapshot[];
};

export type ProductImportCollectionRef = {
  id: string;
  title: string;
  writable: boolean;
};

export type ProductImportMatch = {
  record: ProductImportRecord;
  product: ProductImportProductSnapshot | null;
  variant: ProductImportVariantSnapshot | null;
  matchIssues: ProductImportIssue[];
};

function pushIssue(
  issues: ProductImportIssue[],
  rowNumber: number,
  code: ProductImportIssue["code"],
  column?: string,
  value?: string,
): void {
  issues.push({ rowNumber, code, ...(column ? { column } : {}), ...(value ? { value } : {}) });
}

export function matchImportRecord(
  record: ProductImportRecord,
  catalog: {
    byHandle: Map<string, ProductImportProductSnapshot>;
    byId: Map<string, ProductImportProductSnapshot>;
    bySku: Map<string, ProductImportProductSnapshot[]>;
  },
): ProductImportMatch {
  const matchIssues: ProductImportIssue[] = [];
  let product: ProductImportProductSnapshot | null = null;
  let variant: ProductImportVariantSnapshot | null = null;

  if (record.sku) {
    const skuKey = record.sku.toLowerCase();
    const skuHits = catalog.bySku.get(skuKey) ?? [];
    const variants = skuHits.flatMap((item) =>
      item.variants
        .filter((candidate) => (candidate.sku ?? "").toLowerCase() === skuKey)
        .map((candidate) => ({ product: item, variant: candidate })),
    );
    if (variants.length === 0) {
      pushIssue(matchIssues, record.rowNumber, "sku_not_found", "sku", record.sku);
    } else if (variants.length > 1) {
      pushIssue(matchIssues, record.rowNumber, "sku_matches_multiple", "sku", record.sku);
    } else {
      product = variants[0].product;
      variant = variants[0].variant;
    }
  }

  if (!product && record.handle) {
    product = catalog.byHandle.get(record.handle.toLowerCase()) ?? null;
    if (!product) pushIssue(matchIssues, record.rowNumber, "handle_not_found", "handle", record.handle);
  }

  if (!product && record.productId) {
    product = catalog.byId.get(record.productId) ?? catalog.byId.get(normalizeGid(record.productId)) ?? null;
    if (!product) pushIssue(matchIssues, record.rowNumber, "handle_not_found", "product_id", record.productId);
  }

  if (product && !variant && product.variants.length === 1) {
    variant = product.variants[0];
  }

  return { record, product, variant, matchIssues };
}

export function normalizeGid(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("gid://")) return trimmed;
  if (/^\d+$/.test(trimmed)) return `gid://shopify/Product/${trimmed}`;
  return trimmed;
}

export type ProductImportCollectionGroup = {
  collectionId: string;
  collectionTitle: string;
  action: "add" | "remove";
  rows: BulkCollectionEditRow[];
};

export type ProductImportPlan = {
  issues: ProductImportIssue[];
  operations: ProductImportOperation[];
  priceRows: BulkPriceEditRow[];
  tagRows: BulkTagEditRow[];
  statusRows: BulkStatusEditRow[];
  fieldRows: BulkProductFieldEditRow[];
  collectionGroups: ProductImportCollectionGroup[];
  duplicateRows: ProductDuplicateRow[];
  archiveRows: BulkArchiveRow[];
};

export function buildProductImportPlan(args: {
  matches: ProductImportMatch[];
  sheetIssues: ProductImportIssue[];
  operations: ProductImportOperation[];
  collections: ProductImportCollectionRef[];
  membershipByCollection?: Map<string, Set<string>>;
}): ProductImportPlan {
  const issues = [...args.sheetIssues];
  const plan: ProductImportPlan = {
    issues,
    operations: args.operations,
    priceRows: [],
    tagRows: [],
    statusRows: [],
    fieldRows: [],
    collectionGroups: [],
    duplicateRows: [],
    archiveRows: [],
  };
  const collectionIndex = indexCollections(args.collections);
  const seenProductOps = new Set<string>();
  for (const match of args.matches) {
    issues.push(...match.matchIssues);
    if (rowHasBlockingIssue(issues, match.record.rowNumber)) continue;
    if (!match.product) continue;
    planPrice(plan, match);
    planProductLevel(plan, match, seenProductOps, collectionIndex, args.membershipByCollection);
  }
  capDuplicates(plan, issues);
  return plan;
}

function indexCollections(
  collections: ProductImportCollectionRef[],
): Map<string, ProductImportCollectionRef> {
  const map = new Map<string, ProductImportCollectionRef>();
  for (const collection of collections) {
    map.set(collection.id, collection);
    map.set(collection.title.trim().toLowerCase(), collection);
  }
  return map;
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
  const afterCents = record.cells.price
    ? parseMoneyToCents(record.cells.price.replace(/,/g, ""))
    : beforeCents;
  const beforeCompare = parseMoneyToCents(variant.compareAtPrice);
  const afterCompare = record.cells.compare_at
    ? parseMoneyToCents(record.cells.compare_at.replace(/,/g, ""))
    : beforeCompare;
  const afterPrice = afterCents != null ? formatCentsToMoney(afterCents) : formatCentsToMoney(beforeCents ?? 0);
  const afterCompareAt = afterCompare != null ? formatCentsToMoney(afterCompare) : null;
  const beforePrice = beforeCents != null ? formatCentsToMoney(beforeCents) : "";
  const priceChanged = Boolean(record.cells.price) && afterPrice !== beforePrice;
  const compareAtChanged =
    Boolean(record.cells.compare_at) && (afterCompareAt ?? "") !== (beforeCompare != null ? formatCentsToMoney(beforeCompare) : "");
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

function planProductLevel(
  plan: ProductImportPlan,
  match: ProductImportMatch,
  seen: Set<string>,
  collections: Map<string, ProductImportCollectionRef>,
  membershipByCollection?: Map<string, Set<string>>,
): void {
  const product = match.product;
  if (!product) return;
  const record = match.record;
  const once = (operation: string): boolean => {
    const key = `${product.productId}:${operation}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  };

  if (plan.operations.includes("vendor") && record.cells.vendor && once("vendor")) {
    plan.fieldRows.push(
      computeProductFieldChange(product, { field: "vendor", mode: "set", value: record.cells.vendor }),
    );
  }
  if (plan.operations.includes("productType") && record.cells.product_type && once("productType")) {
    plan.fieldRows.push(
      computeProductFieldChange(product, {
        field: "productType",
        mode: "set",
        value: record.cells.product_type,
      }),
    );
  }
  if (plan.operations.includes("seoTitle") && record.cells.seo_title && once("seoTitle")) {
    plan.fieldRows.push(
      computeProductFieldChange(product, { field: "seoTitle", mode: "set", value: record.cells.seo_title }),
    );
  }
  if (plan.operations.includes("seoDescription") && record.cells.seo_description && once("seoDescription")) {
    plan.fieldRows.push(
      computeProductFieldChange(product, {
        field: "seoDescription",
        mode: "set",
        value: record.cells.seo_description,
      }),
    );
  }
  if (plan.operations.includes("tags") && once("tags")) {
    plan.tagRows.push(planTags(product, record));
  }
  if (plan.operations.includes("status") && record.cells.status && once("status")) {
    const target = parseImportStatus(record.cells.status);
    if (target === "ARCHIVED") {
      plan.archiveRows.push(computeProductArchive(product));
    } else if (target === "ACTIVE" || target === "DRAFT") {
      plan.statusRows.push(planStatus(product, target));
    }
  }
  if (plan.operations.includes("archive") && parseImportBool(record.cells.archive) === true && once("archive")) {
    plan.archiveRows.push(computeProductArchive(product));
  }
  if (plan.operations.includes("duplicate") && parseImportBool(record.cells.duplicate) === true && once("duplicate")) {
    const statusRaw = parseImportStatus(record.cells.duplicate_status);
    plan.duplicateRows.push(
      computeProductDuplicate(product, {
        titleSuffix: record.cells.duplicate_suffix || PRODUCT_DUPLICATE_DEFAULT_SUFFIX,
        includeImages: parseImportBool(record.cells.duplicate_images) !== false,
        newStatus: statusRaw === "ACTIVE" ? "ACTIVE" : "DRAFT",
      }),
    );
  }
  if (plan.operations.includes("collection") && record.cells.collection && once("collection")) {
    planCollection(plan, product, record, collections, membershipByCollection);
  }
}

function planTags(product: ProductImportProductSnapshot, record: ProductImportRecord): BulkTagEditRow {
  if (record.cells.tags) {
    const desired = parseImportTags(record.cells.tags);
    const desiredKeys = new Set(desired.map((tag) => tag.toLowerCase()));
    const beforeKeys = new Set(product.tags.map((tag) => tag.toLowerCase()));
    const addTags = desired.filter((tag) => !beforeKeys.has(tag.toLowerCase()));
    const removeTags = product.tags.filter((tag) => !desiredKeys.has(tag.toLowerCase()));
    return computeProductTagChange(product, { addTags, removeTags, removePrefixes: [] });
  }
  return computeProductTagChange(product, {
    addTags: parseImportTags(record.cells.add_tags),
    removeTags: parseImportTags(record.cells.remove_tags),
    removePrefixes: [],
  });
}

function planStatus(
  product: ProductImportProductSnapshot,
  target: "ACTIVE" | "DRAFT",
): BulkStatusEditRow {
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
  record: ProductImportRecord,
  collections: Map<string, ProductImportCollectionRef>,
  membershipByCollection?: Map<string, Set<string>>,
): void {
  const action = parseImportCollectionAction(record.cells.collection_action) ?? "add";
  const key = record.cells.collection.trim().toLowerCase();
  const collection = collections.get(record.cells.collection) ?? collections.get(key);
  if (!collection) {
    plan.issues.push({
      rowNumber: record.rowNumber,
      code: "collection_not_found",
      column: "collection",
      value: record.cells.collection,
    });
    return;
  }
  if (!collection.writable) {
    plan.issues.push({
      rowNumber: record.rowNumber,
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

function capDuplicates(plan: ProductImportPlan, issues: ProductImportIssue[]): void {
  if (plan.duplicateRows.length <= PRODUCT_DUPLICATE_MAX_PRODUCTS) return;
  const extra = plan.duplicateRows.slice(PRODUCT_DUPLICATE_MAX_PRODUCTS);
  plan.duplicateRows = plan.duplicateRows.slice(0, PRODUCT_DUPLICATE_MAX_PRODUCTS);
  for (const row of extra) {
    issues.push({
      rowNumber: 0,
      code: "duplicate_over_limit",
      value: row.productTitle,
    });
  }
}

export function countImportWritable(plan: ProductImportPlan): number {
  const collections = plan.collectionGroups.flatMap((group) => group.rows);
  return (
    plan.priceRows.filter((row) => !row.skipped).length +
    plan.tagRows.filter((row) => !row.skipped).length +
    plan.statusRows.filter((row) => !row.skipped).length +
    plan.fieldRows.filter((row) => !row.skipped).length +
    collections.filter((row) => !row.skipped).length +
    plan.duplicateRows.filter((row) => !row.skipped).length +
    plan.archiveRows.filter((row) => !row.skipped).length
  );
}
