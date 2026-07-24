import { analyzeTiktokFeedLogCsv } from "./tiktokFeedLogCsv.server";
import {
  fetchTiktokCatalogConf,
  formatTiktokCatalogDiagnostics,
} from "./tiktokCatalogClient.server";
import type { TiktokCatalogProductResult } from "../../../lib/aiTaskTypes";

export { parseTiktokFeedLogCsv, analyzeTiktokFeedLogCsv } from "./tiktokFeedLogCsv.server";

const TIKTOK_API_BASE = "https://business-api.tiktok.com/open_api/v1.3";
const LOG_PREFIX = "[AdsCatalog][TikTokConfirm]";

/** 原始返回日志上限：单店同步体量小，放宽截断以便排障拿到完整 TikTok 响应。 */
const RAW_LOG_MAX = 20000;

function rawForLog(text: string): string {
  if (text.length <= RAW_LOG_MAX) return text;
  return `${text.slice(0, RAW_LOG_MAX)}...(+${text.length - RAW_LOG_MAX} chars truncated)`;
}

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
  /** product_feed_log.warn_count */
  warnCount?: number | null;
  updateCount?: number | null;
  deleteCount?: number | null;
  feedId?: string;
  errors: Array<{ id: string; reason: string }>;
  /** CSV Warning 行（按 SKU）；不抬高失败计数，仅供失败原因展示 */
  warnings?: Array<{ id: string; reason: string }>;
  rawStatus?: string;
  /** TikTok 明细 CSV（通常在 feed_log_data.en） */
  feedLogDataUrl?: string;
  endTime?: string;
  /** CSV 已解析出的可读摘要（供 UI 展示，不含下载链接） */
  feedCsvSummary?: string;
}

export interface ConfirmTiktokCatalogUploadResult {
  succeeded: number;
  errors: Array<{ id: string; reason: string }>;
  feedLogId?: string;
  verifiedVia: "product_log" | "product_get" | "unverified";
  feedLogStatus?: string;
  feedCsvSummary?: string;
  warnings?: Array<{ id: string; reason: string }>;
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
    data.warning_list,
    data.audit_list,
    data.rejected_products,
    data.product_list,
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
        item.error_message ??
          item.issue ??
          item.fail_reason ??
          item.reason ??
          item.message ??
          item.error ??
          item.description ??
          "",
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

function pickFeedLogNode(root: Record<string, unknown>): Record<string, unknown> {
  return (
    asRecord(root.product_feed_log) ??
    asRecord(root.feed_log) ??
    asRecord(root.log) ??
    root
  );
}

/** 收集 feed_log_data 下所有 CSV URL，优先 en。 */
export function collectFeedLogDataUrls(data: unknown): string[] {
  const root = asRecord(data) ?? {};
  const nested = pickFeedLogNode(root);
  const candidates = [
    nested.feed_log_data,
    nested.feedLogData,
    nested.download_path,
    nested.log_download_url,
    nested.feed_log_file_url,
    root.feed_log_data,
    root.feedLogData,
    root.download_path,
    root.log_download_url,
    root.feed_log_file_url,
  ];
  const preferredKeys = ["en", "en-US", "EN", "en_US"];
  const urls: string[] = [];
  const seen = new Set<string>();

  function pushUrl(url: string | undefined) {
    const trimmed = url?.trim();
    if (!trimmed || !/^https?:\/\//i.test(trimmed) || seen.has(trimmed)) return;
    seen.add(trimmed);
    urls.push(trimmed);
  }

  function pickUrlFromRecord(record: Record<string, unknown>): string | undefined {
    // 直接语言键（旧版 feed_log_data: { en: "..." }）
    for (const key of preferredKeys) {
      const url = record[key];
      if (typeof url === "string" && /^https?:\/\//i.test(url.trim())) {
        return url.trim();
      }
    }
    for (const value of Object.values(record)) {
      if (typeof value === "string" && /^https?:\/\//i.test(value.trim())) {
        return value.trim();
      }
      // 新版多一层 download_path: { en: "..." }
      const subRecord = asRecord(value);
      if (subRecord) {
        for (const key of preferredKeys) {
          const url = subRecord[key];
          if (typeof url === "string" && /^https?:\/\//i.test(url.trim())) {
            return url.trim();
          }
        }
        for (const subValue of Object.values(subRecord)) {
          if (typeof subValue === "string" && /^https?:\/\//i.test(subValue.trim())) {
            return subValue.trim();
          }
        }
      }
    }
    return undefined;
  }

  function collectFromValue(value: unknown) {
    if (typeof value === "string") {
      pushUrl(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const row of value) {
        const item = asRecord(row);
        if (!item) continue;
        pushUrl(
          pickUrlFromRecord(item) ??
            (typeof item.url === "string" ? item.url : undefined) ??
            (typeof item.download_path === "string" ? item.download_path : undefined) ??
            (typeof item.download_url === "string" ? item.download_url : undefined),
        );
      }
      return;
    }
    const record = asRecord(value);
    if (!record) return;
    const preferred = pickUrlFromRecord(record);
    if (preferred) {
      pushUrl(preferred);
      return;
    }
    for (const subValue of Object.values(record)) {
      if (typeof subValue === "string" && /^https?:\/\//i.test(subValue.trim())) {
        pushUrl(subValue);
      }
    }
  }

  for (const candidate of candidates) {
    collectFromValue(candidate);
  }

  const preferred = urls.find((url) => /[/_-]en(?:[._-]|\.csv)/i.test(url));
  if (preferred) {
    return [preferred, ...urls.filter((url) => url !== preferred)];
  }
  return urls;
}

/** 从 feed_log_data / download_path 提取明细 CSV URL，优先 en。 */
export function extractFeedLogDataUrl(data: unknown): string | undefined {
  return collectFeedLogDataUrls(data)[0];
}

function isProcessJobStatusField(key: string): boolean {
  return key === "process_status" || key === "processing_status";
}

/** process_status=SUCCESS 仅表示日志任务结束，不代表商品已入库。 */
function resolveUploadLogStatus(params: {
  rawStatus: string;
  statusField?: string;
  successCount: number | null;
  failedCount: number | null;
  errorCount: number;
  hasEndTime: boolean;
}): TiktokUploadLogStatus {
  const fromCounts = inferStatusFromCounts({
    successCount: params.successCount,
    failedCount: params.failedCount,
    errorCount: params.errorCount,
    hasEndTime: params.hasEndTime,
  });
  if (fromCounts) return fromCounts;

  const normalized = normalizeUploadLogStatus(params.rawStatus);
  const processField = params.statusField && isProcessJobStatusField(params.statusField);
  if (processField) {
    if (normalized === "processing") return "processing";
    if (params.successCount === 0 && params.hasEndTime) return "failed";
    if (params.successCount === 0) return "processing";
    return normalized === "failed" ? "failed" : "success";
  }

  if (normalized === "unknown") return "unknown";
  return normalized;
}

/** 是否已拿到可展示给商户的失败/成功依据（避免首轮空 log 过早结算）。 */
export function isProductLogResolvable(log: TiktokProductUploadLog): boolean {
  if (log.status === "processing" || log.status === "unknown") return false;
  if (log.successCount != null && log.successCount > 0) return true;
  if (log.failedCount != null && log.failedCount > 0) return true;
  if (log.warnCount != null && log.warnCount > 0) return true;
  if (log.errors.length > 0) return true;
  if ((log.warnings?.length ?? 0) > 0) return true;
  if (log.feedCsvSummary?.trim()) return true;
  return false;
}

function inferStatusFromCounts(params: {
  successCount: number | null;
  failedCount: number | null;
  errorCount: number;
  hasEndTime: boolean;
}): TiktokUploadLogStatus | null {
  const { successCount, failedCount, errorCount, hasEndTime } = params;
  if (failedCount != null && successCount != null) {
    if (failedCount > 0 && successCount > 0) return "partial";
    if (failedCount > 0) return "failed";
    // add_count=0 & error_count=0 + end_time：处理结束但未入库，按失败终态
    if (successCount === 0 && hasEndTime) return "failed";
    return "success";
  }
  if (errorCount > 0 && (successCount == null || successCount === 0)) {
    return "failed";
  }
  // TikTok product_feed_log 常无 status，仅有 end_time + add_count/error_count
  if (hasEndTime) {
    if (failedCount != null && failedCount > 0 && (successCount == null || successCount === 0)) {
      return "failed";
    }
    if (successCount != null && successCount > 0 && (failedCount == null || failedCount === 0)) {
      return "success";
    }
    if (successCount === 0) return "failed";
    return "success";
  }
  return null;
}

/** 解析 /catalog/product/log/ 的 data 节点（兼容 product_feed_log / add_count）。 */
function detectStatusField(nested: Record<string, unknown>, root: Record<string, unknown>): string {
  if (nested.process_status != null) return "process_status";
  if (nested.processing_status != null) return "processing_status";
  if (nested.status != null) return "status";
  if (nested.feed_status != null) return "feed_status";
  if (root.process_status != null) return "process_status";
  if (root.status != null) return "status";
  return "status";
}

export function parseTiktokProductUploadLog(data: unknown): TiktokProductUploadLog {
  const root = asRecord(data) ?? {};
  const nested = pickFeedLogNode(root);
  const statusField = detectStatusField(nested, root);
  const rawStatus = String(
    nested.status ??
      nested.process_status ??
      nested.processing_status ??
      nested.feed_status ??
      root.status ??
      root.process_status ??
      "",
  );
  const successCount =
    readNumber(nested.success_count) ??
    readNumber(nested.succeed_count) ??
    readNumber(nested.add_count) ??
    readNumber(nested.success) ??
    readNumber(root.add_count) ??
    null;
  const failedCount =
    readNumber(nested.failed_count) ??
    readNumber(nested.fail_count) ??
    readNumber(nested.error_count) ??
    readNumber(nested.failure_count) ??
    readNumber(root.error_count) ??
    null;
  const warnCount =
    readNumber(nested.warn_count) ??
    readNumber(nested.warning_count) ??
    readNumber(root.warn_count) ??
    null;
  const updateCount =
    readNumber(nested.update_count) ?? readNumber(root.update_count) ?? null;
  const deleteCount =
    readNumber(nested.delete_count) ?? readNumber(root.delete_count) ?? null;
  const feedId = String(nested.feed_id ?? root.feed_id ?? "").trim() || undefined;
  const endTime = String(nested.end_time ?? nested.finish_time ?? root.end_time ?? "").trim();
  const feedLogDataUrls = collectFeedLogDataUrls(data);
  const feedLogDataUrl = feedLogDataUrls[0];
  const errors = extractLogErrors(nested).concat(
    nested === root ? [] : extractLogErrors(root),
  );

  const status = resolveUploadLogStatus({
    rawStatus,
    statusField,
    successCount,
    failedCount,
    errorCount: errors.length,
    hasEndTime: Boolean(endTime),
  });

  return {
    status,
    successCount,
    failedCount,
    errors,
    rawStatus: rawStatus || undefined,
    ...(warnCount != null ? { warnCount } : {}),
    ...(updateCount != null ? { updateCount } : {}),
    ...(deleteCount != null ? { deleteCount } : {}),
    ...(feedId ? { feedId } : {}),
    ...(feedLogDataUrl ? { feedLogDataUrl } : {}),
    ...(endTime ? { endTime } : {}),
  };
}

function mergeLogErrors(
  primary: Array<{ id: string; reason: string }>,
  extra: Array<{ id: string; reason: string }>,
): Array<{ id: string; reason: string }> {
  const map = new Map<string, string>();
  for (const err of primary) {
    if (err.id) map.set(err.id, err.reason);
  }
  for (const err of extra) {
    if (!err.id) continue;
    if (!map.has(err.id)) map.set(err.id, err.reason);
  }
  return [...map.entries()].map(([id, reason]) => ({ id, reason }));
}

async function enrichLogWithFeedCsv(params: {
  log: TiktokProductUploadLog;
  feedLogDataUrls?: string[];
  fetchImpl: typeof fetch;
}): Promise<TiktokProductUploadLog> {
  const urls = [
    ...(params.feedLogDataUrls ?? []),
    ...(params.log.feedLogDataUrl ? [params.log.feedLogDataUrl] : []),
  ].filter((url, index, list) => list.indexOf(url) === index);
  if (urls.length === 0) return params.log;
  if (params.log.status === "processing" || params.log.status === "unknown") {
    return params.log;
  }

  let merged: TiktokProductUploadLog = params.log;
  let lastDownloadError = "";

  for (const url of urls) {
    console.info(`${LOG_PREFIX} step=feed_csv_request url=${url.slice(0, 240)}`);
    try {
      const response = await params.fetchImpl(url, {
        method: "GET",
        headers: { Accept: "text/csv,text/plain,*/*" },
      });
      const text = await response.text();
      const contentType = response.headers.get("content-type") ?? "";
      if (!response.ok) {
        lastDownloadError = `HTTP ${response.status}`;
        console.warn(
          `${LOG_PREFIX} step=feed_csv_http_error http=${response.status} contentType=${contentType} body=${rawForLog(text)}`,
        );
        continue;
      }

      const analysis = analyzeTiktokFeedLogCsv(text);
      console.info(
        `${LOG_PREFIX} step=feed_csv_parsed delimiter=${JSON.stringify(analysis.delimiter)} headers=${JSON.stringify(analysis.headers)} rowCount=${analysis.rowCount} errorCount=${analysis.errors.length} warningCount=${analysis.warnings.length} summaryCount=${analysis.summaryReasons.length} contentType=${contentType} url=${url.slice(0, 240)} content=${JSON.stringify(rawForLog(text))}`,
      );
      if (analysis.errors.length > 0) {
        console.warn(
          `${LOG_PREFIX} step=feed_csv_errors ${JSON.stringify(analysis.errors.slice(0, 20))}`,
        );
      }
      if (analysis.warnings.length > 0) {
        console.warn(
          `${LOG_PREFIX} step=feed_csv_warnings ${JSON.stringify(analysis.warnings.slice(0, 20))}`,
        );
      }
      if (analysis.summaryReasons.length > 0) {
        console.warn(
          `${LOG_PREFIX} step=feed_csv_summary ${JSON.stringify(analysis.summaryReasons.slice(0, 10))}`,
        );
      }

      const summary =
        analysis.summaryReasons.slice(0, 3).join("；") ||
        (analysis.errors[0]?.reason ?? analysis.warnings[0]?.reason ?? "");

      merged = {
        ...merged,
        feedLogDataUrl: url,
        errors: mergeLogErrors(merged.errors, analysis.errors),
        warnings: mergeLogErrors(merged.warnings ?? [], analysis.warnings),
        ...(summary ? { feedCsvSummary: summary } : {}),
      };

      if (
        analysis.errors.length > 0 ||
        analysis.warnings.length > 0 ||
        analysis.summaryReasons.length > 0
      ) {
        return merged;
      }
    } catch (e) {
      lastDownloadError = e instanceof Error ? e.message : String(e);
      console.warn(`${LOG_PREFIX} step=feed_csv_error error=${lastDownloadError}`);
    }
  }

  if (!merged.feedCsvSummary && lastDownloadError) {
    return {
      ...merged,
      feedCsvSummary: `failed to download feed_log CSV (${lastDownloadError})`,
    };
  }
  return merged;
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
  url.searchParams.set("language", "en");
  if (params.advertiserId) {
    url.searchParams.set("advertiser_id", params.advertiserId);
  }

  console.info(
    `${LOG_PREFIX} step=product_log_request bcId=${params.bcId} catalogId=${params.catalogId} feedLogId=${params.feedLogId} advertiserId=${params.advertiserId ?? ""}`,
  );

  const response = await fetchImpl(url.toString(), {
    method: "GET",
    headers: { "Access-Token": params.accessToken },
  });
  const text = await response.text();
  let payload: { code?: number; message?: string; request_id?: string; data?: unknown } = {};
  try {
    payload = text ? (JSON.parse(text) as typeof payload) : {};
  } catch {
    payload = {};
  }

  console.info(
    `${LOG_PREFIX} step=product_log_response http=${response.status} code=${payload.code ?? ""} message=${payload.message ?? ""} request_id=${payload.request_id ?? ""} body=${rawForLog(text)}`,
  );

  if (!response.ok || (payload.code !== undefined && payload.code !== 0)) {
    const detail =
      payload.message ||
      (payload.code !== undefined ? `code=${payload.code}` : "") ||
      text.slice(0, 200) ||
      response.statusText;
    throw new Error(`TikTok product log failed: HTTP ${response.status} ${detail}`.trim());
  }

  // Dump 完整 data 节点：add_count=0/error_count=0 静默失败时，真因（区域/币种/类目等）常藏在这里。
  console.info(
    `${LOG_PREFIX} step=product_log_data feedLogId=${params.feedLogId} data=${rawForLog(
      JSON.stringify(payload.data ?? null),
    )}`,
  );

  let parsed = parseTiktokProductUploadLog(payload.data);
  parsed = await enrichLogWithFeedCsv({
    log: parsed,
    feedLogDataUrls: collectFeedLogDataUrls(payload.data),
    fetchImpl,
  });
  console.info(
    `${LOG_PREFIX} step=product_log_parsed status=${parsed.status} rawStatus=${parsed.rawStatus ?? ""} successCount=${parsed.successCount ?? ""} failedCount=${parsed.failedCount ?? ""} errorCount=${parsed.errors.length} endTime=${parsed.endTime ?? ""} feedCsv=${parsed.feedLogDataUrl ? "yes" : "no"}`,
  );
  return parsed;
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

  console.info(
    `${LOG_PREFIX} step=product_get_request bcId=${params.bcId} catalogId=${params.catalogId} pageSize=${params.pageSize ?? 100}`,
  );

  const response = await fetchImpl(url.toString(), {
    method: "GET",
    headers: { "Access-Token": params.accessToken },
  });
  const text = await response.text();
  let payload: { code?: number; message?: string; request_id?: string; data?: unknown } = {};
  try {
    payload = text ? (JSON.parse(text) as typeof payload) : {};
  } catch {
    payload = {};
  }

  console.info(
    `${LOG_PREFIX} step=product_get_response http=${response.status} code=${payload.code ?? ""} message=${payload.message ?? ""} request_id=${payload.request_id ?? ""} body=${rawForLog(text)}`,
  );

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
  console.info(
    `${LOG_PREFIX} step=product_get_parsed count=${skuIds.length} sampleSkus=${skuIds.slice(0, 20).join(",")}`,
  );
  return skuIds;
}

function defaultRejectReason(log: TiktokProductUploadLog, feedLogId?: string): string {
  // 优先展示已解析的 CSV 具体原因，并附带明细 CSV HTTPS 链接。
  const parsed =
    log.feedCsvSummary?.trim() ||
    log.warnings?.[0]?.reason ||
    log.errors[0]?.reason ||
    "";
  if (parsed) {
    return log.feedLogDataUrl ? `${parsed} | details=${log.feedLogDataUrl}` : parsed;
  }

  const parts: string[] = [];
  if (log.successCount === 0) {
    parts.push("TikTok 处理完成但未入库任何商品（add_count=0）");
  } else {
    parts.push("rejected by TikTok Catalog product log");
  }
  if (log.rawStatus) parts.push(`process_status=${log.rawStatus}`);
  if (log.successCount != null) parts.push(`add_count=${log.successCount}`);
  if (log.failedCount != null) parts.push(`error_count=${log.failedCount}`);
  if (log.warnCount != null) parts.push(`warn_count=${log.warnCount}`);
  if (log.updateCount != null) parts.push(`update_count=${log.updateCount}`);
  if (log.deleteCount != null) parts.push(`delete_count=${log.deleteCount}`);
  if (log.feedId) parts.push(`feed_id=${log.feedId}`);
  if (feedLogId) parts.push(`feed_log=${feedLogId}`);
  if (log.endTime) parts.push(`end_time=${log.endTime}`);
  if (!log.feedLogDataUrl) {
    parts.push(
      "未返回 feed_log 明细 CSV；常见原因：商品库 channel 非 CLIENT、币种/区域与商品不匹配，或目录为 TikTok 后台手动创建",
    );
  } else {
    parts.push(`details=${log.feedLogDataUrl}`);
  }
  return parts.join(" | ");
}

async function appendCatalogDiagnosticsToErrors(params: {
  accessToken: string;
  bcId: string;
  catalogId: string;
  errors: Array<{ id: string; reason: string }>;
}): Promise<Array<{ id: string; reason: string }>> {
  if (params.errors.length === 0) return params.errors;
  try {
    const conf = await fetchTiktokCatalogConf({
      accessToken: params.accessToken,
      bcId: params.bcId,
      catalogId: params.catalogId,
    });
    if (!conf) return params.errors;
    const diag = formatTiktokCatalogDiagnostics(conf);
    return params.errors.map((err) =>
      err.reason.includes(diag) ? err : { ...err, reason: `${err.reason} | ${diag}` },
    );
  } catch {
    return params.errors;
  }
}

function findErrorReason(
  errorById: Map<string, string>,
  skuId: string,
): string | undefined {
  if (errorById.has(skuId)) return errorById.get(skuId);
  const lower = skuId.toLowerCase();
  for (const [id, reason] of errorById) {
    if (id.toLowerCase() === lower) return reason;
  }
  return undefined;
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
  const warningById = new Map<string, string>();
  for (const warn of params.log.warnings ?? []) {
    if (warn.id) warningById.set(warn.id, warn.reason);
  }
  const usedCsvIds = new Set<string>();

  let succeeded =
    params.log.successCount != null
      ? Math.max(0, Math.min(params.expected.length, params.log.successCount))
      : params.expected.filter((id) => !findErrorReason(errorById, id)).length;

  if (params.log.status === "failed" && params.log.successCount == null) {
    succeeded = 0;
  }

  // 无 CSV 时：per-product 展示简短原因，完整技术诊断放 feedCsvSummary（顶部展示一次，不重复）。
  const hasPerProductData = Boolean(params.log.feedLogDataUrl || params.log.feedCsvSummary);
  const fullDiagnostic = defaultRejectReason(params.log, params.feedLogId);
  const perProductFallback = hasPerProductData
    ? fullDiagnostic
    : "TikTok 未入库（TikTok 未提供逐商品明细）";
  const computedFeedCsvSummary =
    params.log.feedCsvSummary ??
    (!hasPerProductData && params.log.successCount === 0 ? fullDiagnostic : undefined);

  console.info(
    `${LOG_PREFIX} step=settle_from_product_log status=${params.log.status} successCount=${params.log.successCount ?? ""} failedCount=${params.log.failedCount ?? ""} hardErrors=${params.log.errors.length} warnings=${params.log.warnings?.length ?? 0} feedCsvSummary=${JSON.stringify(params.log.feedCsvSummary ?? "")} feedCsvUrl=${params.log.feedLogDataUrl ?? ""} fullDiagnostic=${JSON.stringify(fullDiagnostic)}`,
  );
  const errors: Array<{ id: string; reason: string }> = [];
  // 仅硬错误计入失败明细；Warning 不单独抬高失败（由 add_count 决定是否补失败项）
  for (const id of params.expected) {
    const matchedKey = [...errorById.keys()].find(
      (key) => key === id || key.toLowerCase() === id.toLowerCase(),
    );
    if (matchedKey) {
      usedCsvIds.add(matchedKey);
      errors.push({
        id,
        reason: errorById.get(matchedKey) || perProductFallback,
      });
    }
  }

  const unusedCsvErrors = [...errorById.entries()].filter(([csvId]) => !usedCsvIds.has(csvId));
  const unusedCsvWarnings = [...warningById.entries()].filter(
    ([csvId]) => !usedCsvIds.has(csvId),
  );

  // 按计数补齐未给出明细的失败项，避免误报成功。
  const unresolved = params.expected.filter((id) => !errors.some((e) => e.id === id));
  let needFail = Math.max(0, params.expected.length - succeeded);
  let unusedErrIdx = 0;
  let unusedWarnIdx = 0;
  for (const id of unresolved) {
    if (needFail <= 0) break;
    const softReason = findErrorReason(warningById, id);
    if (softReason) {
      usedCsvIds.add(id);
      errors.push({ id, reason: softReason });
      needFail -= 1;
      continue;
    }
    // CSV SKU 对不齐时：先借用硬错误明细，再借用 Warning，最后退回已解析摘要
    const borrowedErr = unusedCsvErrors[unusedErrIdx];
    if (borrowedErr) {
      unusedErrIdx += 1;
      errors.push({ id, reason: `${borrowedErr[1]} (tiktok_sku=${borrowedErr[0]})` });
      needFail -= 1;
      continue;
    }
    const borrowedWarn = unusedCsvWarnings[unusedWarnIdx];
    if (borrowedWarn) {
      unusedWarnIdx += 1;
      errors.push({ id, reason: `${borrowedWarn[1]} (tiktok_sku=${borrowedWarn[0]})` });
      needFail -= 1;
      continue;
    }
    errors.push({ id, reason: perProductFallback });
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
    feedLogStatus: params.log.status,
    feedCsvSummary: computedFeedCsvSummary,
    warnings: params.log.warnings,
  };
}

/**
 * 上传受理后确认真实入库结果：优先轮询 product/log，失败则回退 product/get。
 * 无法证实时按失败处理，避免 App 误报成功。
 */
async function finalizeConfirmResult(params: {
  accessToken: string;
  bcId: string;
  catalogId: string;
  result: ConfirmTiktokCatalogUploadResult;
}): Promise<ConfirmTiktokCatalogUploadResult> {
  if (params.result.succeeded > 0 || params.result.errors.length === 0) {
    return params.result;
  }
  return {
    ...params.result,
    errors: await appendCatalogDiagnosticsToErrors({
      accessToken: params.accessToken,
      bcId: params.bcId,
      catalogId: params.catalogId,
      errors: params.result.errors,
    }),
  };
}

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
    console.info(`${LOG_PREFIX} step=confirm_skip reason=no_expected_skus`);
    return { succeeded: 0, errors: [], feedLogId: params.feedLogId, verifiedVia: "unverified" };
  }

  const maxAttempts = params.deps?.maxAttempts ?? 12;
  const intervalMs = params.deps?.intervalMs ?? 5000;
  const sleep = params.deps?.sleep ?? defaultSleep;
  const fetchImpl = params.deps?.fetchImpl ?? fetch;

  console.info(
    `${LOG_PREFIX} step=confirm_start bcId=${params.bcId} catalogId=${params.catalogId} feedLogId=${params.feedLogId ?? ""} expected=${expected.length} maxAttempts=${maxAttempts} intervalMs=${intervalMs} skus=${expected.slice(0, 20).join(",")}`,
  );

  let lastLog: TiktokProductUploadLog | null = null;
  let lastLogError: string | null = null;

  if (params.feedLogId) {
    const initialDelayMs = Math.min(intervalMs, 3000);
    await sleep(initialDelayMs);
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (attempt > 0) await sleep(intervalMs);
      console.info(
        `${LOG_PREFIX} step=confirm_poll_log attempt=${attempt + 1}/${maxAttempts} feedLogId=${params.feedLogId}`,
      );
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
        const resolvable = isProductLogResolvable(log);
        const isLastAttempt = attempt === maxAttempts - 1;
        if (settled && (resolvable || isLastAttempt)) {
          console.info(
            `${LOG_PREFIX} step=confirm_settled_via_product_log status=${log.status} resolvable=${resolvable} succeeded=${settled.succeeded} failed=${settled.errors.length}`,
          );
          return finalizeConfirmResult({
            accessToken: params.accessToken,
            bcId: params.bcId,
            catalogId: params.catalogId,
            result: {
              ...settled,
              feedLogStatus: log.status,
              // settled.feedCsvSummary 优先（可能含无 CSV 时的完整诊断），回退 log.feedCsvSummary
              feedCsvSummary: settled.feedCsvSummary ?? log.feedCsvSummary,
              warnings: log.warnings,
            },
          });
        }
        if (settled && !resolvable) {
          console.info(
            `${LOG_PREFIX} step=confirm_log_await_details status=${log.status} rawStatus=${log.rawStatus ?? ""} feedCsv=${log.feedLogDataUrl ? "yes" : "no"} addCount=${log.successCount ?? ""} attempt=${attempt + 1}`,
          );
          continue;
        }
        console.info(
          `${LOG_PREFIX} step=confirm_log_not_terminal status=${log.status} rawStatus=${log.rawStatus ?? ""}`,
        );
      } catch (e) {
        lastLogError = e instanceof Error ? e.message : String(e);
        console.warn(
          `${LOG_PREFIX} step=confirm_poll_log_error attempt=${attempt + 1} error=${lastLogError}`,
        );
        // log 查询失败时继续重试，最终回退 product/get
      }
    }
  } else {
    console.warn(`${LOG_PREFIX} step=confirm_no_feed_log fallback=product_get`);
  }

  const getAttempts = params.feedLogId ? 3 : maxAttempts;
  for (let attempt = 0; attempt < getAttempts; attempt += 1) {
    if (attempt > 0) await sleep(intervalMs);
    console.info(
      `${LOG_PREFIX} step=confirm_poll_get attempt=${attempt + 1}/${getAttempts} catalogId=${params.catalogId}`,
    );
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
      console.info(
        `${LOG_PREFIX} step=confirm_get_match found=${found.length} missing=${missing.length} missingSkus=${missing.slice(0, 20).join(",")}`,
      );
      if (found.length === expected.length || attempt === getAttempts - 1) {
        const result: ConfirmTiktokCatalogUploadResult = {
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
        console.info(
          `${LOG_PREFIX} step=confirm_done via=${result.verifiedVia} succeeded=${result.succeeded} failed=${result.errors.length}`,
        );
        return finalizeConfirmResult({
          accessToken: params.accessToken,
          bcId: params.bcId,
          catalogId: params.catalogId,
          result,
        });
      }
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      console.warn(
        `${LOG_PREFIX} step=confirm_poll_get_error attempt=${attempt + 1} error=${detail}`,
      );
      if (attempt === getAttempts - 1) break;
    }
  }

  console.error(
    `${LOG_PREFIX} step=confirm_unverified feedLogId=${params.feedLogId ?? ""} lastLogError=${lastLogError ?? ""} lastLogStatus=${lastLog?.status ?? ""}`,
  );
  return finalizeConfirmResult({
    accessToken: params.accessToken,
    bcId: params.bcId,
    catalogId: params.catalogId,
    result: {
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
      feedLogStatus: lastLog?.status,
      feedCsvSummary: lastLog?.feedCsvSummary,
      warnings: lastLog?.warnings,
    },
  });
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
    const skuError = params.lastLog.errors.find((e) => e.id === params.skuId);
    const skuWarning = params.lastLog.warnings?.find((e) => e.id === params.skuId);
    const concrete =
      skuError?.reason ||
      skuWarning?.reason ||
      params.lastLog.feedCsvSummary ||
      params.lastLog.errors[0]?.reason ||
      params.lastLog.warnings?.[0]?.reason;
    if (concrete) {
      // 已有 CSV 具体原因时，只展示原因本身，避免链接/计数噪声
      return concrete;
    }
    const status = params.lastLog.rawStatus || params.lastLog.status;
    parts.push(`product_log.status=${status}`);
  } else if (params.lastLogError) {
    parts.push(`product_log error: ${params.lastLogError}`);
  }

  return parts.join(" | ");
}

export function buildTiktokProductResults(params: {
  expectedSkuIds: string[];
  confirmed: ConfirmTiktokCatalogUploadResult;
}): TiktokCatalogProductResult[] {
  const errorMap = new Map(params.confirmed.errors.map((e) => [e.id, e.reason]));
  const warningMap = new Map((params.confirmed.warnings ?? []).map((w) => [w.id, w.reason]));
  return params.expectedSkuIds.map((sku) => {
    const failReason = errorMap.get(sku);
    if (failReason) {
      return { productId: sku, status: "failed" as const, reason: failReason };
    }
    const warnReason = warningMap.get(sku);
    if (warnReason) {
      return { productId: sku, status: "warning" as const, reason: warnReason };
    }
    if (params.confirmed.verifiedVia === "unverified") {
      return {
        productId: sku,
        status: "pending" as const,
        reason: "等待 TikTok 确认入库结果",
      };
    }
    return { productId: sku, status: "success" as const };
  });
}

/** 同步进行中：映射/上传阶段的可展示逐商品状态（尚未拿到 TikTok 入库明细时）。 */
export function buildTiktokProgressProductResults(params: {
  mappingErrors: Array<{ productId: string; reason: string }>;
  expectedSkuIds: string[];
  uploadErrors?: Array<{ id: string; reason: string }>;
}): TiktokCatalogProductResult[] {
  const uploadErrorMap = new Map((params.uploadErrors ?? []).map((entry) => [entry.id, entry.reason]));
  const rows: TiktokCatalogProductResult[] = params.expectedSkuIds.map((sku) => {
    const uploadReason = uploadErrorMap.get(sku);
    if (uploadReason) {
      return { productId: sku, status: "failed" as const, reason: uploadReason };
    }
    return { productId: sku, status: "pending" as const };
  });
  for (const err of params.mappingErrors) {
    rows.push({ productId: err.productId, status: "failed" as const, reason: err.reason });
  }
  return rows;
}

export async function refreshTiktokFeedLogProductResults(params: {
  accessToken: string;
  advertiserId: string;
  bcId: string;
  catalogId: string;
  feedLogId: string;
  expectedSkuIds: string[];
}): Promise<{
  productResults: TiktokCatalogProductResult[];
  feedLogStatus?: string;
  feedCsvSummary?: string;
  succeeded: number;
  failed: number;
}> {
  const log = await fetchTiktokProductUploadLog({
    accessToken: params.accessToken,
    bcId: params.bcId,
    catalogId: params.catalogId,
    feedLogId: params.feedLogId,
    advertiserId: params.advertiserId,
  });
  const settled = settleFromProductLog({
    expected: params.expectedSkuIds,
    log,
    feedLogId: params.feedLogId,
  });
  // TikTok 仍在处理中：返回 pending 状态避免 UI 闪烁（不要把"无结果"误判为失败）。
  const isStillProcessing = log.status === "processing" || log.status === "unknown";
  const confirmed: ConfirmTiktokCatalogUploadResult = settled ?? {
    succeeded: 0,
    errors: isStillProcessing
      ? []
      : params.expectedSkuIds.map((id) => ({
          id,
          reason: "无法解析入库结果",
        })),
    feedLogId: params.feedLogId,
    verifiedVia: isStillProcessing ? "unverified" : "product_log",
    feedLogStatus: log.status,
    feedCsvSummary: log.feedCsvSummary,
    warnings: log.warnings,
  };
  const productResults = buildTiktokProductResults({
    expectedSkuIds: params.expectedSkuIds,
    confirmed,
  });
  return {
    productResults,
    feedLogStatus: log.status,
    feedCsvSummary: log.feedCsvSummary,
    succeeded: confirmed.succeeded,
    failed: confirmed.errors.length,
  };
}
