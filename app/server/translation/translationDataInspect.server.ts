import type { TranslationJobDoc } from "./cosmosJobStore.server";
import {
  findTranslationJobsById,
  getTranslationCosmosMeta,
  resolveTranslationJobDocument,
} from "./cosmosJobStore.server";
import {
  getTranslationBlobMeta,
  listTranslationBlobPaths,
  translationBlobExists,
  translationBlobReadTextPrefix,
  translationBlobSizeBytes,
} from "./translateBlobStore.server";

export const DATA_INSPECT_FAILED_CODE = 10001;

export type TranslationDataInspectEnvelope = {
  success: boolean;
  errorCode: number;
  errorMsg: string;
  response: Record<string, unknown> | null;
};

function cosmosDocToPublicMap(doc: TranslationJobDoc): Record<string, unknown> {
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
    hasAccessToken: Boolean(doc.accessToken?.trim()),
  };
}

function taskBlobPrefix(shop: string, taskId: string) {
  return `tasks/${shop}/${taskId}/`;
}

function normalizeShopForHint(value: string) {
  return value.trim().toLowerCase();
}

/**
 * Spark 本机聚合：Cosmos 任务文档 + 该任务下 Blob 列表（不转发 AgentTask）。
 */
export async function buildTranslationDataInspectEnvelope(options: {
  taskId: string;
  shopName: string;
  includeManifestPreview?: boolean;
  maxPreviewBytes?: number;
}): Promise<TranslationDataInspectEnvelope> {
  const cleanId = options.taskId.trim();
  const shop = options.shopName.trim();
  if (!cleanId) {
    return {
      success: false,
      errorCode: DATA_INSPECT_FAILED_CODE,
      errorMsg: "Missing parameters: taskId",
      response: null,
    };
  }
  if (!shop) {
    return {
      success: false,
      errorCode: DATA_INSPECT_FAILED_CODE,
      errorMsg: "Missing parameters: shopName",
      response: null,
    };
  }

  const cosmosMeta = getTranslationCosmosMeta();
  const resolved = await resolveTranslationJobDocument(shop, cleanId);
  if (!resolved) {
    const prefixGuess = taskBlobPrefix(shop, cleanId);
    const blobGuess = await listTranslationBlobPaths(prefixGuess);
    const crossMatches = await findTranslationJobsById(cleanId);
    const crossHint =
      crossMatches.length > 0
        ? crossMatches.some((d) => normalizeShopForHint(d.shopName) === normalizeShopForHint(shop))
          ? "（文档存在；容器分区键为 /shop，老文档无 shop 字段，不能用 shopName 做点读）"
          : "（跨分区 id 查询有结果，但 shopName 与当前店铺不一致，请用正确店铺打开应用）"
        : "";
    const blobHint =
      blobGuess.length > 0
        ? ` Blob 在 ${prefixGuess} 下仍有 ${blobGuess.length} 个文件，可能是 Cosmos 点读分区键不匹配或文档已删。`
        : "";
    return {
      success: false,
      errorCode: DATA_INSPECT_FAILED_CODE,
      errorMsg:
        `Cosmos 未找到任务：${cleanId}（店铺=${shop || "—"}，库=${cosmosMeta.databaseId}/${cosmosMeta.containerId}@${cosmosMeta.endpointHost}）${crossHint}${blobHint}`,
      response: {
        storage: {
          cosmos: cosmosMeta,
          blob: getTranslationBlobMeta(),
          attemptedShop: shop,
          attemptedBlobPrefix: prefixGuess,
        },
        blobs: { total: blobGuess.length, files: blobGuess },
      },
    };
  }

  const doc = resolved.doc;
  const effectiveShop = doc.shopName?.trim() || shop;

  const prefix = taskBlobPrefix(effectiveShop, cleanId);
  const blobs = await listTranslationBlobPaths(prefix);
  const manifestPath = `${prefix}chunks/manifest.json`;
  let manifestPreview: string | null = null;
  let manifestParsed: Record<string, unknown> | null = null;
  if (options.includeManifestPreview !== false) {
    const cap = Math.min(Math.max(options.maxPreviewBytes ?? 8192, 256), 64 * 1024);
    manifestPreview = await translationBlobReadTextPrefix(manifestPath, cap);
    if (manifestPreview?.trim()) {
      try {
        manifestParsed = JSON.parse(manifestPreview) as Record<string, unknown>;
      } catch {
        manifestParsed = null;
      }
    }
  }

  const chunkFiles = blobs.filter((b) => b.path.includes("/chunks/") && b.path.endsWith(".json"));

  return {
    success: true,
    errorCode: 0,
    errorMsg: "",
    response: {
      cosmos: cosmosDocToPublicMap(doc),
      resolvedVia: resolved.resolvedVia,
      requestedShop: shop,
      effectiveShop,
      storage: {
        cosmos: cosmosMeta,
        blob: getTranslationBlobMeta(),
        blobPrefix: prefix,
      },
      blobs: {
        total: blobs.length,
        files: blobs,
        chunkFiles,
        manifest: {
          path: manifestPath,
          exists: await translationBlobExists(manifestPath),
          sizeBytes: await translationBlobSizeBytes(manifestPath),
          preview: manifestPreview,
          parsed: manifestParsed,
        },
      },
    },
  };
}
