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
export async function listTranslatedResourceIds(
  blobPrefix: string,
  module: string,
): Promise<Set<string>> {
  const prefix = `${blobPrefix}/translate/${module}/${RESOURCES_DIR}/`;
  const paths = await blobListPaths(prefix);
  const ids = new Set<string>();
  for (const path of paths) {
    if (!path.endsWith(".json")) continue;
    const item = await blobRead<TranslatedResourceItem>(path);
    if (item?.resourceId) ids.add(item.resourceId);
  }
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

  const resourcePrefix = `${blobPrefix}/translate/${module}/${RESOURCES_DIR}/`;
  for (const path of await blobListPaths(resourcePrefix)) {
    if (!path.endsWith(".json")) continue;
    const item = await blobRead<TranslatedResourceItem>(path);
    if (item?.resourceId) byId.set(item.resourceId, item);
  }

  const modulePrefix = `${blobPrefix}/translate/${module}/`;
  for (const path of await blobListPaths(modulePrefix)) {
    if (!isLegacyChunkPath(path)) continue;
    const chunk = await blobRead<TranslatedResourceItem[]>(path);
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
