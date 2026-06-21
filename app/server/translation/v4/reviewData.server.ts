/**
 * 从 Blob 装配翻译 V4 任务的「期望写回译文」，供写回详情查看页对账。
 *
 * 数据来源（与 worker 写入路径一致）：
 *  - tasks/v4/{shop}/{jobId}/translate/{module}/*.json  →  TranslatedItem[]
 *  - tasks/v4/{shop}/{jobId}/writeback/progress.json     →  { written: string[] }
 *  - tasks/v4/{shop}/{jobId}/writeback/failed.json       →  FailedResource[]
 */
import { getTranslateV3BlobContainer } from "../translateBlobStore.server";

type TranslatedItem = {
  resourceId: string;
  translations: Array<{
    key: string;
    originalValue: string;
    translatedValue: string;
    digest: string;
  }>;
};

export type ReviewField = {
  key: string;
  originalValue: string;
  translatedValue: string;
  digest: string;
};

export type ReviewResource = {
  resourceId: string;
  module: string;
  /** 写回阶段的结果：success=已成功写回，failed=写回失败，unknown=未在记录中。 */
  writebackResult: "success" | "failed" | "unknown";
  fields: ReviewField[];
};

async function readJsonBlob<T>(path: string): Promise<T | null> {
  try {
    const container = await getTranslateV3BlobContainer();
    const client = container.getBlockBlobClient(path);
    if (!(await client.exists())) return null;
    const buf = await client.downloadToBuffer();
    return JSON.parse(buf.toString("utf8")) as T;
  } catch {
    return null;
  }
}

async function listJsonBlobPaths(prefix: string): Promise<string[]> {
  const paths: string[] = [];
  try {
    const container = await getTranslateV3BlobContainer();
    for await (const item of container.listBlobsFlat({ prefix })) {
      if (item.name.endsWith(".json")) paths.push(item.name);
    }
  } catch {
    // 返回已收集到的部分
  }
  return paths;
}

/** 进入写回范围的字段：非空；handle 与原文相同时跳过（Shopify 会拒写）。 */
function inScopeFields(item: TranslatedItem): ReviewField[] {
  return item.translations
    .filter((t) => {
      const translated = t.translatedValue?.trim();
      if (!translated) return false;
      if (t.key === "handle" && translated === (t.originalValue ?? "").trim()) return false;
      return true;
    })
    .map((t) => ({
      key: t.key,
      originalValue: t.originalValue,
      translatedValue: t.translatedValue,
      digest: t.digest,
    }));
}

/**
 * 装配一个任务的全部待对账资源（已按 resource 去重、过滤掉无写回字段的资源）。
 * 返回结果稳定排序，便于分页。
 */
export async function loadJobReviewResources(
  blobPrefix: string,
  modules: string[],
): Promise<ReviewResource[]> {
  const [progress, failed] = await Promise.all([
    readJsonBlob<{ written: string[] }>(`${blobPrefix}/writeback/progress.json`),
    readJsonBlob<Array<{ resourceId: string }>>(`${blobPrefix}/writeback/failed.json`),
  ]);
  const writtenSet = new Set(progress?.written ?? []);
  const failedSet = new Set((failed ?? []).map((f) => f.resourceId));

  const resources: ReviewResource[] = [];
  for (const module of modules) {
    const chunkPaths = await listJsonBlobPaths(`${blobPrefix}/translate/${module}/`);
    for (const chunkPath of chunkPaths) {
      const chunk = await readJsonBlob<TranslatedItem[]>(chunkPath);
      if (!chunk) continue;
      for (const item of chunk) {
        const fields = inScopeFields(item);
        if (fields.length === 0) continue;
        resources.push({
          resourceId: item.resourceId,
          module,
          writebackResult: failedSet.has(item.resourceId)
            ? "failed"
            : writtenSet.has(item.resourceId)
              ? "success"
              : "unknown",
          fields,
        });
      }
    }
  }

  resources.sort((a, b) =>
    a.module === b.module
      ? a.resourceId.localeCompare(b.resourceId)
      : a.module.localeCompare(b.module),
  );
  return resources;
}
