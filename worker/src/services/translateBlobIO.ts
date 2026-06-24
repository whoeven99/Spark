import { blobExists, blobListPaths, blobRead, blobWrite } from "./blobV4.js";

/** One translated Shopify resource — same shape as a chunk array element. */
export type TranslatedResourceItem = {
  resourceId: string;
  translations: Array<{
    key: string;
    originalValue: string;
    translatedValue: string;
    digest: string;
    status?: "translated" | "fallback";
  }>;
};

const RESOURCES_DIR = "resources";

/** Stable blob file name for a Shopify GID (no path separators). */
export function encodeResourceIdForBlob(resourceId: string): string {
  return Buffer.from(resourceId, "utf8").toString("base64url");
}

export function translatedResourceBlobPath(
  blobPrefix: string,
  module: string,
  resourceId: string,
): string {
  return `${blobPrefix}/translate/${module}/${RESOURCES_DIR}/${encodeResourceIdForBlob(resourceId)}.json`;
}

function isLegacyChunkPath(path: string): boolean {
  return path.endsWith(".json") && !path.includes(`/${RESOURCES_DIR}/`);
}

/** Write one resource checkpoint — idempotent overwrite, safe under parallel workers. */
export async function writeTranslatedResourceBlob(
  blobPrefix: string,
  module: string,
  item: TranslatedResourceItem,
): Promise<void> {
  await blobWrite(translatedResourceBlobPath(blobPrefix, module, item.resourceId), item);
}

export async function readTranslatedResourceBlob(
  blobPrefix: string,
  module: string,
  resourceId: string,
): Promise<TranslatedResourceItem | null> {
  return blobRead<TranslatedResourceItem>(translatedResourceBlobPath(blobPrefix, module, resourceId));
}

/** Resource IDs with incremental checkpoints under a module. */
/** 每资源一个 blob，按资源数量做并发读，避免写回 Phase 1 串行读上千个 blob 卡几分钟。 */
const BLOB_READ_CONCURRENCY = Math.max(
  1,
  Number(process.env.BLOB_READ_CONCURRENCY) || 32,
);

async function mapConcurrent<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.max(1, Math.min(limit, items.length)) },
    async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

export async function listTranslatedResourceIds(
  blobPrefix: string,
  module: string,
): Promise<Set<string>> {
  const prefix = `${blobPrefix}/translate/${module}/${RESOURCES_DIR}/`;
  const paths = (await blobListPaths(prefix)).filter((p) => p.endsWith(".json"));
  const items = await mapConcurrent(paths, BLOB_READ_CONCURRENCY, (path) =>
    blobRead<TranslatedResourceItem>(path),
  );
  const ids = new Set<string>();
  for (const item of items) if (item?.resourceId) ids.add(item.resourceId);
  return ids;
}

/**
 * Load translated resources for one module.
 * Per-resource blobs win over legacy chunk arrays when both exist.
 */
export async function loadTranslatedItemsForModule(
  blobPrefix: string,
  module: string,
): Promise<TranslatedResourceItem[]> {
  const byId = new Map<string, TranslatedResourceItem>();

  // 并发读每资源 blob（数量大，是写回启动慢的主因）。
  const resourcePrefix = `${blobPrefix}/translate/${module}/${RESOURCES_DIR}/`;
  const resPaths = (await blobListPaths(resourcePrefix)).filter((p) => p.endsWith(".json"));
  const resItems = await mapConcurrent(resPaths, BLOB_READ_CONCURRENCY, (path) =>
    blobRead<TranslatedResourceItem>(path),
  );
  for (const item of resItems) if (item?.resourceId) byId.set(item.resourceId, item);

  // 旧版整块 chunk（数量少），同样并发读。
  const modulePrefix = `${blobPrefix}/translate/${module}/`;
  const chunkPaths = (await blobListPaths(modulePrefix)).filter(isLegacyChunkPath);
  const chunks = await mapConcurrent(chunkPaths, BLOB_READ_CONCURRENCY, (path) =>
    blobRead<TranslatedResourceItem[]>(path),
  );
  for (const chunk of chunks) {
    if (!chunk) continue;
    for (const item of chunk) {
      if (item?.resourceId && !byId.has(item.resourceId)) {
        byId.set(item.resourceId, item);
      }
    }
  }

  return [...byId.values()];
}

/** Count durable translated resources across all job modules. */
export async function countTranslatedResources(
  blobPrefix: string,
  modules: string[],
): Promise<number> {
  let total = 0;
  for (const module of modules) {
    total += (await loadTranslatedItemsForModule(blobPrefix, module)).length;
  }
  return total;
}

export async function loadTranslatedItemsForJob(
  blobPrefix: string,
  modules: string[],
): Promise<Array<{ module: string; resource: TranslatedResourceItem }>> {
  const out: Array<{ module: string; resource: TranslatedResourceItem }> = [];
  for (const module of modules) {
    for (const resource of await loadTranslatedItemsForModule(blobPrefix, module)) {
      out.push({ module, resource });
    }
  }
  return out;
}

type InitResource = { resourceId: string; fields: Array<{ key: string; value: string }> };

/**
 * When a chunk fully completes, assemble the legacy chunk-XX.json from
 * per-resource checkpoints (init order preserved).
 */
export async function assembleLegacyChunkBlob(
  blobPrefix: string,
  module: string,
  initChunk: InitResource[],
): Promise<TranslatedResourceItem[]> {
  const chunk: TranslatedResourceItem[] = [];
  for (const initRes of initChunk) {
    const item =
      (await readTranslatedResourceBlob(blobPrefix, module, initRes.resourceId)) ??
      null;
    if (item) chunk.push(item);
  }
  return chunk;
}

/** True when every init resource in the chunk has a checkpoint blob. */
export async function isChunkFullyCheckpointed(
  blobPrefix: string,
  module: string,
  initChunk: InitResource[],
): Promise<boolean> {
  for (const res of initChunk) {
    if (!res.fields?.length) continue;
    if (!(await blobExists(translatedResourceBlobPath(blobPrefix, module, res.resourceId)))) {
      return false;
    }
  }
  return initChunk.some((r) => (r.fields?.length ?? 0) > 0);
}
