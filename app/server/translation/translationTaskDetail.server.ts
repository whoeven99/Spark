import type { TranslationTaskCheckpoint } from "./types";
import { readTranslationJobDocument, type TranslationJobDoc } from "./cosmosJobStore.server";
import { getTranslateRedisClient } from "./translateRedis.server";
import {
  translationBlobExists,
  translationBlobReadTextFull,
  translationBlobReadTextPrefix,
  translationBlobSizeBytes,
} from "./translateBlobStore.server";

/** 与 AgentTask TranslateTaskMonitorV3RedisService.MONITOR_KEY_PREFIX 一致（Redis 键名未改） */
const TRANSLATION_MONITOR_REDIS_PREFIX = "translate_monitor_v3:";

const REPORT_FAILURES_MAX_BYTES = 512 * 1024;

export const BASE_RESPONSE_FAILED_CODE = 10001;

/** 与 Spring BaseResponse 及 AgentTask jsonRuntimeTaskDetail 的 body 结构对齐 */
export type TranslationTaskDetailEnvelope = {
  success: boolean;
  errorCode: number;
  errorMsg: string;
  response: Record<string, unknown> | null;
};

function safeText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function toBlobPath(blobUriOrPath: string): string {
  const raw = safeText(blobUriOrPath);
  if (!raw || !raw.includes("://")) return raw;
  try {
    const u = new URL(raw);
    let path = safeText(u.pathname);
    if (path.startsWith("/")) path = path.slice(1);
    const firstSlash = path.indexOf("/");
    if (firstSlash > 0 && firstSlash + 1 < path.length) {
      return path.slice(firstSlash + 1);
    }
    return path;
  } catch {
    return raw;
  }
}

function runtimeResultBlobField(
  checkpoint: TranslationTaskCheckpoint | undefined,
  field: string,
): string {
  if (!checkpoint) return "";
  const rr = checkpoint["runtimeResult"];
  if (!rr || typeof rr !== "object") return "";
  const v = (rr as Record<string, unknown>)[field];
  return typeof v === "string" ? v : "";
}

function firstNonEmptyRuntimeBlobUri(
  checkpoint: TranslationTaskCheckpoint | undefined,
  redisMeta: Record<string, string>,
  field: string,
): string {
  if (!field) return "";
  const fromCp = checkpoint ? safeText(checkpoint[field]) : "";
  if (fromCp) return fromCp;
  const fromResult = runtimeResultBlobField(checkpoint, field);
  if (fromResult) return fromResult;
  const fromRedis = safeText(redisMeta[field]);
  return fromRedis;
}

function cosmosJobDocToMap(doc: TranslationJobDoc): Record<string, unknown> {
  return {
    id: doc.id,
    shopName: doc.shopName,
    source: doc.source,
    target: doc.target,
    status: doc.status,
    statusText: doc.statusText,
    taskType: doc.taskType,
    aiModel: doc.aiModel,
    checkpoint: doc.checkpoint,
    metrics: doc.metrics,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    isCover: doc.cover,
    isHandle: doc.handle,
    moduleList: doc.moduleList,
    sessionId: doc.sessionId,
  };
}

async function getTranslationTaskProgress(
  taskId: string,
  redisPrefix: string,
): Promise<Record<string, unknown>> {
  const cleanPrefix = redisPrefix.trim() || "tr:v1";
  const tid = taskId.trim();
  const redis = getTranslateRedisClient();
  const metaKey = `${cleanPrefix}:task:${tid}:meta`;
  const doneKey = `${cleanPrefix}:task:${tid}:done`;
  const failKey = `${cleanPrefix}:task:${tid}:fail`;
  const chunkKey = `${cleanPrefix}:task:${tid}:chunkDone`;
  const resultKey = `${cleanPrefix}:task:${tid}:result`;

  const [meta, doneCard, failMap, chunkCard, resultLen] = await Promise.all([
    redis.hgetall(metaKey),
    redis.scard(doneKey),
    redis.hgetall(failKey),
    redis.scard(chunkKey),
    redis.hlen(resultKey),
  ]);

  return {
    taskId: tid,
    redisPrefix: cleanPrefix,
    meta,
    doneSize: Number(doneCard) || 0,
    failMap,
    chunkDoneSize: Number(chunkCard) || 0,
    resultSize: Number(resultLen) || 0,
  };
}

async function buildRuntimeBlobSnapshot(
  uriOrPath: string,
  includePreview: boolean,
  maxPreviewBytes: number,
): Promise<Record<string, unknown>> {
  const uri = safeText(uriOrPath);
  const snap: Record<string, unknown> = { uri };
  if (!uri) {
    snap.exists = false;
    snap.note = "checkpoint 中无此 URI（非 spark-transtion 任务或字段未写入）";
    return snap;
  }
  const path = toBlobPath(uri);
  snap.blobPath = path;
  const exists = await translationBlobExists(path);
  snap.exists = exists;
  if (!exists) return snap;

  const sizeBytes = await translationBlobSizeBytes(path);
  snap.sizeBytes = sizeBytes;
  if (!includePreview) return snap;

  const preview = await translationBlobReadTextPrefix(path, maxPreviewBytes);
  snap.preview = preview;
  if (sizeBytes != null && preview != null) {
    snap.previewTruncated = sizeBytes > maxPreviewBytes;
  }
  return snap;
}

async function enrichDetailWithReportFailures(
  body: Record<string, unknown>,
  reportUri: string,
): Promise<void> {
  const uri = safeText(reportUri);
  if (!uri) return;
  const path = toBlobPath(uri);
  if (!(await translationBlobExists(path))) return;

  const sz = await translationBlobSizeBytes(path);
  if (sz != null && sz > REPORT_FAILURES_MAX_BYTES) {
    body.runtimeReportFailuresTruncated = true;
    return;
  }
  const raw = await translationBlobReadTextFull(path);
  if (!raw?.trim()) return;
  try {
    const rep = JSON.parse(raw) as Record<string, unknown>;
    const failures = rep.failures;
    if (Array.isArray(failures) && failures.length > 0) {
      body.runtimeReportFailures = failures;
    }
  } catch {
    // 报告非 JSON
  }
}

function augmentRuntimeMetaFromCosmos(
  redisRuntime: Record<string, unknown>,
  doc: TranslationJobDoc,
): void {
  const raw = redisRuntime.meta;
  const meta: Record<string, string> =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? { ...(raw as Record<string, string>) }
      : {};
  const m = (doc.metrics ?? {}) as Record<string, unknown>;
  const ck = (doc.checkpoint ?? {}) as Record<string, unknown>;

  const setIfAbsent = (key: string, value: unknown) => {
    if (safeText(meta[key]) !== "") return;
    if (value === undefined || value === null) return;
    const s =
      typeof value === "number" && Number.isFinite(value)
        ? String(Math.trunc(value))
        : safeText(value);
    if (!s) return;
    meta[key] = s;
  };

  setIfAbsent("totalCountThisBlob", m.totalCount);
  setIfAbsent("currentDoneThisBlob", m.translatedCount);
  setIfAbsent("failCountThisBlob", m.failedCount);
  setIfAbsent("runtimeChunksTotal", m.runtimeChunksTotal ?? ck.runtimeChunksTotal);
  setIfAbsent("runtimeChunkDoneSize", m.runtimeChunksDone);
  redisRuntime.meta = meta;
}

async function enrichDetailWithChunksFailedJson(
  body: Record<string, unknown>,
  shopName: string,
  taskId: string,
): Promise<void> {
  const shop = safeText(shopName);
  const tid = safeText(taskId);
  if (!shop || !tid) return;
  const blobRel = `tasks/${shop}/${tid}/chunks/failed.json`;
  if (!(await translationBlobExists(blobRel))) return;
  const sz = await translationBlobSizeBytes(blobRel);
  if (sz != null && sz > REPORT_FAILURES_MAX_BYTES) {
    body.runtimeFailedJsonTruncated = true;
    return;
  }
  const raw = await translationBlobReadTextFull(blobRel);
  if (!raw?.trim()) return;
  try {
    const doc = JSON.parse(raw) as Record<string, unknown>;
    if (doc && Object.keys(doc).length > 0) {
      body.runtimeFailedJson = doc;
    }
  } catch {
    // 非 JSON
  }
}

/** Spark 进程内聚合翻译任务详情（Cosmos / Redis / Blob） */
export async function buildSparkTranslationTaskDetailEnvelope(options: {
  taskId: string;
  shopName: string;
  redisPrefix?: string;
  includeBlobPreview: boolean;
  maxPreviewBytes: number;
}): Promise<TranslationTaskDetailEnvelope> {
  const cleanId = safeText(options.taskId);
  if (!cleanId) {
    return {
      success: false,
      errorCode: BASE_RESPONSE_FAILED_CODE,
      errorMsg: "Missing parameters: taskId",
      response: null,
    };
  }

  const shop = safeText(options.shopName);
  if (!shop) {
    return {
      success: false,
      errorCode: BASE_RESPONSE_FAILED_CODE,
      errorMsg: "Missing parameters: shopName",
      response: null,
    };
  }

  const doc = await readTranslationJobDocument(shop, cleanId);
  if (!doc) {
    return {
      success: false,
      errorCode: BASE_RESPONSE_FAILED_CODE,
      errorMsg: `Task not found: ${cleanId}`,
      response: null,
    };
  }

  const checkpoint = (doc.checkpoint ?? {}) as TranslationTaskCheckpoint;

  let effectiveRedis = safeText(options.redisPrefix);
  if (!effectiveRedis) {
    effectiveRedis = safeText(checkpoint["redisPrefix"]);
  }
  if (!effectiveRedis) {
    effectiveRedis = "tr:v1";
  }

  let cap = options.maxPreviewBytes;
  if (cap <= 0) cap = 8192;
  cap = Math.min(Math.max(cap, 256), 512 * 1024);

  const body: Record<string, unknown> = {};
  body.cosmos = cosmosJobDocToMap(doc);
  body.resolvedRedisPrefix = effectiveRedis;
  body.redisRuntime = await getTranslationTaskProgress(cleanId, effectiveRedis);
  augmentRuntimeMetaFromCosmos(body.redisRuntime as Record<string, unknown>, doc);

  const redisMeta =
    (body.redisRuntime as { meta?: Record<string, string> }).meta ?? {};

  const inputUri = firstNonEmptyRuntimeBlobUri(checkpoint, redisMeta, "inputBlobUri");
  const outputUri = firstNonEmptyRuntimeBlobUri(checkpoint, redisMeta, "outputBlobUri");
  const reportUri = firstNonEmptyRuntimeBlobUri(checkpoint, redisMeta, "reportBlobUri");

  const translationReportRel = `tasks/${shop}/${cleanId}/chunks/translation-report.md`;
  const qualityReportRel = `tasks/${shop}/${cleanId}/chunks/translation-quality-report.md`;
  const blobs: Record<string, unknown> = {
    input: await buildRuntimeBlobSnapshot(inputUri, options.includeBlobPreview, cap),
    output: await buildRuntimeBlobSnapshot(outputUri, options.includeBlobPreview, cap),
    report: await buildRuntimeBlobSnapshot(reportUri, options.includeBlobPreview, cap),
    translationReportMd: await buildRuntimeBlobSnapshot(
      translationReportRel,
      options.includeBlobPreview,
      cap,
    ),
    qualityReportMd: await buildRuntimeBlobSnapshot(
      qualityReportRel,
      options.includeBlobPreview,
      cap,
    ),
  };
  body.blobs = blobs;

  if (options.includeBlobPreview) {
    const reportSnap = blobs.report as Record<string, unknown>;
    const preview = reportSnap.preview;
    if (typeof preview === "string" && preview.length > 0) {
      try {
        body.reportParsed = JSON.parse(preview) as Record<string, unknown>;
      } catch {
        // 预览截断或非 JSON
      }
    }
  }

  await enrichDetailWithReportFailures(body, reportUri);
  await enrichDetailWithChunksFailedJson(body, doc.shopName, cleanId);

  try {
    const redis = getTranslateRedisClient();
    const monitor = await redis.hgetall(`${TRANSLATION_MONITOR_REDIS_PREFIX}${cleanId}`);
    if (monitor && Object.keys(monitor).length > 0) {
      body.translateMonitor = monitor;
    }
  } catch (err) {
    console.warn("[TranslationTaskDetail] translate_monitor read failed", err);
  }

  return {
    success: true,
    errorCode: 0,
    errorMsg: "",
    response: body,
  };
}
