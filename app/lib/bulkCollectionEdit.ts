/**
 * 批量加入 / 移出合集。纯函数：规则 → changeset，不含 Shopify IO。
 * 没有可写 CollectionConditionsSource 的合集在 dry-run 读侧直接失败。
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

export type CollectionSourceSnapshot = {
  id: string;
  typename?: string | null;
  targetType?: string | null;
  shareable?: boolean | null;
};

export type CollectionSourceRejectReason =
  | "missing_id"
  | "shareable"
  | "not_conditions_source";

export type CollectionSourceDiagnosis = {
  id: string;
  typename: string | null;
  targetType: string | null;
  shareable: boolean | null;
  rejectReason: CollectionSourceRejectReason | null;
};

export type CollectionWritabilityReason =
  | "writable"
  | "no_sources"
  | "sub_collections_only"
  | "shareable_only"
  | "variants_only"
  | "no_writable_conditions_source";

export type CollectionWritabilityDiagnosis = {
  writable: boolean;
  sourceId: string | null;
  reason: CollectionWritabilityReason;
  sources: CollectionSourceDiagnosis[];
};

function rejectReasonForSource(
  source: CollectionSourceSnapshot,
): CollectionSourceRejectReason | null {
  if (!source.id.trim()) return "missing_id";
  if (source.shareable === true) return "shareable";
  if (source.typename && source.typename !== "CollectionConditionsSource") {
    return "not_conditions_source";
  }
  return null;
}

function inferCollectionWritabilityReason(
  sources: CollectionSourceSnapshot[],
): CollectionWritabilityReason {
  if (sources.length === 0) return "no_sources";
  if (sources.every((source) => source.typename === "CollectionSubCollectionsSource")) {
    return "sub_collections_only";
  }
  const conditionsSources = sources.filter(
    (source) => source.typename === "CollectionConditionsSource" && source.shareable !== true,
  );
  if (conditionsSources.length === 0) {
    return sources.every((source) => source.shareable === true)
      ? "shareable_only"
      : "no_writable_conditions_source";
  }
  if (
    conditionsSources.every((source) => source.targetType === "VARIANTS") &&
    !conditionsSources.some((source) => !source.targetType || source.targetType === "PRODUCTS")
  ) {
    return "variants_only";
  }
  return "no_writable_conditions_source";
}

/**
 * 诊断合集为何可写 / 不可写，供导入试算与服务端日志使用。
 */
export function diagnoseCollectionWritability(
  sources: CollectionSourceSnapshot[],
): CollectionWritabilityDiagnosis {
  const mapped = sources.map((source) => ({
    id: source.id,
    typename: source.typename ?? null,
    targetType: source.targetType ?? null,
    shareable: source.shareable ?? null,
    rejectReason: rejectReasonForSource(source),
  }));
  const sourceId = pickWritableCollectionSource(sources);
  if (sourceId) {
    return {
      writable: true,
      sourceId,
      reason: "writable",
      sources: mapped,
    };
  }
  return {
    writable: false,
    sourceId: null,
    reason: inferCollectionWritabilityReason(sources),
    sources: mapped,
  };
}

const COLLECTION_WRITABILITY_REASON_LABELS: Record<CollectionWritabilityReason, string> = {
  writable: "可写",
  no_sources: "尚无 sources，请先在 Shopify 后台点「Add products」或保存「Add condition」",
  sub_collections_only: "仅含子合集来源，成员由其它合集组成",
  shareable_only: "仅含应用共享规则来源",
  variants_only: "仅有 VARIANTS 级条件来源，无法按商品加减",
  no_writable_conditions_source: "没有可写的 CollectionConditionsSource",
};

/** 单行诊断日志，便于 Render / 本地 console 检索。 */
export function formatCollectionWritabilityDiagnosisLog(args: {
  collectionId: string;
  collectionTitle: string;
  diagnosis: CollectionWritabilityDiagnosis;
}): string {
  const reasonLabel = COLLECTION_WRITABILITY_REASON_LABELS[args.diagnosis.reason];
  const sourcesJson = JSON.stringify(
    args.diagnosis.sources.map((source) => ({
      id: source.id,
      typename: source.typename,
      targetType: source.targetType,
      shareable: source.shareable,
      rejectReason: source.rejectReason,
    })),
  );
  return [
    "collection_writability",
    `title=${JSON.stringify(args.collectionTitle)}`,
    `id=${args.collectionId}`,
    `writable=${args.diagnosis.writable}`,
    `reason=${args.diagnosis.reason}`,
    `reasonLabel=${JSON.stringify(reasonLabel)}`,
    `selectedSourceId=${args.diagnosis.sourceId ?? "null"}`,
    `sources=${sourcesJson}`,
  ].join(" ");
}

/**
 * 选一个本应用能改成员的条件来源：跳过子合集来源和别人的 shareable source，
 * 优先 PRODUCTS，这样加减商品不必带 variantId。
 */
export function pickWritableCollectionSource(
  sources: CollectionSourceSnapshot[],
): string | null {
  const writable = sources.filter((source) => {
    if (!source.id.trim()) return false;
    if (source.shareable === true) return false;
    if (source.typename && source.typename !== "CollectionConditionsSource") return false;
    return true;
  });
  const productScoped = writable.find(
    (source) => !source.targetType || source.targetType === "PRODUCTS",
  );
  return productScoped?.id ?? writable[0]?.id ?? null;
}

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
