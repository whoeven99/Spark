/**
 * 把已匹配的店铺快照 + 导入行收成各能力现有的 changeset 行。纯算。
 */
import type { BulkMetafieldDefinition, BulkMetafieldValue, ProductImportMetafieldColumn } from "./bulkMetafieldEdit";
import {
  rowHasBlockingIssue,
  type ProductImportIssue,
  type ProductImportOperation,
  type ProductImportRecord,
  normalizeImportSku,
  stripExcelTextPrefix,
} from "./productImport";
import {
  emptyImportPlan,
  planMatchedImportRow,
  type ProductImportPlan,
} from "./productImportPlanOps";

export type { ProductImportPlan } from "./productImportPlanOps";
export { countImportWritable, chunkImportPlanByProduct, sampleImportPlanForReview } from "./productImportPlanOps";

export type ProductImportVariantSnapshot = {
  variantId: string;
  title: string;
  sku: string | null;
  price: string | null;
  compareAtPrice: string | null;
  inventoryItemId: string | null;
  cost: string | null;
  metafields: BulkMetafieldValue[];
  selectedOptions?: Array<{ name: string; value: string }>;
};

export type ProductImportProductSnapshot = {
  productId: string;
  productTitle: string;
  handle: string;
  descriptionHtml: string;
  vendor: string;
  productType: string;
  seoTitle: string;
  seoDescription: string;
  tags: string[];
  status: string;
  totalInventory: number;
  tracksInventory: boolean;
  publishedAt: string | null;
  metafields: BulkMetafieldValue[];
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
  productTitle?: string,
): void {
  issues.push({
    rowNumber,
    code,
    ...(column ? { column } : {}),
    ...(value ? { value } : {}),
    ...(productTitle ? { productTitle } : {}),
  });
}

export type ImportCatalogIndex = {
  byHandle: Map<string, ProductImportProductSnapshot>;
  byId: Map<string, ProductImportProductSnapshot>;
  bySku: Map<string, ProductImportProductSnapshot[]>;
};

type SkuHit = {
  product: ProductImportProductSnapshot;
  variant: ProductImportVariantSnapshot;
};

function catalogSkuKey(sku: string | null | undefined): string {
  return normalizeImportSku(sku ?? "").toLowerCase();
}

function uniqueVariants(items: ProductImportVariantSnapshot[]): ProductImportVariantSnapshot[] {
  const seen = new Set<string>();
  const out: ProductImportVariantSnapshot[] = [];
  for (const item of items) {
    if (seen.has(item.variantId)) continue;
    seen.add(item.variantId);
    out.push(item);
  }
  return out;
}

function collectSkuHits(skuKey: string, catalog: ImportCatalogIndex): SkuHit[] {
  if (!skuKey) return [];
  const skuHits = catalog.bySku.get(skuKey) ?? [];
  const hits: SkuHit[] = [];
  const seen = new Set<string>();
  for (const item of skuHits) {
    for (const candidate of item.variants) {
      if (catalogSkuKey(candidate.sku) !== skuKey) continue;
      if (seen.has(candidate.variantId)) continue;
      seen.add(candidate.variantId);
      hits.push({ product: item, variant: candidate });
    }
  }
  return hits;
}

function recordOptionKey(record: ProductImportRecord): string {
  return [record.option1, record.option2, record.option3]
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .join(" / ");
}

function variantOptionKey(variant: ProductImportVariantSnapshot): string {
  const selected = variant.selectedOptions ?? [];
  if (selected.length > 0) {
    return selected
      .map((option) => option.value.trim().toLowerCase())
      .filter(Boolean)
      .join(" / ");
  }
  return variant.title.trim().toLowerCase();
}

function variantsMatchingOptions(
  product: ProductImportProductSnapshot,
  record: ProductImportRecord,
): ProductImportVariantSnapshot[] {
  const key = recordOptionKey(record);
  if (!key) return [];
  return uniqueVariants(product.variants.filter((variant) => variantOptionKey(variant) === key));
}

function variantsMatchingSku(
  product: ProductImportProductSnapshot,
  skuKey: string,
): ProductImportVariantSnapshot[] {
  if (!skuKey) return [];
  return uniqueVariants(product.variants.filter((variant) => catalogSkuKey(variant.sku) === skuKey));
}

function lookupProductById(
  productId: string,
  catalog: ImportCatalogIndex,
): ProductImportProductSnapshot | null {
  return catalog.byId.get(productId) ?? catalog.byId.get(normalizeGid(productId)) ?? null;
}

function lookupProductByHandle(
  handle: string,
  catalog: ImportCatalogIndex,
): ProductImportProductSnapshot | null {
  return catalog.byHandle.get(handle.toLowerCase()) ?? null;
}

function findCatalogProduct(
  record: ProductImportRecord,
  catalog: ImportCatalogIndex,
): { product: ProductImportProductSnapshot | null; handleMissing: boolean; idMissing: boolean } {
  let product: ProductImportProductSnapshot | null = null;
  let idMissing = false;
  if (record.productId) {
    product = lookupProductById(record.productId, catalog);
    idMissing = !product;
  }
  if (!product && record.handle) {
    product = lookupProductByHandle(record.handle, catalog);
  }
  return { product, handleMissing: Boolean(record.handle) && !product, idMissing: idMissing && !product };
}

function resolveVariantInProduct(
  product: ProductImportProductSnapshot,
  record: ProductImportRecord,
  matchIssues: ProductImportIssue[],
): ProductImportVariantSnapshot | null {
  const skuKey = catalogSkuKey(record.sku);
  const byOptions = variantsMatchingOptions(product, record);
  if (byOptions.length === 1) return byOptions[0] ?? null;
  const bySku = variantsMatchingSku(product, skuKey);
  if (bySku.length === 1) return bySku[0] ?? null;
  const both = uniqueVariants(
    bySku.filter((variant) => byOptions.some((item) => item.variantId === variant.variantId)),
  );
  if (both.length === 1) return both[0] ?? null;
  if (bySku.length > 1 || byOptions.length > 1) {
    pushIssue(matchIssues, record.rowNumber, "sku_matches_multiple", "sku", record.sku || recordOptionKey(record));
    return null;
  }
  if (skuKey) {
    pushIssue(matchIssues, record.rowNumber, "sku_not_found", "sku", record.sku);
    return null;
  }
  if (product.variants.length === 1) return product.variants[0] ?? null;
  return null;
}

function matchByUniqueSku(
  record: ProductImportRecord,
  catalog: ImportCatalogIndex,
  matchIssues: ProductImportIssue[],
): { product: ProductImportProductSnapshot | null; variant: ProductImportVariantSnapshot | null } {
  const skuKey = catalogSkuKey(record.sku);
  const hits = collectSkuHits(skuKey, catalog);
  if (hits.length === 1) {
    return { product: hits[0]?.product ?? null, variant: hits[0]?.variant ?? null };
  }
  if (hits.length === 0) {
    pushIssue(matchIssues, record.rowNumber, "sku_not_found", "sku", record.sku);
    return { product: null, variant: null };
  }
  const productIds = new Set(hits.map((hit) => hit.product.productId));
  if (productIds.size === 1 && hits[0]) {
    const variant = resolveVariantInProduct(hits[0].product, record, matchIssues);
    return { product: hits[0].product, variant };
  }
  pushIssue(matchIssues, record.rowNumber, "sku_matches_multiple", "sku", record.sku);
  return { product: null, variant: null };
}

export function matchImportRecord(
  record: ProductImportRecord,
  catalog: ImportCatalogIndex,
): ProductImportMatch {
  const matchIssues: ProductImportIssue[] = [];
  const found = findCatalogProduct(record, catalog);
  if (found.product) {
    const variant = resolveVariantInProduct(found.product, record, matchIssues);
    return { record, product: found.product, variant, matchIssues };
  }
  if (record.sku) {
    const matched = matchByUniqueSku(record, catalog, matchIssues);
    return { record, product: matched.product, variant: matched.variant, matchIssues };
  }
  if (found.handleMissing) {
    pushIssue(matchIssues, record.rowNumber, "handle_not_found", "handle", record.handle);
  } else if (found.idMissing) {
    pushIssue(matchIssues, record.rowNumber, "product_id_not_found", "product_id", record.productId);
  }
  return { record, product: null, variant: null, matchIssues };
}

function stickMatchToPreviousProduct(
  direct: ProductImportMatch,
  lastProduct: ProductImportProductSnapshot,
): ProductImportMatch {
  const matchIssues = direct.matchIssues.filter(
    (issue) => issue.code !== "handle_not_found" && issue.code !== "product_id_not_found",
  );
  const variant = resolveVariantInProduct(lastProduct, direct.record, matchIssues);
  return { ...direct, product: lastProduct, variant, matchIssues };
}

export function matchImportRecords(
  records: ProductImportRecord[],
  catalog: ImportCatalogIndex,
): ProductImportMatch[] {
  const matches: ProductImportMatch[] = [];
  let lastProduct: ProductImportProductSnapshot | null = null;
  let lastHandleKey = "";
  for (const record of records) {
    const direct = matchImportRecord(record, catalog);
    const handleKey = record.handle.trim().toLowerCase();
    if (!direct.product && lastProduct && handleKey && handleKey === lastHandleKey) {
      matches.push(stickMatchToPreviousProduct(direct, lastProduct));
      continue;
    }
    if (direct.product) {
      lastProduct = direct.product;
      lastHandleKey = handleKey || direct.product.handle.toLowerCase();
    } else if (handleKey !== lastHandleKey) {
      lastProduct = null;
      lastHandleKey = "";
    }
    matches.push(direct);
  }
  return matches;
}

export function normalizeGid(raw: string): string {
  const trimmed = stripExcelTextPrefix(raw);
  if (trimmed.startsWith("gid://")) return trimmed;
  if (/^\d+$/.test(trimmed)) return `gid://shopify/Product/${trimmed}`;
  return trimmed;
}

export type ProductImportCollectionGroup = {
  collectionId: string;
  collectionTitle: string;
  action: "add" | "remove";
  rows: import("./bulkCollectionEdit").BulkCollectionEditRow[];
};

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

function seedHandleOwners(products: ProductImportProductSnapshot[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const product of products) {
    if (product.handle) map.set(product.handle.toLowerCase(), product.productId);
  }
  return map;
}

export function buildProductImportPlan(args: {
  matches: ProductImportMatch[];
  sheetIssues: ProductImportIssue[];
  operations: ProductImportOperation[];
  collections: ProductImportCollectionRef[];
  membershipByCollection?: Map<string, Set<string>>;
  metafields?: ProductImportMetafieldColumn[];
  definitions?: Map<string, BulkMetafieldDefinition>;
  columnKeys?: Iterable<string>;
}): ProductImportPlan {
  const issues = [...args.sheetIssues];
  const plan = emptyImportPlan(args.operations, issues);
  const collectionIndex = indexCollections(args.collections);
  const catalogProducts = args.matches
    .map((match) => match.product)
    .filter((item): item is ProductImportProductSnapshot => Boolean(item));
  const handleOwners = seedHandleOwners(catalogProducts);
  const columnKeys = new Set(args.columnKeys ?? []);
  const seen = new Set<string>();
  for (const match of args.matches) {
    issues.push(...match.matchIssues);
    if (rowHasBlockingIssue(issues, match.record.rowNumber)) continue;
    if (!match.product) continue;
    planMatchedImportRow({
      plan,
      match,
      seen,
      collections: collectionIndex,
      membershipByCollection: args.membershipByCollection,
      metafields: args.metafields ?? [],
      definitions: args.definitions ?? new Map(),
      handleOwners,
      columnKeys,
    });
  }
  return plan;
}
