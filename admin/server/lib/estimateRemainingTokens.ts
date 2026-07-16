import { blobListPaths, blobRead } from "./blob.js";
import { estimateTokens } from "./tokenEstimate.js";

export type BlobTranslatedField = {
  key?: string;
  originalValue?: string;
  translatedValue?: string;
  status?: string;
};

export type BlobTranslatedResource = {
  resourceId?: string;
  translations?: BlobTranslatedField[];
};

export type RemainingTokenJobEstimate = {
  jobId: string;
  shopName: string;
  source: string;
  target: string;
  status: string;
  blobPrefix: string | null;
  estimatedTokens: number;
  pendingFields: number;
  scannedResources: number;
  scannedBlobs: number;
  note?: string;
};

function isUntranslated(field: BlobTranslatedField): boolean {
  return !String(field.translatedValue ?? "").trim();
}

function accumulateResource(
  resource: BlobTranslatedResource,
  acc: { tokens: number; pendingFields: number; scannedResources: number },
): void {
  const fields = Array.isArray(resource.translations) ? resource.translations : [];
  acc.scannedResources += 1;
  for (const field of fields) {
    if (!isUntranslated(field)) continue;
    const original = String(field.originalValue ?? "").trim();
    if (!original) continue;
    acc.tokens += estimateTokens(original);
    acc.pendingFields += 1;
  }
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await mapper(items[i]!);
    }
  });
  await Promise.all(workers);
  return results;
}

/** 收集某任务某模块下 translate blob 路径（逐资源优先，否则旧版 chunk）。 */
async function listTranslateBlobPaths(
  blobPrefix: string,
  module: string,
): Promise<string[]> {
  const resourcePrefix = `${blobPrefix}/translate/${module}/resources/`;
  const resourcePaths = (await blobListPaths(resourcePrefix))
    .filter((p) => p.endsWith(".json"))
    .sort();
  if (resourcePaths.length > 0) return resourcePaths;

  return (await blobListPaths(`${blobPrefix}/translate/${module}/`))
    .filter((p) => p.endsWith(".json") && !p.includes("/resources/"))
    .sort();
}

async function estimateJobFromBlob(params: {
  jobId: string;
  shopName: string;
  source: string;
  target: string;
  status: string;
  modules: string[];
  blobPrefix?: string | null;
}): Promise<RemainingTokenJobEstimate> {
  const base: RemainingTokenJobEstimate = {
    jobId: params.jobId,
    shopName: params.shopName,
    source: params.source,
    target: params.target,
    status: params.status,
    blobPrefix: params.blobPrefix ?? null,
    estimatedTokens: 0,
    pendingFields: 0,
    scannedResources: 0,
    scannedBlobs: 0,
  };

  const blobPrefix = params.blobPrefix?.trim();
  if (!blobPrefix) {
    return { ...base, note: "该任务无 blobPrefix（可能为旧任务）" };
  }

  const modules = params.modules ?? [];
  if (modules.length === 0) {
    return { ...base, note: "该任务无模块列表" };
  }

  const allPaths: string[] = [];
  for (const module of modules) {
    allPaths.push(...(await listTranslateBlobPaths(blobPrefix, module)));
  }

  if (allPaths.length === 0) {
    return {
      ...base,
      note: "Blob 中未找到 translate 内容（可能尚未初始化写盘）",
    };
  }

  const acc = { tokens: 0, pendingFields: 0, scannedResources: 0, readBlobs: 0 };
  await mapPool(allPaths, 8, async (path) => {
    const raw = await blobRead<BlobTranslatedResource | BlobTranslatedResource[]>(path);
    if (!raw) return;
    acc.readBlobs += 1;
    if (Array.isArray(raw)) {
      for (const resource of raw) accumulateResource(resource, acc);
    } else {
      accumulateResource(raw, acc);
    }
  });

  return {
    ...base,
    estimatedTokens: acc.tokens,
    pendingFields: acc.pendingFields,
    scannedResources: acc.scannedResources,
    scannedBlobs: acc.readBlobs,
    note:
      acc.readBlobs < allPaths.length
        ? `列出 ${allPaths.length} 个 blob，成功读取 ${acc.readBlobs} 个`
        : undefined,
  };
}

export async function estimateRemainingTokensForJobs(
  jobs: Array<{
    id: string;
    shopName: string;
    source: string;
    target: string;
    status: string;
    modules: string[];
    blobPrefix?: string | null;
  }>,
): Promise<RemainingTokenJobEstimate[]> {
  const out: RemainingTokenJobEstimate[] = [];
  // 任务串行，避免一次扫多个大店把 Blob 打满；单任务内 blob 已有并发。
  for (const job of jobs) {
    out.push(
      await estimateJobFromBlob({
        jobId: job.id,
        shopName: job.shopName,
        source: job.source,
        target: job.target,
        status: job.status,
        modules: job.modules,
        blobPrefix: job.blobPrefix,
      }),
    );
  }
  return out;
}
