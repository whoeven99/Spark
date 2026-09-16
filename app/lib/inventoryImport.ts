/**
 * 库存 CSV 导入：把 On hand (new) 写成该仓在库。纯算。
 * 匹配键：Handle + Location（大小写敏感）+ Option 值；SKU 只辅助。
 */
import {
  optionKey,
  parseNonNegativeInt,
  type InventoryCsvRecord,
} from "./inventoryCsv";
import { toCsv } from "./csv";

export const INVENTORY_IMPORT_SKILL_ID = "inventory_import";
export const INVENTORY_IMPORT_MUTATION_BATCH = 50;

export type InventoryImportIssueCode =
  | "missing_location"
  | "missing_identity"
  | "missing_on_hand_new"
  | "invalid_on_hand"
  | "wrong_sheet"
  | "location_not_found"
  | "location_not_writable"
  | "handle_not_found"
  | "sku_not_found"
  | "sku_matches_multiple"
  | "untracked"
  | "not_stocked"
  | "stale_on_hand"
  | "on_hand_below_committed";

export type InventoryImportIssue = {
  rowNumber: number;
  code: InventoryImportIssueCode;
  column?: string;
  value?: string;
  productTitle?: string;
};

export type InventoryImportLevelSnapshot = {
  locationId: string;
  locationName: string;
  writable: boolean;
  stocked: boolean;
  available: number;
  onHand: number;
  committed: number;
  incoming: number;
  unavailable: number;
};

export type InventoryImportVariantSnapshot = {
  variantId: string;
  title: string;
  sku: string | null;
  inventoryItemId: string;
  tracked: boolean;
  option1Name: string;
  option1: string;
  option2Name: string;
  option2: string;
  option3Name: string;
  option3: string;
  levels: InventoryImportLevelSnapshot[];
};

export type InventoryImportProductSnapshot = {
  productId: string;
  productTitle: string;
  handle: string;
  variants: InventoryImportVariantSnapshot[];
};

export type InventoryImportLocationRef = {
  id: string;
  name: string;
  writable: boolean;
};

export type InventoryImportRow = {
  rowNumber: number;
  variantId: string;
  productId: string;
  productTitle: string;
  variantTitle: string;
  sku: string | null;
  inventoryItemId: string;
  locationId: string;
  locationName: string;
  beforeOnHand: number;
  afterOnHand: number;
  committed: number;
  availableEstimate: number;
  skipped: boolean;
  skipReason?: InventoryImportIssueCode | "no_change" | "empty_new";
};

export type InventoryImportSummary = {
  rows: number;
  changed: number;
  skipped: number;
  issues: number;
};

export type InventoryImportApplyOutcome = {
  at: string;
  succeeded: number;
  failed: number;
  errors: Array<{ variantId: string; locationId: string; message: string }>;
};

function skuKey(sku: string | null | undefined): string {
  return (sku ?? "").trim().toLowerCase();
}

function handleKey(handle: string): string {
  return handle.trim().toLowerCase();
}

export function indexInventoryImportCatalog(products: InventoryImportProductSnapshot[]): {
  byHandle: Map<string, InventoryImportProductSnapshot>;
  bySku: Map<string, Array<{ product: InventoryImportProductSnapshot; variant: InventoryImportVariantSnapshot }>>;
} {
  const byHandle = new Map<string, InventoryImportProductSnapshot>();
  const bySku = new Map<
    string,
    Array<{ product: InventoryImportProductSnapshot; variant: InventoryImportVariantSnapshot }>
  >();
  for (const product of products) {
    byHandle.set(handleKey(product.handle), product);
    for (const variant of product.variants) {
      const key = skuKey(variant.sku);
      if (!key) continue;
      const list = bySku.get(key) ?? [];
      list.push({ product, variant });
      bySku.set(key, list);
    }
  }
  return { byHandle, bySku };
}

function locationByName(
  name: string,
  locations: InventoryImportLocationRef[],
): InventoryImportLocationRef | undefined {
  return locations.find((item) => item.name === name);
}

function variantsByOptions(
  product: InventoryImportProductSnapshot,
  record: InventoryCsvRecord,
): InventoryImportVariantSnapshot[] {
  const key = optionKey(record.option1Value, record.option2Value, record.option3Value);
  if (!record.option1Value && !record.option2Value && !record.option3Value) return [];
  return product.variants.filter(
    (variant) => optionKey(variant.option1, variant.option2, variant.option3) === key,
  );
}

function resolveVariant(
  product: InventoryImportProductSnapshot,
  record: InventoryCsvRecord,
): { variant: InventoryImportVariantSnapshot | null; issue?: InventoryImportIssue } {
  const byOptions = variantsByOptions(product, record);
  if (byOptions.length === 1) return { variant: byOptions[0] ?? null };
  const key = skuKey(record.sku);
  const bySku = key ? product.variants.filter((variant) => skuKey(variant.sku) === key) : [];
  if (bySku.length === 1) return { variant: bySku[0] ?? null };
  if (byOptions.length > 1 || bySku.length > 1) {
    return {
      variant: null,
      issue: {
        rowNumber: record.rowNumber,
        code: "sku_matches_multiple",
        column: "SKU",
        value: record.sku,
        productTitle: product.productTitle,
      },
    };
  }
  if (product.variants.length === 1) return { variant: product.variants[0] ?? null };
  if (record.sku) {
    return {
      variant: null,
      issue: {
        rowNumber: record.rowNumber,
        code: "sku_not_found",
        column: "SKU",
        value: record.sku,
        productTitle: product.productTitle,
      },
    };
  }
  return { variant: null };
}

export function planInventoryImport(args: {
  records: InventoryCsvRecord[];
  products: InventoryImportProductSnapshot[];
  locations: InventoryImportLocationRef[];
  hasLocationColumn: boolean;
  hasOnHandNewColumn: boolean;
}): { rows: InventoryImportRow[]; issues: InventoryImportIssue[] } {
  const issues: InventoryImportIssue[] = [];
  const rows: InventoryImportRow[] = [];
  if (!args.hasLocationColumn || !args.hasOnHandNewColumn) {
    issues.push({ rowNumber: 0, code: "wrong_sheet" });
    return { rows, issues };
  }
  const catalog = indexInventoryImportCatalog(args.products);
  for (const record of args.records) {
    if (!record.onHandNew) {
      rows.push(emptySkip(record, "empty_new"));
      continue;
    }
    const after = parseNonNegativeInt(record.onHandNew);
    if (after == null) {
      issues.push({
        rowNumber: record.rowNumber,
        code: "invalid_on_hand",
        column: "On hand (new)",
        value: record.onHandNew,
      });
      continue;
    }
    if (!record.location) {
      issues.push({ rowNumber: record.rowNumber, code: "missing_location", column: "Location" });
      continue;
    }
    if (!record.handle && !record.sku) {
      issues.push({ rowNumber: record.rowNumber, code: "missing_identity" });
      continue;
    }
    const location = locationByName(record.location, args.locations);
    if (!location) {
      issues.push({
        rowNumber: record.rowNumber,
        code: "location_not_found",
        column: "Location",
        value: record.location,
      });
      continue;
    }
    let product: InventoryImportProductSnapshot | undefined;
    if (record.handle) product = catalog.byHandle.get(handleKey(record.handle));
    let variant: InventoryImportVariantSnapshot | null = null;
    if (product) {
      const resolved = resolveVariant(product, record);
      variant = resolved.variant;
      if (resolved.issue) {
        issues.push(resolved.issue);
        continue;
      }
    } else if (record.sku) {
      const hits = catalog.bySku.get(skuKey(record.sku)) ?? [];
      if (hits.length === 1) {
        product = hits[0]?.product;
        variant = hits[0]?.variant ?? null;
      } else if (hits.length === 0) {
        issues.push({
          rowNumber: record.rowNumber,
          code: record.handle ? "handle_not_found" : "sku_not_found",
          column: record.handle ? "Handle" : "SKU",
          value: record.handle || record.sku,
        });
        continue;
      } else {
        issues.push({
          rowNumber: record.rowNumber,
          code: "sku_matches_multiple",
          column: "SKU",
          value: record.sku,
        });
        continue;
      }
    } else {
      issues.push({
        rowNumber: record.rowNumber,
        code: "handle_not_found",
        column: "Handle",
        value: record.handle,
      });
      continue;
    }
    if (!product || !variant) {
      issues.push({
        rowNumber: record.rowNumber,
        code: "sku_not_found",
        column: "SKU",
        value: record.sku,
        productTitle: product?.productTitle,
      });
      continue;
    }
    const planned = planLevel({ record, product, variant, location, after });
    if (planned.issue) issues.push(planned.issue);
    if (planned.row) rows.push(planned.row);
  }
  return { rows, issues };
}

function emptySkip(record: InventoryCsvRecord, reason: "empty_new"): InventoryImportRow {
  return {
    rowNumber: record.rowNumber,
    variantId: "",
    productId: "",
    productTitle: record.title,
    variantTitle: "",
    sku: record.sku || null,
    inventoryItemId: "",
    locationId: "",
    locationName: record.location,
    beforeOnHand: 0,
    afterOnHand: 0,
    committed: 0,
    availableEstimate: 0,
    skipped: true,
    skipReason: reason,
  };
}

function planLevel(args: {
  record: InventoryCsvRecord;
  product: InventoryImportProductSnapshot;
  variant: InventoryImportVariantSnapshot;
  location: InventoryImportLocationRef;
  after: number;
}): { row?: InventoryImportRow; issue?: InventoryImportIssue } {
  const { record, product, variant, location, after } = args;
  if (!variant.tracked) {
    return {
      issue: {
        rowNumber: record.rowNumber,
        code: "untracked",
        productTitle: product.productTitle,
      },
    };
  }
  if (!location.writable) {
    return {
      issue: {
        rowNumber: record.rowNumber,
        code: "location_not_writable",
        column: "Location",
        value: location.name,
        productTitle: product.productTitle,
      },
    };
  }
  const level = variant.levels.find((item) => item.locationId === location.id);
  if (!level?.stocked) {
    return {
      issue: {
        rowNumber: record.rowNumber,
        code: "not_stocked",
        column: "Location",
        value: location.name,
        productTitle: product.productTitle,
      },
    };
  }
  if (record.onHandCurrent) {
    const fileCurrent = parseNonNegativeInt(record.onHandCurrent);
    if (fileCurrent != null && fileCurrent !== level.onHand) {
      return {
        issue: {
          rowNumber: record.rowNumber,
          code: "stale_on_hand",
          column: "On hand (current)",
          value: `${fileCurrent} ≠ ${level.onHand}`,
          productTitle: product.productTitle,
        },
      };
    }
  }
  if (after < level.committed) {
    return {
      issue: {
        rowNumber: record.rowNumber,
        code: "on_hand_below_committed",
        column: "On hand (new)",
        value: String(after),
        productTitle: product.productTitle,
      },
    };
  }
  if (after === level.onHand) {
    return {
      row: toRow({ record, product, variant, location, level, after, skipped: true, skipReason: "no_change" }),
    };
  }
  return {
    row: toRow({ record, product, variant, location, level, after, skipped: false }),
  };
}

function toRow(args: {
  record: InventoryCsvRecord;
  product: InventoryImportProductSnapshot;
  variant: InventoryImportVariantSnapshot;
  location: InventoryImportLocationRef;
  level: InventoryImportLevelSnapshot;
  after: number;
  skipped: boolean;
  skipReason?: InventoryImportRow["skipReason"];
}): InventoryImportRow {
  const availableEstimate = Math.max(0, args.after - args.level.committed);
  return {
    rowNumber: args.record.rowNumber,
    variantId: args.variant.variantId,
    productId: args.product.productId,
    productTitle: args.product.productTitle,
    variantTitle: args.variant.title,
    sku: args.variant.sku,
    inventoryItemId: args.variant.inventoryItemId,
    locationId: args.location.id,
    locationName: args.location.name,
    beforeOnHand: args.level.onHand,
    afterOnHand: args.after,
    committed: args.level.committed,
    availableEstimate,
    skipped: args.skipped,
    ...(args.skipReason ? { skipReason: args.skipReason } : {}),
  };
}

export function buildInventoryImportSummary(
  rows: InventoryImportRow[],
  issues: InventoryImportIssue[],
): InventoryImportSummary {
  return {
    rows: rows.length + issues.length,
    changed: rows.filter((row) => !row.skipped).length,
    skipped: rows.filter((row) => row.skipped).length,
    issues: issues.length,
  };
}

export function coerceInventoryImportRows(raw: unknown): InventoryImportRow[] {
  if (!Array.isArray(raw)) return [];
  const out: InventoryImportRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Partial<InventoryImportRow>;
    if (!row.variantId || !row.inventoryItemId || !row.locationId) continue;
    out.push({
      rowNumber: Number(row.rowNumber) || 0,
      variantId: String(row.variantId),
      productId: String(row.productId ?? ""),
      productTitle: String(row.productTitle ?? ""),
      variantTitle: String(row.variantTitle ?? ""),
      sku: typeof row.sku === "string" ? row.sku : null,
      inventoryItemId: String(row.inventoryItemId),
      locationId: String(row.locationId),
      locationName: String(row.locationName ?? ""),
      beforeOnHand: Number(row.beforeOnHand) || 0,
      afterOnHand: Number(row.afterOnHand) || 0,
      committed: Number(row.committed) || 0,
      availableEstimate: Number(row.availableEstimate) || 0,
      skipped: row.skipped === true,
      ...(row.skipReason ? { skipReason: row.skipReason } : {}),
    });
  }
  return out;
}

export function coerceInventoryImportIssues(raw: unknown): InventoryImportIssue[] {
  if (!Array.isArray(raw)) return [];
  const out: InventoryImportIssue[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const issue = item as Partial<InventoryImportIssue>;
    if (!issue.code) continue;
    out.push({
      rowNumber: Number(issue.rowNumber) || 0,
      code: issue.code as InventoryImportIssueCode,
      ...(issue.column ? { column: String(issue.column) } : {}),
      ...(issue.value ? { value: String(issue.value) } : {}),
      ...(issue.productTitle ? { productTitle: String(issue.productTitle) } : {}),
    });
  }
  return out;
}

export function buildInventoryImportChangesetCsv(rows: InventoryImportRow[]): string {
  return toCsv(
    ["Row", "Product", "Variant", "SKU", "Location", "On hand (current)", "On hand (new)", "Action"],
    rows.map((row) => [
      String(row.rowNumber),
      row.productTitle,
      row.variantTitle,
      row.sku ?? "",
      row.locationName,
      String(row.beforeOnHand),
      String(row.afterOnHand),
      row.skipped ? String(row.skipReason ?? "skip") : "change",
    ]),
  );
}

export function buildInventoryImportRollbackCsv(rows: InventoryImportRow[]): string {
  return toCsv(
    ["Handle", "SKU", "Location", "On hand (new)"],
    rows
      .filter((row) => !row.skipped)
      .map((row) => ["", row.sku ?? "", row.locationName, String(row.beforeOnHand)]),
  );
}
