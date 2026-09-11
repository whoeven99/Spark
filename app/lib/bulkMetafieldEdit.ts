/**
 * 批量改商品 / 变体 Metafield。只处理已有 definition 的标量类型。
 */
import { toCsv } from "./csv";

export const BULK_METAFIELD_EDIT_MAX_PRODUCTS = 200;
export const BULK_METAFIELD_SET_BATCH_SIZE = 25;

export const BULK_METAFIELD_SUPPORTED_TYPES = [
  "single_line_text_field",
  "multi_line_text_field",
  "number_integer",
  "number_decimal",
  "boolean",
  "date",
  "url",
  "json",
] as const;

export type BulkMetafieldSupportedType = (typeof BULK_METAFIELD_SUPPORTED_TYPES)[number];
export type BulkMetafieldOwner = "product" | "variant";
export type BulkMetafieldAction = "set" | "delete";
export type BulkMetafieldSkipReason = "no_change" | "invalid_value" | "unsupported_type" | "missing_definition";

export type ProductImportMetafieldColumn = {
  header: string;
  owner: BulkMetafieldOwner;
  namespace: string;
  key: string;
  type?: string;
  cellKey: string;
};

export type BulkMetafieldDefinition = {
  owner: BulkMetafieldOwner;
  namespace: string;
  key: string;
  type: string;
};

export type BulkMetafieldValue = {
  namespace: string;
  key: string;
  type: string;
  value: string;
};

export type BulkMetafieldEditRow = {
  ownerId: string;
  owner: BulkMetafieldOwner;
  productId: string;
  productTitle: string;
  namespace: string;
  key: string;
  type: string;
  beforeValue: string;
  afterValue: string;
  action: BulkMetafieldAction;
  skipped: boolean;
  skipReason?: BulkMetafieldSkipReason;
};

export type BulkMetafieldEditApplyOutcome = {
  at: string;
  succeeded: number;
  failed: number;
  errors: Array<{ ownerId: string; message: string }>;
};

const METAFIELD_HEADER =
  /^(variant\s+)?metafield:\s*([^\s.]+)\.([^\s\[]+?)(?:\s*\[([^\]]+)\])?$/i;

export function metafieldCellKey(owner: BulkMetafieldOwner, namespace: string, key: string): string {
  return `mf:${owner}:${namespace}.${key}`;
}

export function parseImportMetafieldHeader(header: string): ProductImportMetafieldColumn | null {
  const normalized = header.trim().toLowerCase().replace(/\s+/g, " ");
  const matched = normalized.match(METAFIELD_HEADER);
  if (!matched) return null;
  const owner: BulkMetafieldOwner = matched[1] ? "variant" : "product";
  const namespace = matched[2]?.trim() ?? "";
  const key = matched[3]?.trim() ?? "";
  const type = matched[4]?.trim();
  if (!namespace || !key) return null;
  return {
    header: header.trim(),
    owner,
    namespace,
    key,
    ...(type ? { type } : {}),
    cellKey: metafieldCellKey(owner, namespace, key),
  };
}

export function isSupportedMetafieldType(type: string): type is BulkMetafieldSupportedType {
  return (BULK_METAFIELD_SUPPORTED_TYPES as readonly string[]).includes(type);
}

export function normalizeMetafieldValue(
  type: string,
  raw: string,
): { ok: true; value: string } | { ok: false } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: "" };
  if (type === "boolean") {
    const lower = trimmed.toLowerCase();
    if (["true", "1", "yes", "y", "是"].includes(lower)) return { ok: true, value: "true" };
    if (["false", "0", "no", "n", "否"].includes(lower)) return { ok: true, value: "false" };
    return { ok: false };
  }
  if (type === "number_integer") {
    if (!/^-?\d+$/.test(trimmed)) return { ok: false };
    return { ok: true, value: trimmed };
  }
  if (type === "number_decimal") {
    const amount = Number(trimmed.replace(/,/g, ""));
    if (!Number.isFinite(amount)) return { ok: false };
    return { ok: true, value: String(amount) };
  }
  if (type === "date") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return { ok: false };
    return { ok: true, value: trimmed };
  }
  if (type === "url") {
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return { ok: false };
      return { ok: true, value: parsed.toString() };
    } catch {
      return { ok: false };
    }
  }
  if (type === "json") {
    try {
      JSON.parse(trimmed);
      return { ok: true, value: trimmed };
    } catch {
      return { ok: false };
    }
  }
  if (type === "single_line_text_field" || type === "multi_line_text_field") {
    return { ok: true, value: type === "single_line_text_field" ? trimmed : raw };
  }
  return { ok: false };
}

export function computeMetafieldChange(args: {
  ownerId: string;
  owner: BulkMetafieldOwner;
  productId: string;
  productTitle: string;
  namespace: string;
  key: string;
  type: string;
  beforeValue: string;
  rawValue: string;
  hasDefinition: boolean;
}): BulkMetafieldEditRow {
  const base: BulkMetafieldEditRow = {
    ownerId: args.ownerId,
    owner: args.owner,
    productId: args.productId,
    productTitle: args.productTitle,
    namespace: args.namespace,
    key: args.key,
    type: args.type,
    beforeValue: args.beforeValue,
    afterValue: args.rawValue,
    action: "set",
    skipped: false,
  };
  if (!args.hasDefinition) {
    return { ...base, skipped: true, skipReason: "missing_definition" };
  }
  if (!isSupportedMetafieldType(args.type)) {
    return { ...base, skipped: true, skipReason: "unsupported_type" };
  }
  if (!args.rawValue.trim()) {
    if (!args.beforeValue) {
      return { ...base, action: "delete", skipped: true, skipReason: "no_change" };
    }
    return { ...base, afterValue: "", action: "delete" };
  }
  const normalized = normalizeMetafieldValue(args.type, args.rawValue);
  if (!normalized.ok) {
    return { ...base, skipped: true, skipReason: "invalid_value" };
  }
  if (normalized.value === args.beforeValue) {
    return { ...base, afterValue: normalized.value, skipped: true, skipReason: "no_change" };
  }
  return { ...base, afterValue: normalized.value, action: "set" };
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isOwner(value: string): value is BulkMetafieldOwner {
  return value === "product" || value === "variant";
}

function isAction(value: string): value is BulkMetafieldAction {
  return value === "set" || value === "delete";
}

function isSkipReason(value: string): value is BulkMetafieldSkipReason {
  return (
    value === "no_change" ||
    value === "invalid_value" ||
    value === "unsupported_type" ||
    value === "missing_definition"
  );
}

export function coerceBulkMetafieldEditRows(raw: unknown): BulkMetafieldEditRow[] {
  if (!Array.isArray(raw)) return [];
  const out: BulkMetafieldEditRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const ownerId = asString(record.ownerId).trim();
    const productId = asString(record.productId).trim();
    const owner = asString(record.owner);
    const action = asString(record.action) || "set";
    if (!ownerId || !productId || !isOwner(owner) || !isAction(action)) continue;
    const skipped = record.skipped === true;
    const skipReason = asString(record.skipReason).trim();
    out.push({
      ownerId,
      owner,
      productId,
      productTitle: asString(record.productTitle),
      namespace: asString(record.namespace),
      key: asString(record.key),
      type: asString(record.type),
      beforeValue: asString(record.beforeValue),
      afterValue: asString(record.afterValue),
      action,
      skipped,
      ...(isSkipReason(skipReason) ? { skipReason } : {}),
    });
  }
  return out;
}

export function buildBulkMetafieldEditChangesetCsv(rows: BulkMetafieldEditRow[]): string {
  return toCsv(
    ["product_title", "owner", "namespace", "key", "before", "after", "action", "reason"] as const,
    rows.map((row) => [
      row.productTitle,
      row.owner,
      row.namespace,
      row.key,
      row.beforeValue,
      row.skipped ? "" : row.afterValue,
      row.skipped ? "skip" : row.action,
      row.skipped ? (row.skipReason ?? "") : "",
    ]),
  );
}
