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

/** 查询脚本默认只扫产品 + 元字段模块。 */
export const DEFAULT_HTML_SCAN_MODULES = ["PRODUCT", "METAFIELD"];

async function parallelMap(items, concurrency, fn) {
  if (items.length === 0) return [];
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const idx = next++;
      try {
        results[idx] = await fn(items[idx], idx);
      } catch (err) {
        results[idx] = { __error: err };
      }
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

function resolveModules(job, opts) {
  const allow = opts.modules?.length
    ? opts.modules
    : opts.moduleFilter
      ? [opts.moduleFilter]
      : DEFAULT_HTML_SCAN_MODULES;
  const jobModules = job.modules ?? [];
  return jobModules.filter((m) => allow.includes(m));
}

function recordIoError(result, context, err) {
  const message = String(err?.message ?? err);
  result.errors.push({ ...context, message });
}

/**
 * 扫描单个任务 Blob，查找属性占位符泄漏。
 * 单资源 / 单模块 IO 失败会记录并继续，不中断整次扫描。
 */
export async function scanJobAttrLeaks(blobContainer, job, opts = {}) {
  const maxHits = opts.maxHits ?? 0;
  const readConcurrency = opts.readConcurrency ?? 8;
  const onProgress = opts.onProgress;

  const result = {
    jobId: job.id,
    shopName: job.shopName,
    source: job.source,
    target: job.target,
    status: job.status,
    createdAt: job.createdAt ?? null,
    modulesScanned: [],
    resourcesScanned: 0,
    fieldsWithHtmlLeak: 0,
    fieldsWithAttrLeak: 0,
    hits: [],
    errors: [],
    skipped: false,
    skipReason: "",
    partial: false,
  };

  if (!job?.blobPrefix) {
    result.skipped = true;
    result.skipReason = "无 blobPrefix";
    return result;
  }

  const modules = resolveModules(job, opts);
  result.modulesScanned = modules;

  if (modules.length === 0) {
    result.skipped = true;
    result.skipReason = "任务无 PRODUCT/METAFIELD 模块";
    return result;
  }

  const pushHit = (hit) => {
    result.fieldsWithAttrLeak++;
    if (maxHits <= 0 || result.hits.length < maxHits) {
      result.hits.push(hit);
    }
  };

  const done = () => maxHits > 0 && result.hits.length >= maxHits;

  const emit = (extra) => {
    onProgress?.({
      jobId: job.id,
      shopName: job.shopName,
      target: job.target,
      resourcesScanned: result.resourcesScanned,
      fieldsWithHtmlLeak: result.fieldsWithHtmlLeak,
      fieldsWithAttrLeak: result.fieldsWithAttrLeak,
      errors: result.errors.length,
      ...extra,
    });
  };

  const scanResource = (resource, module) => {
    if (!resource || resource.__error) return;
    result.resourcesScanned++;
    const resourceId = resource.resourceId ?? "(unknown)";
    if (!Array.isArray(resource.translations)) return;

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
  };

  for (const module of modules) {
    if (done()) break;

    let resourcePaths = [];
    try {
      const resourcePrefix = `${job.blobPrefix}/translate/${module}/resources/`;
      resourcePaths = (await blobListPaths(blobContainer, resourcePrefix))
        .filter((p) => p.endsWith(".json"))
        .sort();
    } catch (err) {
      result.partial = true;
      recordIoError(result, { module, phase: "list-resources" }, err);
      console.warn(
        `    [WARN] 列出 ${module} 资源失败，跳过该模块: ${String(err?.message ?? err).slice(0, 100)}`,
      );
      continue;
    }

    emit({
      phase: "module",
      module,
      layout: "resources",
      resourceTotal: resourcePaths.length,
      resourceDone: 0,
    });

    if (resourcePaths.length > 0) {
      const batchSize = readConcurrency;
      for (let i = 0; i < resourcePaths.length; i += batchSize) {
        if (done()) break;
        const batch = resourcePaths.slice(i, i + batchSize);
        const resources = await parallelMap(batch, batchSize, async (path) => {
          try {
            return await blobReadJson(blobContainer, path);
          } catch (err) {
            result.partial = true;
            recordIoError(result, { module, phase: "read-resource", path }, err);
            return { __error: err };
          }
        });

        for (let ri = 0; ri < resources.length; ri++) {
          const resource = resources[ri];
          if (resource?.__error) {
            console.warn(
              `    [WARN] 读取失败，跳过: ${batch[ri]?.split("/").slice(-1)[0] ?? "?"}`,
            );
            continue;
          }
          scanResource(resource, module);
          if (done()) break;
        }

        emit({
          phase: "module",
          module,
          layout: "resources",
          resourceTotal: resourcePaths.length,
          resourceDone: Math.min(i + batch.length, resourcePaths.length),
        });
      }
      continue;
    }

    let chunkPaths = [];
    try {
      chunkPaths = (await blobListPaths(blobContainer, `${job.blobPrefix}/translate/${module}/`))
        .filter((p) => p.endsWith(".json") && !p.includes("/resources/"))
        .sort();
    } catch (err) {
      result.partial = true;
      recordIoError(result, { module, phase: "list-chunks" }, err);
      console.warn(
        `    [WARN] 列出 ${module} 分片失败，跳过该模块: ${String(err?.message ?? err).slice(0, 100)}`,
      );
      continue;
    }

    emit({
      phase: "module",
      module,
      layout: "chunks",
      chunkTotal: chunkPaths.length,
      chunkDone: 0,
      resourceTotal: 0,
      resourceDone: 0,
    });

    for (let ci = 0; ci < chunkPaths.length; ci++) {
      if (done()) break;
      const path = chunkPaths[ci];
      let chunk;
      try {
        chunk = await blobReadJson(blobContainer, path);
      } catch (err) {
        result.partial = true;
        recordIoError(result, { module, phase: "read-chunk", path }, err);
        console.warn(
          `    [WARN] 分片读取失败，跳过: ${path.split("/").slice(-1)[0] ?? "?"}`,
        );
        emit({
          phase: "module",
          module,
          layout: "chunks",
          chunkTotal: chunkPaths.length,
          chunkDone: ci + 1,
          resourceDone: result.resourcesScanned,
        });
        continue;
      }

      if (!Array.isArray(chunk)) continue;

      for (const resource of chunk) {
        scanResource(resource, module);
        if (done()) break;
      }

      emit({
        phase: "module",
        module,
        layout: "chunks",
        chunkTotal: chunkPaths.length,
        chunkDone: ci + 1,
        resourceDone: result.resourcesScanned,
      });
    }
  }

  emit({ phase: "done" });
  return result;
}
