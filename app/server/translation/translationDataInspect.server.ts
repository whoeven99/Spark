import type { TranslationJobDoc } from "./cosmosJobStore.server";
import {
  getTranslationCosmosMeta,
  readTranslationJobDocument,
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

  const doc = await readTranslationJobDocument(shop, cleanId);
  if (!doc) {
    return {
      success: false,
      errorCode: DATA_INSPECT_FAILED_CODE,
      errorMsg: `Cosmos 未找到任务：${cleanId}`,
      response: null,
    };
  }

  const prefix = taskBlobPrefix(shop, cleanId);
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
      storage: {
        cosmos: getTranslationCosmosMeta(),
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
