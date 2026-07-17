const TIKTOK_API_BASE = "https://business-api.tiktok.com/open_api/v1.3";

export type TiktokUploadLogStatus =
  | "processing"
  | "success"
  | "failed"
  | "partial"
  | "unknown";

export interface TiktokProductUploadLog {
  status: TiktokUploadLogStatus;
  successCount: number | null;
  failedCount: number | null;
  errors: Array<{ id: string; reason: string }>;
  rawStatus?: string;
}

export interface ConfirmTiktokCatalogUploadResult {
  succeeded: number;
  errors: Array<{ id: string; reason: string }>;
  feedLogId?: string;
  verifiedVia: "product_log" | "product_get" | "unverified";
}

type ConfirmDeps = {
  maxAttempts?: number;
  intervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
  fetchImpl?: typeof fetch;
};

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function normalizeUploadLogStatus(raw: string): TiktokUploadLogStatus {
  const status = raw.trim().toUpperCase();
  if (!status) return "unknown";
  if (
    status.includes("PROCESS") ||
    status.includes("PENDING") ||
    status.includes("RUNNING") ||
    status === "IN_PROGRESS"
  ) {
    return "processing";
  }
  if (status.includes("PARTIAL")) return "partial";
  if (
    status.includes("FAIL") ||
    status.includes("ERROR") ||
    status === "REJECTED" ||
    status === "CANCELLED"
  ) {
    return "failed";
  }
  if (
    status.includes("SUCCESS") ||
    status.includes("SUCCEED") ||
    status === "COMPLETED" ||
    status === "OK" ||
    status === "DONE"
  ) {
    return "success";
  }
  return "unknown";
}

function extractLogErrors(data: Record<string, unknown>): Array<{ id: string; reason: string }> {
  const candidates = [
    data.error_list,
    data.failed_products,
    data.failed_list,
    data.errors,
    data.products,
  ];
  const out: Array<{ id: string; reason: string }> = [];
  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue;
    for (const row of candidate) {
      const item = asRecord(row);
      if (!item) continue;
      const id = String(
        item.sku_id ?? item.product_id ?? item.item_id ?? item.id ?? "",
      ).trim();
      const reason = String(
        item.error_message ?? item.reason ?? item.message ?? item.error ?? "",
      ).trim();
      const rowStatus = String(item.status ?? item.result ?? "").toUpperCase();
      const looksFailed =
        Boolean(reason) ||
        rowStatus.includes("FAIL") ||
        rowStatus.includes("ERROR") ||
        rowStatus === "REJECTED";
      if (!id || !looksFailed) continue;
      out.push({
        id,
        reason: reason || "rejected by TikTok Catalog product log",
      });
    }
  }
  return out;
}

/** 解析 /catalog/product/log/ 的 data 节点（兼容多种字段命名）。 */
export function parseTiktokProductUploadLog(data: unknown): TiktokProductUploadLog {
  const root = asRecord(data) ?? {};
  const nested = asRecord(root.feed_log) ?? asRecord(root.log) ?? root;
  const rawStatus = String(
    nested.status ??
      nested.process_status ??
      nested.processing_status ??
      nested.feed_status ??
      root.status ??
      "",
  );
  const successCount =
    readNumber(nested.success_count) ??
    readNumber(nested.succeed_count) ??
    readNumber(nested.success) ??
    null;
  const failedCount =
    readNumber(nested.failed_count) ??
    readNumber(nested.fail_count) ??
    readNumber(nested.failure_count) ??
    null;
  const errors = extractLogErrors(nested).concat(
    nested === root ? [] : extractLogErrors(root),
  );

  let status = normalizeUploadLogStatus(rawStatus);
  if (status === "unknown") {
    if (failedCount != null && successCount != null) {
      if (failedCount > 0 && successCount > 0) status = "partial";
      else if (failedCount > 0) status = "failed";
      else status = "success";
    } else if (errors.length > 0 && (successCount == null || successCount === 0)) {
      status = "failed";
    }
  }

  return { status, successCount, failedCount, errors, rawStatus: rawStatus || undefined };
}

/**
 * GET /open_api/v1.3/catalog/product/log/
 * 用 upload 返回的 feed_log_id 查询异步入库结果。
 */
export async function fetchTiktokProductUploadLog(params: {
  accessToken: string;
  bcId: string;
  catalogId: string;
  feedLogId: string;
  advertiserId?: string;
  fetchImpl?: typeof fetch;
}): Promise<TiktokProductUploadLog> {
  const fetchImpl = params.fetchImpl ?? fetch;
  const url = new URL(`${TIKTOK_API_BASE}/catalog/product/log/`);
  url.searchParams.set("bc_id", params.bcId);
  url.searchParams.set("catalog_id", params.catalogId);
  url.searchParams.set("feed_log_id", params.feedLogId);
  if (params.advertiserId) {
    url.searchParams.set("advertiser_id", params.advertiserId);
  }

  const response = await fetchImpl(url.toString(), {
    method: "GET",
    headers: { "Access-Token": params.accessToken },
  });
  const text = await response.text();
  let payload: { code?: number; message?: string; data?: unknown } = {};
  try {
    payload = text ? (JSON.parse(text) as typeof payload) : {};
  } catch {
    payload = {};
  }

  if (!response.ok || (payload.code !== undefined && payload.code !== 0)) {
    const detail =
      payload.message ||
      (payload.code !== undefined ? `code=${payload.code}` : "") ||
      text.slice(0, 200) ||
      response.statusText;
    throw new Error(`TikTok product log failed: HTTP ${response.status} ${detail}`.trim());
  }

  return parseTiktokProductUploadLog(payload.data);
}

/**
 * GET /open_api/v1.3/catalog/product/get/
 * 用于在无 feed_log 或 log 未决时，核对 sku 是否已出现在目录中。
 */
export async function listTiktokCatalogSkuIds(params: {
  accessToken: string;
  bcId: string;
  catalogId: string;
  pageSize?: number;
  fetchImpl?: typeof fetch;
}): Promise<string[]> {
  const fetchImpl = params.fetchImpl ?? fetch;
  const url = new URL(`${TIKTOK_API_BASE}/catalog/product/get/`);
  url.searchParams.set("bc_id", params.bcId);
  url.searchParams.set("catalog_id", params.catalogId);
  url.searchParams.set("page_size", String(params.pageSize ?? 100));
  url.searchParams.set("page", "1");

  const response = await fetchImpl(url.toString(), {
    method: "GET",
    headers: { "Access-Token": params.accessToken },
  });
  const text = await response.text();
  let payload: { code?: number; message?: string; data?: unknown } = {};
  try {
    payload = text ? (JSON.parse(text) as typeof payload) : {};
  } catch {
    payload = {};
  }

  if (!response.ok || (payload.code !== undefined && payload.code !== 0)) {
    const detail =
      payload.message ||
      (payload.code !== undefined ? `code=${payload.code}` : "") ||
      text.slice(0, 200) ||
      response.statusText;
    throw new Error(`TikTok product get failed: HTTP ${response.status} ${detail}`.trim());
  }

  const data = asRecord(payload.data) ?? {};
  const list = Array.isArray(data.list)
    ? data.list
    : Array.isArray(data.products)
      ? data.products
      : [];
  const skuIds: string[] = [];
  for (const row of list) {
    const item = asRecord(row);
    if (!item) continue;
    const sku = String(item.sku_id ?? item.product_id ?? item.id ?? "").trim();
    if (sku) skuIds.push(sku);
  }
  return skuIds;
}

function settleFromProductLog(params: {
  expected: string[];
  log: TiktokProductUploadLog;
  feedLogId?: string;
}): ConfirmTiktokCatalogUploadResult | null {
  if (params.log.status === "processing" || params.log.status === "unknown") {
    return null;
  }

  const errorById = new Map<string, string>();
  for (const err of params.log.errors) {
    if (err.id) errorById.set(err.id, err.reason);
  }

  let succeeded =
    params.log.successCount != null
      ? Math.max(0, Math.min(params.expected.length, params.log.successCount))
      : params.expected.filter((id) => !errorById.has(id)).length;

  if (params.log.status === "failed" && params.log.successCount == null) {
    succeeded = 0;
  }

  const errors: Array<{ id: string; reason: string }> = [];
  for (const id of params.expected) {
    if (errorById.has(id)) {
      errors.push({
        id,
        reason: errorById.get(id) || "rejected by TikTok Catalog product log",
      });
    }
  }

  // 按计数补齐未给出明细的失败项，避免误报成功。
  const unresolved = params.expected.filter((id) => !errors.some((e) => e.id === id));
  let needFail = Math.max(0, params.expected.length - succeeded);
  for (const id of unresolved) {
    if (needFail <= 0) break;
    errors.push({ id, reason: "rejected by TikTok Catalog product log" });
    needFail -= 1;
  }

  if (params.log.status === "failed" && succeeded === 0 && errors.length === 0) {
    return {
      succeeded: 0,
      errors: params.expected.map((id) => ({
        id,
        reason: "TikTok product log reported failed",
      })),
      feedLogId: params.feedLogId,
      verifiedVia: "product_log",
    };
  }

  return {
    succeeded,
    errors,
    feedLogId: params.feedLogId,
    verifiedVia: "product_log",
  };
}

/**
 * 上传受理后确认真实入库结果：优先轮询 product/log，失败则回退 product/get。
 * 无法证实时按失败处理，避免 App 误报成功。
 */
export async function confirmTiktokCatalogUpload(params: {
  accessToken: string;
  advertiserId: string;
  bcId: string;
  catalogId: string;
  feedLogId?: string;
  expectedSkuIds: string[];
  deps?: ConfirmDeps;
}): Promise<ConfirmTiktokCatalogUploadResult> {
  const expected = [...new Set(params.expectedSkuIds.map((id) => id.trim()).filter(Boolean))];
  if (expected.length === 0) {
    return { succeeded: 0, errors: [], feedLogId: params.feedLogId, verifiedVia: "unverified" };
  }

  const maxAttempts = params.deps?.maxAttempts ?? 12;
  const intervalMs = params.deps?.intervalMs ?? 5000;
  const sleep = params.deps?.sleep ?? defaultSleep;
  const fetchImpl = params.deps?.fetchImpl ?? fetch;

  let lastLog: TiktokProductUploadLog | null = null;
  let lastLogError: string | null = null;

  if (params.feedLogId) {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (attempt > 0) await sleep(intervalMs);
      try {
        const log = await fetchTiktokProductUploadLog({
          accessToken: params.accessToken,
          bcId: params.bcId,
          catalogId: params.catalogId,
          feedLogId: params.feedLogId,
          advertiserId: params.advertiserId,
          fetchImpl,
        });
        lastLog = log;
        lastLogError = null;
        const settled = settleFromProductLog({
          expected,
          log,
          feedLogId: params.feedLogId,
        });
        if (settled) return settled;
      } catch (e) {
        lastLogError = e instanceof Error ? e.message : String(e);
        // log 查询失败时继续重试，最终回退 product/get
      }
    }
  }

  const getAttempts = params.feedLogId ? 3 : maxAttempts;
  for (let attempt = 0; attempt < getAttempts; attempt += 1) {
    if (attempt > 0) await sleep(intervalMs);
    try {
      const skuIds = await listTiktokCatalogSkuIds({
        accessToken: params.accessToken,
        bcId: params.bcId,
        catalogId: params.catalogId,
        fetchImpl,
      });
      const present = new Set(skuIds);
      const found = expected.filter((id) => present.has(id));
      const missing = expected.filter((id) => !present.has(id));
      if (found.length === expected.length || attempt === getAttempts - 1) {
        return {
          succeeded: found.length,
          errors: missing.map((id) => ({
            id,
            reason: buildMissingProductReason({
              skuId: id,
              feedLogId: params.feedLogId,
              lastLog,
              lastLogError,
            }),
          })),
          feedLogId: params.feedLogId,
          verifiedVia: found.length > 0 ? "product_get" : "unverified",
        };
      }
    } catch {
      if (attempt === getAttempts - 1) break;
    }
  }

  return {
    succeeded: 0,
    errors: expected.map((id) => ({
      id,
      reason: buildMissingProductReason({
        skuId: id,
        feedLogId: params.feedLogId,
        lastLog,
        lastLogError,
        unableToConfirm: true,
      }),
    })),
    feedLogId: params.feedLogId,
    verifiedVia: "unverified",
  };
}

function buildMissingProductReason(params: {
  skuId: string;
  feedLogId?: string;
  lastLog: TiktokProductUploadLog | null;
  lastLogError: string | null;
  unableToConfirm?: boolean;
}): string {
  const parts: string[] = [];
  if (params.unableToConfirm) {
    parts.push(
      params.feedLogId
        ? `unable to confirm TikTok ingest for feed_log=${params.feedLogId}`
        : "unable to confirm TikTok catalog ingest",
    );
  } else {
    parts.push(
      params.feedLogId
        ? `upload accepted (feed_log=${params.feedLogId}) but product not found in catalog`
        : "upload accepted but product not found in catalog",
    );
  }

  if (params.lastLog) {
    const status = params.lastLog.rawStatus || params.lastLog.status;
    parts.push(`product_log.status=${status}`);
    if (params.lastLog.successCount != null) {
      parts.push(`success_count=${params.lastLog.successCount}`);
    }
    if (params.lastLog.failedCount != null) {
      parts.push(`failed_count=${params.lastLog.failedCount}`);
    }
    const skuError = params.lastLog.errors.find((e) => e.id === params.skuId);
    if (skuError?.reason) {
      parts.push(skuError.reason);
    } else if (params.lastLog.errors[0]?.reason) {
      parts.push(params.lastLog.errors[0].reason);
    }
  } else if (params.lastLogError) {
    parts.push(`product_log error: ${params.lastLogError}`);
  }

  return parts.join(" | ");
}
