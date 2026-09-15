/**
 * 导入写回失败：把 Shopify 返回的错误收成审核表行。纯算。
 */
import { toCsv } from "./csv";
import { PRODUCT_IMPORT_OPERATIONS, type ProductImportOperation } from "./productImport";

export const PRODUCT_IMPORT_APPLY_ERROR_LIMIT = 500;

export const PRODUCT_IMPORT_APPLY_FAIL_CODES = [
  "compare_at_below_price",
  "price_zero",
  "invalid_price",
  "product_not_found",
  "variant_not_found",
  "throttled",
  "permission_denied",
  "not_editable",
  "shopify_user_error",
] as const;

export type ProductImportApplyFailCode = (typeof PRODUCT_IMPORT_APPLY_FAIL_CODES)[number];

export type ProductImportApplyError = {
  operation: ProductImportOperation;
  code: ProductImportApplyFailCode;
  message: string;
  productTitle: string;
  field: string;
  beforeValue?: string;
  afterValue?: string;
  productId?: string;
  variantId?: string;
};

export type RawImportApplyError = {
  message: string;
  productId?: string;
  variantId?: string;
  ownerId?: string;
};

export type ImportApplyErrorLookup = {
  productTitle: string;
  field: string;
  beforeValue: string;
  afterValue: string;
  productId?: string;
  variantId?: string;
};

const FAIL_CODE_SET = new Set<string>(PRODUCT_IMPORT_APPLY_FAIL_CODES);

export function classifyImportApplyMessage(message: string): ProductImportApplyFailCode {
  const text = message.trim().toLowerCase();
  if (!text) return "shopify_user_error";
  if (/compare[\s-]?at/.test(text) && /(higher|greater|above|must be|低于|高于)/.test(text)) {
    return "compare_at_below_price";
  }
  if (
    /must be greater than 0|can't be (0|zero)|cannot be zero|can't be blank|price must be positive|价格.*大于 0/.test(
      text,
    )
  ) {
    return "price_zero";
  }
  if (/invalid price|not a valid price|价格无法/.test(text)) return "invalid_price";
  if (/throttl|rate limit|http 429|限流/.test(text)) return "throttled";
  if (/access denied|permission|not allowed|unauthorized|权限/.test(text)) return "permission_denied";
  if (/cannot be updated|managed by|locked|protected|not editable/.test(text)) return "not_editable";
  if (/product.*(not found|does not exist)|商品.*不存在/.test(text)) return "product_not_found";
  if (/variant.*(not found|does not exist|not returned)|变体.*不存在/.test(text)) {
    return "variant_not_found";
  }
  return "shopify_user_error";
}

function asOperation(value: string | undefined, fallback: ProductImportOperation): ProductImportOperation {
  if (value && (PRODUCT_IMPORT_OPERATIONS as readonly string[]).includes(value)) {
    return value as ProductImportOperation;
  }
  return fallback;
}

function lookupFor(error: RawImportApplyError, maps: ImportApplyLookupMaps): ImportApplyErrorLookup | null {
  if (error.variantId && maps.byVariantId.has(error.variantId)) {
    return maps.byVariantId.get(error.variantId) ?? null;
  }
  if (error.ownerId && maps.byOwnerId.has(error.ownerId)) {
    return maps.byOwnerId.get(error.ownerId) ?? null;
  }
  if (error.productId && maps.byProductId.has(error.productId)) {
    return maps.byProductId.get(error.productId) ?? null;
  }
  return null;
}

export type ImportApplyLookupMaps = {
  byVariantId: Map<string, ImportApplyErrorLookup>;
  byProductId: Map<string, ImportApplyErrorLookup>;
  byOwnerId: Map<string, ImportApplyErrorLookup>;
};

export function emptyImportApplyLookups(): ImportApplyLookupMaps {
  return { byVariantId: new Map(), byProductId: new Map(), byOwnerId: new Map() };
}

export function enrichImportApplyErrors(
  operation: ProductImportOperation,
  errors: RawImportApplyError[],
  lookups: ImportApplyLookupMaps,
): ProductImportApplyError[] {
  const out: ProductImportApplyError[] = [];
  for (const error of errors) {
    const message = error.message.trim();
    if (!message) continue;
    const hit = lookupFor(error, lookups);
    out.push({
      operation: asOperation(hit?.field, operation),
      code: classifyImportApplyMessage(message),
      message,
      productTitle: hit?.productTitle ?? "",
      field: hit?.field ?? "",
      ...(hit?.beforeValue ? { beforeValue: hit.beforeValue } : {}),
      ...(hit?.afterValue ? { afterValue: hit.afterValue } : {}),
      ...(error.productId || hit?.productId
        ? { productId: error.productId || hit?.productId }
        : {}),
      ...(error.variantId || hit?.variantId
        ? { variantId: error.variantId || hit?.variantId }
        : {}),
    });
  }
  return out;
}

export function coerceProductImportApplyErrors(raw: unknown): ProductImportApplyError[] {
  if (!Array.isArray(raw)) return [];
  const out: ProductImportApplyError[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const message = typeof record.message === "string" ? record.message.trim() : "";
    if (!message) continue;
    const operation =
      typeof record.operation === "string" && record.operation
        ? (record.operation as ProductImportOperation)
        : "price";
    const code =
      typeof record.code === "string" && FAIL_CODE_SET.has(record.code)
        ? (record.code as ProductImportApplyFailCode)
        : classifyImportApplyMessage(message);
    out.push({
      operation,
      code,
      message,
      productTitle: typeof record.productTitle === "string" ? record.productTitle : "",
      field: typeof record.field === "string" ? record.field : "",
      ...(typeof record.beforeValue === "string" ? { beforeValue: record.beforeValue } : {}),
      ...(typeof record.afterValue === "string" ? { afterValue: record.afterValue } : {}),
      ...(typeof record.productId === "string" && record.productId
        ? { productId: record.productId }
        : {}),
      ...(typeof record.variantId === "string" && record.variantId
        ? { variantId: record.variantId }
        : {}),
    });
  }
  return out;
}

export function buildProductImportApplyErrorCsv(
  errors: ProductImportApplyError[],
  label: (code: ProductImportApplyFailCode, message: string) => string,
  fix: (code: ProductImportApplyFailCode) => string,
): string {
  return toCsv(
    ["product", "operation", "field", "before", "after", "code", "problem", "how_to_fix"] as const,
    errors.map((error) => [
      error.productTitle,
      error.operation,
      error.field,
      error.beforeValue ?? "",
      error.afterValue ?? "",
      error.code,
      label(error.code, error.message),
      fix(error.code),
    ]),
  );
}
