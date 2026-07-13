import { createHash } from "node:crypto";
import {
  hasHtmlPlaceholderLeak,
  isHtmlContent,
  repairHtmlPlaceholderLeaks,
  countPlaceholderLeaks,
  inspectHtmlAttrLeaks,
  formatAttrIssues,
} from "./htmlPlaceholderRepair.mjs";
import { blobListPaths, blobReadJson, blobWriteJson } from "./translationStorage.mjs";
import {
  resolveShopifyAccessToken,
  getShopifyTranslatedValue,
} from "./shopifyTranslationAccess.mjs";

const VALUE_TM_PREFIX = "tm:v5:val";
const MAX_VALUE_CACHE_CHARS = 300;

/** 默认只处理该时刻之前创建的任务（不含当日 0 点起）。 */
export const DEFAULT_JOB_CREATED_BEFORE = "2026-07-08T00:00:00.000Z";

export const COMMON_TM_MODELS = [
  "gpt-4.1-nano",
  "gpt-4.1-mini",
  "deepseek-v4-flash",
  "deepseek-v4-pro",
  "google-translate",
  "deepseek-chat",
  "deepseek-reasoner",
];

function tmValueKey(sourceText, source, target, model) {
  const hash = createHash("sha256")
    .update(`${model}|${source}|${target}|${sourceText}`)
    .digest("hex")
    .slice(0, 32);
  return `${VALUE_TM_PREFIX}:${hash}`;
}

function buildTmResolver({ redis, source, target, models }) {
  const modelList = [...new Set(models.filter(Boolean))];
  return async function resolveTranslation(sourceText) {
    if (!redis || sourceText.length > MAX_VALUE_CACHE_CHARS) return null;
    for (const model of modelList) {
      const byValue = await redis.get(tmValueKey(sourceText, source, target, model));
      if (byValue && !hasHtmlPlaceholderLeak(byValue)) return byValue;
    }
    return null;
  };
}

function isHtmlField(key, original, translated) {
  if (!original || !translated) return false;
  if (!isHtmlContent(original) && !isHtmlContent(translated)) return false;
  return hasHtmlPlaceholderLeak(translated);
}

export function isJobBeforeCutoff(job, cutoffIso = DEFAULT_JOB_CREATED_BEFORE) {
  if (!cutoffIso) return true;
  const createdAt = job?.createdAt;
  if (!createdAt) return false;
  const t = Date.parse(createdAt);
  if (Number.isNaN(t)) return false;
  return t < Date.parse(cutoffIso);
}

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

async function listTranslateWork(blobContainer, blobPrefix, modules, moduleFilter, onLoadProgress) {
  const work = [];
  const mods = moduleFilter ? modules.filter((m) => m === moduleFilter) : modules;

  for (const module of mods) {
    const resourcePrefix = `${blobPrefix}/translate/${module}/resources/`;
    const resourcePaths = (await blobListPaths(blobContainer, resourcePrefix))
      .filter((p) => p.endsWith(".json"))
      .sort();

    if (resourcePaths.length > 0) {
      let loaded = 0;
      await onLoadProgress?.({ phase: "loading", module, listed: resourcePaths.length, loaded: 0 });

      const resources = await parallelMap(resourcePaths, 32, async (path) => {
        const resource = await blobReadJson(blobContainer, path);
        loaded++;
        if (loaded % 50 === 0 || loaded === resourcePaths.length) {
          await onLoadProgress?.({
            phase: "loading",
            module,
            listed: resourcePaths.length,
            loaded,
          });
        }
        return resource ? { module, blobPath: path, resource, legacyChunk: false } : null;
      });

      for (const item of resources) {
        if (item) work.push(item);
      }
      continue;
    }

    const chunkPaths = (await blobListPaths(blobContainer, `${blobPrefix}/translate/${module}/`))
      .filter((p) => p.endsWith(".json") && !p.includes("/resources/"))
      .sort();

    await onLoadProgress?.({ phase: "loading", module, listed: chunkPaths.length, loaded: 0 });

    let chunkLoaded = 0;
    for (const path of chunkPaths) {
      const chunk = await blobReadJson(blobContainer, path);
      chunkLoaded++;
      await onLoadProgress?.({
        phase: "loading",
        module,
        listed: chunkPaths.length,
        loaded: chunkLoaded,
      });
      if (!Array.isArray(chunk)) continue;
      for (const resource of chunk) {
        work.push({ module, blobPath: path, resource, legacyChunk: true, chunkRef: chunk });
      }
    }
  }

  return work;
}

function pushAttrCheck(ctx, record) {
  ctx.progress.attrChecks.push(record);
  if (record.decision === "repair") {
    ctx.progress.attrChecksRepair++;
  } else {
    ctx.progress.attrChecksSkipped++;
  }
}

function logAttrAbnormal({ resourceId, key, side, issues }) {
  const summary = formatAttrIssues(issues);
  console.log(
    `  属性异常 [${side}] resourceId=${resourceId} key=${key} | ${summary || "(无详情)"}`,
  );
}

/**
 * Blob + Shopify 双端属性门禁。
 * @returns {{ allowRepair: boolean, attrCheck: object }}
 */
async function evaluateAttrGate({
  resourceId,
  key,
  module,
  blobHtml,
  shopName,
  targetLocale,
  accessToken,
  shopifyCache,
  tokenSource,
}) {
  const blobInspect = inspectHtmlAttrLeaks(blobHtml);

  if (blobInspect.ok) {
    return {
      allowRepair: false,
      attrCheck: {
        resourceId,
        key,
        module,
        blobStatus: "normal",
        shopifyStatus: "skipped",
        blobIssues: [],
        shopifyIssues: [],
        decision: "skip_blob_normal",
        reason: "Blob 属性无占位符泄漏，整段跳过",
        tokenSource: tokenSource ?? null,
      },
    };
  }

  logAttrAbnormal({
    resourceId,
    key,
    side: "Blob",
    issues: blobInspect.issues,
  });

  if (!accessToken) {
    return {
      allowRepair: false,
      attrCheck: {
        resourceId,
        key,
        module,
        blobStatus: "abnormal",
        shopifyStatus: "unavailable",
        blobIssues: blobInspect.issues,
        shopifyIssues: [],
        decision: "skip_shopify_unavailable",
        reason: "Blob 属性异常，但无 Shopify accessToken，无法对照现网，跳过替换",
        tokenSource: null,
      },
    };
  }

  try {
    const live = await getShopifyTranslatedValue({
      shopName,
      accessToken,
      resourceId,
      locale: targetLocale,
      key,
      cache: shopifyCache,
    });

    if (!live.found || live.value == null) {
      // 现网无该字段译文 → 无可保护的好数据，视为异常，允许替换
      console.log(
        `  属性异常 [Shopify] resourceId=${resourceId} key=${key} | 现网无此字段译文`,
      );
      return {
        allowRepair: true,
        attrCheck: {
          resourceId,
          key,
          module,
          blobStatus: "abnormal",
          shopifyStatus: "abnormal",
          blobIssues: blobInspect.issues,
          shopifyIssues: [{ attr: "(missing)", tag: "-", value: "(现网无译文)" }],
          decision: "repair",
          reason: "Blob 与 Shopify 均异常（现网缺译文），允许替换",
          tokenSource,
        },
      };
    }

    const shopifyInspect = inspectHtmlAttrLeaks(live.value);
    if (shopifyInspect.ok) {
      console.log(
        `  跳过替换 resourceId=${resourceId} key=${key} | Shopify 现网属性正常（避免覆盖）`,
      );
      return {
        allowRepair: false,
        attrCheck: {
          resourceId,
          key,
          module,
          blobStatus: "abnormal",
          shopifyStatus: "normal",
          blobIssues: blobInspect.issues,
          shopifyIssues: [],
          decision: "skip_shopify_normal",
          reason: "Blob 属性异常，但 Shopify 现网属性正常，跳过以免覆盖好数据",
          tokenSource,
        },
      };
    }

    logAttrAbnormal({
      resourceId,
      key,
      side: "Shopify",
      issues: shopifyInspect.issues,
    });

    return {
      allowRepair: true,
      attrCheck: {
        resourceId,
        key,
        module,
        blobStatus: "abnormal",
        shopifyStatus: "abnormal",
        blobIssues: blobInspect.issues,
        shopifyIssues: shopifyInspect.issues,
        decision: "repair",
        reason: "Blob 与 Shopify 现网属性均有占位符泄漏，允许替换",
        tokenSource,
      },
    };
  } catch (err) {
    const message = String(err?.message ?? err);
    return {
      allowRepair: false,
      attrCheck: {
        resourceId,
        key,
        module,
        blobStatus: "abnormal",
        shopifyStatus: "unavailable",
        blobIssues: blobInspect.issues,
        shopifyIssues: [],
        decision: "skip_shopify_unavailable",
        reason: `Blob 属性异常，但 Shopify 现网读取失败（${message}），跳过替换`,
        tokenSource,
      },
    };
  }
}

async function repairResourceFields(resource, ctx) {
  let resourceChanged = false;
  const resourceId = resource?.resourceId ?? "(unknown)";

  if (!Array.isArray(resource?.translations)) {
    return { resourceChanged, resourceId };
  }

  const resolveTranslation = buildTmResolver({
    redis: ctx.redis,
    source: ctx.source,
    target: ctx.target,
    models: ctx.models,
  });

  for (const field of resource.translations) {
    ctx.progress.fieldsScanned++;
    const { key, originalValue, translatedValue, digest } = field;
    if (!isHtmlField(key, originalValue, translatedValue)) continue;

    ctx.progress.fieldsWithLeaks++;
    const beforeFix = translatedValue;
    ctx.progress.placeholdersFound += countPlaceholderLeaks(beforeFix);

    const { allowRepair, attrCheck } = await evaluateAttrGate({
      resourceId,
      key,
      module: ctx.module,
      blobHtml: beforeFix,
      shopName: ctx.shopName,
      targetLocale: ctx.target,
      accessToken: ctx.accessToken,
      shopifyCache: ctx.shopifyCache,
      tokenSource: ctx.tokenSource,
    });
    pushAttrCheck(ctx, {
      ...attrCheck,
      taskId: ctx.taskId,
      shopName: ctx.shopName,
      source: ctx.source,
      target: ctx.target,
      digest: digest ?? "",
    });

    if (!allowRepair) {
      ctx.progress.fieldsSkippedByAttrGate++;
      continue;
    }

    try {
      const result = await repairHtmlPlaceholderLeaks(
        originalValue,
        beforeFix,
        resolveTranslation,
      );

      ctx.progress.cacheHits += result.cacheHits;
      ctx.progress.fallbacks += result.fallbacks;

      if (result.changed) {
        field.translatedValue = result.fixed;
        if (field.status === "translated") field.status = "repaired";
        resourceChanged = true;
        ctx.progress.fieldsFixed++;
        ctx.progress.fixes.push({
          taskId: ctx.taskId,
          shopName: ctx.shopName,
          source: ctx.source,
          target: ctx.target,
          resourceId,
          digest: digest ?? "",
          module: ctx.module,
          key,
          translatedValue: result.fixed,
          leakCount: countPlaceholderLeaks(beforeFix),
          cacheHits: result.cacheHits,
          fallbacks: result.fallbacks,
          attrCheckDecision: attrCheck.decision,
        });
      } else if (result.stillLeaking) {
        ctx.progress.leaks.push({
          resourceId,
          module: ctx.module,
          key,
          blobPath: ctx.blobPath,
          reason: "修复后仍有占位符残留",
          before: beforeFix,
          after: result.fixed ?? beforeFix,
        });
        ctx.progress.errors.push({
          resourceId,
          module: ctx.module,
          key,
          message: "修复后仍有占位符残留",
        });
      } else {
        ctx.progress.leaks.push({
          resourceId,
          module: ctx.module,
          key,
          blobPath: ctx.blobPath,
          reason: "检测到泄漏但内容未变化",
          before: beforeFix,
          after: beforeFix,
        });
      }
    } catch (err) {
      ctx.progress.errors.push({
        resourceId,
        module: ctx.module,
        key,
        message: String(err?.message ?? err),
      });
    }
  }

  return { resourceChanged, resourceId };
}

function validResourceId(id) {
  return typeof id === "string" && id.startsWith("gid://");
}

function createJobProgress(job, apply) {
  return {
    jobId: job.id,
    shop: job.shopName,
    source: job.source,
    target: job.target,
    status: job.status,
    apply,
    phase: "scan",
    totalResources: 0,
    resourcesDone: 0,
    fieldsScanned: 0,
    fieldsWithLeaks: 0,
    fieldsSkippedByAttrGate: 0,
    placeholdersFound: 0,
    fieldsFixed: 0,
    cacheHits: 0,
    fallbacks: 0,
    blobsWritten: 0,
    writebackQueued: false,
    writebackHintPushed: false,
    writebackSkipReason: null,
    attrChecks: [],
    attrChecksRepair: 0,
    attrChecksSkipped: 0,
    tokenSource: null,
    fixes: [],
    leaks: [],
    errors: [],
  };
}

/**
 * 修复单个任务的 Blob 占位符泄漏。
 * @returns {{ progress: object, repairedResourceIds: Set<string>, skipped: boolean, skipReason?: string }}
 */
export async function repairTranslationJob({
  job,
  blobContainer,
  redis,
  apply = false,
  moduleFilter = "",
  resourceLimit = 0,
  models,
  createdBefore = DEFAULT_JOB_CREATED_BEFORE,
  onProgress,
}) {
  if (!job?.blobPrefix) {
    return {
      progress: createJobProgress(job ?? { id: "?", shopName: "?" }, apply),
      repairedResourceIds: new Set(),
      skipped: true,
      skipReason: "无 blobPrefix",
    };
  }

  if (createdBefore && !isJobBeforeCutoff(job, createdBefore)) {
    return {
      progress: createJobProgress(job, apply),
      repairedResourceIds: new Set(),
      skipped: true,
      skipReason: `任务创建时间 ${job.createdAt ?? "(无)"} 不早于截止 ${createdBefore}`,
    };
  }

  const primaryModel = models?.[0] || job.aiModel || COMMON_TM_MODELS[0];
  const modelList = [...new Set([primaryModel, ...COMMON_TM_MODELS, ...(models ?? [])])];

  const progress = createJobProgress(job, apply);
  const repairedResourceIds = new Set();
  const shopifyCache = new Map();

  let accessToken = null;
  let tokenSource = null;
  try {
    const resolved = await resolveShopifyAccessToken(job);
    accessToken = resolved.accessToken;
    tokenSource = resolved.source;
    progress.tokenSource = tokenSource;
  } catch (err) {
    console.log(`  Shopify token 解析失败: ${err?.message ?? err}（属性门禁将无法对照现网）`);
  }

  progress.phase = "loading";
  await onProgress?.(progress);

  let workItems = await listTranslateWork(
    blobContainer,
    job.blobPrefix,
    job.modules ?? [],
    moduleFilter,
    async (load) => {
      progress.loadPhase = load;
      await onProgress?.(progress);
    },
  );
  if (resourceLimit > 0) workItems = workItems.slice(0, resourceLimit);

  progress.totalResources = workItems.length;
  progress.phase = "scan";
  delete progress.loadPhase;
  await onProgress?.(progress);

  const legacyChunksToWrite = new Map();

  for (const item of workItems) {
    const { resource, blobPath, module, legacyChunk, chunkRef } = item;

    const { resourceChanged, resourceId } = await repairResourceFields(resource, {
      redis,
      source: job.source,
      target: job.target,
      models: modelList,
      module,
      blobPath,
      taskId: job.id,
      shopName: job.shopName,
      progress,
      accessToken,
      tokenSource,
      shopifyCache,
    });

    if (resourceChanged) {
      if (validResourceId(resourceId)) repairedResourceIds.add(resourceId);
      if (apply) {
        if (legacyChunk && chunkRef) {
          legacyChunksToWrite.set(blobPath, chunkRef);
        } else if (!legacyChunk) {
          await blobWriteJson(blobContainer, blobPath, resource);
          progress.blobsWritten++;
        }
      }
    }

    progress.resourcesDone++;
    await onProgress?.(progress);
  }

  if (apply && legacyChunksToWrite.size > 0) {
    for (const [chunkPath, chunk] of legacyChunksToWrite) {
      await blobWriteJson(blobContainer, chunkPath, chunk);
      progress.blobsWritten++;
    }
  }

  progress.phase = "done";
  await onProgress?.(progress);

  return { progress, repairedResourceIds, skipped: false };
}
