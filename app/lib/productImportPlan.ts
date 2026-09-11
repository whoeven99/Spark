/**
 * 把已匹配的店铺快照 + 导入行收成各能力现有的 changeset 行。纯算。
 */
import type { BulkMetafieldDefinition, BulkMetafieldValue, ProductImportMetafieldColumn } from "./bulkMetafieldEdit";
import {
  rowHasBlockingIssue,
  type ProductImportIssue,
  type ProductImportOperation,
  type ProductImportRecord,
} from "./productImport";
import {
  capDuplicates,
  emptyImportPlan,
  planMatchedImportRow,
  type ProductImportPlan,
} from "./productImportPlanOps";

export type { ProductImportPlan } from "./productImportPlanOps";
export { countImportWritable } from "./productImportPlanOps";

export type ProductImportVariantSnapshot = {
  variantId: string;
  title: string;
  sku: string | null;
  price: string | null;
  compareAtPrice: string | null;
  inventoryItemId: string | null;
  cost: string | null;
  metafields: BulkMetafieldValue[];
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
}): ProductImportPlan {
  const issues = [...args.sheetIssues];
  const plan = emptyImportPlan(args.operations, issues);
  const collectionIndex = indexCollections(args.collections);
  const catalogProducts = args.matches
    .map((match) => match.product)
    .filter((item): item is ProductImportProductSnapshot => Boolean(item));
  const handleOwners = seedHandleOwners(catalogProducts);
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
    });
  }
  capDuplicates(plan, issues);
  return plan;
}
