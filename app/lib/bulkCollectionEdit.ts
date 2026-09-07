/**
 * 批量加入 / 移出手动合集。纯函数：规则 → changeset，不含 Shopify IO。
 * 智能合集在 dry-run 读侧直接失败，不会走到这里的逐行计算。
 */
import { toCsv } from "./csv";

export const BULK_COLLECTION_EDIT_MAX_PRODUCTS = 200;

export type BulkCollectionEditAction = "add" | "remove";

export type BulkCollectionEditRule = {
  action: BulkCollectionEditAction;
  collectionId: string;
  collectionTitle: string;
};

export type BulkCollectionEditSkipReason = "already_in" | "not_in";

export type BulkCollectionEditProductInput = {
  productId: string;
  productTitle: string;
  status: string;
  inCollection: boolean;
};

export type BulkCollectionEditRow = {
  productId: string;
  productTitle: string;
  status: string;
  inCollection: boolean;
  action: BulkCollectionEditAction;
  skipped: boolean;
  skipReason?: BulkCollectionEditSkipReason;
};

export type BulkCollectionEditSummary = {
  products: number;
  changed: number;
  skipped: number;
  added: number;
  removed: number;
};

export type BulkCollectionEditApplyOutcome = {
  at: string;
  succeeded: number;
  failed: number;
  pendingJob?: boolean;
  errors: Array<{ productId: string; message: string }>;
};

export class BulkCollectionEditRuleError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "BulkCollectionEditRuleError";
    this.code = code;
  }
}

export function parseBulkCollectionEditRule(
  params: Record<string, string>,
): Omit<BulkCollectionEditRule, "collectionTitle"> {
  const actionRaw = (params.collectionAction ?? params.action ?? "").trim().toLowerCase();
  if (actionRaw !== "add" && actionRaw !== "remove") {
    throw new BulkCollectionEditRuleError(
      "invalid_action",
      "请先选择要把商品「加入合集」还是「移出合集」",
    );
  }
  const collectionId = (params.collectionId ?? "").trim();
  if (!collectionId) {
    throw new BulkCollectionEditRuleError("missing_collection", "请先选择目标合集");
  }
  return { action: actionRaw, collectionId };
}

export function computeCollectionMembershipChange(
  product: BulkCollectionEditProductInput,
  action: BulkCollectionEditAction,
): BulkCollectionEditRow {
  const base: BulkCollectionEditRow = {
    productId: product.productId,
    productTitle: product.productTitle,
    status: product.status,
    inCollection: product.inCollection,
    action,
    skipped: false,
  };
  if (action === "add" && product.inCollection) {
    return { ...base, skipped: true, skipReason: "already_in" };
  }
  if (action === "remove" && !product.inCollection) {
    return { ...base, skipped: true, skipReason: "not_in" };
  }
  return base;
}

export function buildBulkCollectionEditSummary(
  rows: BulkCollectionEditRow[],
): BulkCollectionEditSummary {
  let changed = 0;
  let skipped = 0;
  let added = 0;
  let removed = 0;
  for (const row of rows) {
    if (row.skipped) {
      skipped += 1;
      continue;
    }
    changed += 1;
    if (row.action === "add") added += 1;
    else removed += 1;
  }
  return { products: rows.length, changed, skipped, added, removed };
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function coerceBulkCollectionEditRows(raw: unknown): BulkCollectionEditRow[] {
  if (!Array.isArray(raw)) return [];
  const out: BulkCollectionEditRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const productId = asString(record.productId).trim();
    const action = asString(record.action).trim();
    if (!productId || (action !== "add" && action !== "remove")) continue;
    const skipped = record.skipped === true;
    const skipReason = asString(record.skipReason).trim();
    out.push({
      productId,
      productTitle: asString(record.productTitle),
      status: asString(record.status),
      inCollection: record.inCollection === true,
      action,
      skipped,
      ...(skipReason === "already_in" || skipReason === "not_in" ? { skipReason } : {}),
    });
  }
  return out;
}

export function buildBulkCollectionEditChangesetCsv(rows: BulkCollectionEditRow[]): string {
  return toCsv(
    ["product_title", "product_id", "status", "in_collection", "action", "reason"] as const,
    rows.map((row) => [
      row.productTitle,
      row.productId,
      row.status,
      row.inCollection ? "yes" : "no",
      row.skipped ? "skip" : row.action,
      row.skipped ? (row.skipReason ?? "") : "",
    ]),
  );
}

export function buildBulkCollectionEditRollbackCsv(rows: BulkCollectionEditRow[]): string {
  return toCsv(
    ["product_id", "product_title", "rollback_action"] as const,
    rows
      .filter((row) => !row.skipped)
      .map((row) => [row.productId, row.productTitle, row.action === "add" ? "remove" : "add"]),
  );
}
