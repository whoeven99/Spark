/**
 * 只读扫描：查找 Blob 译文中 alt/title/aria-label 占位符泄漏（不调 Shopify、不写回）。
 */
import {
  hasHtmlPlaceholderLeak,
  isHtmlContent,
  inspectHtmlAttrLeaks,
  formatAttrIssues,
} from "./htmlPlaceholderRepair.mjs";
import { blobListPaths, blobReadJson } from "./translationStorage.mjs";

async function parallelMap(items, concurrency, fn) {
  if (items.length === 0) return [];
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

function isHtmlLeakField(original, translated) {
  if (!original || !translated) return false;
  if (!isHtmlContent(original) && !isHtmlContent(translated)) return false;
  return hasHtmlPlaceholderLeak(translated);
}

/**
 * 扫描单个任务 Blob，查找属性占位符泄漏。
 * @param {{ maxHits?: number, moduleFilter?: string, readConcurrency?: number }} opts
 *   maxHits>0 时凑够命中即提前结束（加速按店发现）。
 */
export async function scanJobAttrLeaks(blobContainer, job, opts = {}) {
  const maxHits = opts.maxHits ?? 0;
  const moduleFilter = opts.moduleFilter ?? "";
  const readConcurrency = opts.readConcurrency ?? 24;

  const result = {
    jobId: job.id,
    shopName: job.shopName,
    source: job.source,
    target: job.target,
    status: job.status,
    createdAt: job.createdAt ?? null,
    resourcesScanned: 0,
    fieldsWithHtmlLeak: 0,
    fieldsWithAttrLeak: 0,
    hits: [],
    skipped: false,
    skipReason: "",
  };

  if (!job?.blobPrefix) {
    result.skipped = true;
    result.skipReason = "无 blobPrefix";
    return result;
  }

  const modules = moduleFilter
    ? (job.modules ?? []).filter((m) => m === moduleFilter)
    : (job.modules ?? []);

  const pushHit = (hit) => {
    result.fieldsWithAttrLeak++;
    if (maxHits <= 0 || result.hits.length < maxHits) {
      result.hits.push(hit);
    }
  };

  const done = () => maxHits > 0 && result.hits.length >= maxHits;

  for (const module of modules) {
    if (done()) break;

    const resourcePrefix = `${job.blobPrefix}/translate/${module}/resources/`;
    const resourcePaths = (await blobListPaths(blobContainer, resourcePrefix))
      .filter((p) => p.endsWith(".json"))
      .sort();

    if (resourcePaths.length > 0) {
      // 分批读取，便于 early-exit
      const batchSize = readConcurrency;
      for (let i = 0; i < resourcePaths.length; i += batchSize) {
        if (done()) break;
        const batch = resourcePaths.slice(i, i + batchSize);
        const resources = await parallelMap(batch, batchSize, async (path) =>
          blobReadJson(blobContainer, path),
        );

        for (const resource of resources) {
          if (!resource) continue;
          result.resourcesScanned++;
          const resourceId = resource.resourceId ?? "(unknown)";
          if (!Array.isArray(resource.translations)) continue;

          for (const field of resource.translations) {
            const { key, originalValue, translatedValue } = field;
            if (!isHtmlLeakField(originalValue, translatedValue)) continue;
            result.fieldsWithHtmlLeak++;

            const inspect = inspectHtmlAttrLeaks(translatedValue);
            if (inspect.ok) continue;

            pushHit({
              resourceId,
              key,
              module,
              issues: inspect.issues,
              summary: formatAttrIssues(inspect.issues),
            });
            if (done()) break;
          }
          if (done()) break;
        }
      }
      continue;
    }

    const chunkPaths = (await blobListPaths(blobContainer, `${job.blobPrefix}/translate/${module}/`))
      .filter((p) => p.endsWith(".json") && !p.includes("/resources/"))
      .sort();

    for (const path of chunkPaths) {
      if (done()) break;
      const chunk = await blobReadJson(blobContainer, path);
      if (!Array.isArray(chunk)) continue;

      for (const resource of chunk) {
        result.resourcesScanned++;
        const resourceId = resource?.resourceId ?? "(unknown)";
        if (!Array.isArray(resource?.translations)) continue;

        for (const field of resource.translations) {
          const { key, originalValue, translatedValue } = field;
          if (!isHtmlLeakField(originalValue, translatedValue)) continue;
          result.fieldsWithHtmlLeak++;

          const inspect = inspectHtmlAttrLeaks(translatedValue);
          if (inspect.ok) continue;

          pushHit({
            resourceId,
            key,
            module,
            issues: inspect.issues,
            summary: formatAttrIssues(inspect.issues),
          });
          if (done()) break;
        }
        if (done()) break;
      }
    }
  }

  return result;
}
