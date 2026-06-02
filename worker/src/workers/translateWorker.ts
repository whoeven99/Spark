import { claimJob, updateJob, heartbeat, findPendingJobs, getJob } from "../services/cosmosV4.js";
import { popHint, pushHint, setProgress } from "../services/redisV4.js";
import { blobRead, blobWrite, blobListPaths } from "../services/blobV4.js";
import {
  translateResources,
  resolveEngine,
  mergeEngineUsage,
  countFieldUnits,
  type EngineUsage,
  type TranslateItem,
} from "../services/llmTranslate.js";

const HEARTBEAT_THROTTLE_MS = 30_000;
import type { TranslationV4Job } from "../services/cosmosV4.js";

const WORKER_ID = `translate-${process.pid}`;

export async function runTranslateWorker(): Promise<void> {
  const claimed = await claimNextJob();
  if (!claimed) return;
  console.log(`[translate] processing job=${claimed.id} testMode=${claimed.testMode}`);
  await processTranslateJob(claimed).catch((e) => {
    console.error(`[translate] job ${claimed.id} failed`, e);
  });
}

async function claimNextJob(): Promise<TranslationV4Job | null> {
  const hint = await popHint("translate");
  if (hint) {
    const job = await claimJob(hint.shopName, hint.taskId, "TRANSLATE_QUEUED", "TRANSLATING", WORKER_ID);
    if (job) return job;
  }
  const candidates = await findPendingJobs("TRANSLATE_QUEUED", 3);
  for (const candidate of candidates) {
    const job = await claimJob(candidate.shopName, candidate.id, "TRANSLATE_QUEUED", "TRANSLATING", WORKER_ID);
    if (job) return job;
  }
  return null;
}

async function processTranslateJob(job: TranslationV4Job): Promise<void> {
  const { shopName, id: jobId, source, target, aiModel, testMode } = job;
  // Engine override (TRANSLATION_AI_MODEL) is applied inside translateBatch.
  const blobPrefix = job.blobPrefix || `tasks/v4/${shopName}/${jobId}`;

  let translateDone = 0;
  let translateFailed = 0;
  let translateFallback = 0;
  let translateUnitDone = 0; // node-level progress
  let lastHeartbeatAt = 0;
  // Fields that were translated but fell back to the original value (engine
  // dropped the key / failed). Surfaced to the UI via translate/fallbacks.json.
  const fallbacks: Array<{ resourceId: string; module: string; key: string }> = [];
  const engineUsage: EngineUsage = {};
  const translateTotal = job.metrics.translateTotal || job.metrics.initTotal;
  const translateUnitTotal = job.metrics.translateUnitTotal || 0;

  if (testMode) {
    console.log(`[translate] TEST MODE: using original values as translations`);
  }

  try {
    for (const module of job.modules) {
      await heartbeat(shopName, jobId);

      const initPaths = await blobListPaths(`${blobPrefix}/init/${module}/`);
      const chunkPaths = initPaths.filter((p) => p.endsWith(".json"));
      const chunkTotal = chunkPaths.length;

      for (let ci = 0; ci < chunkPaths.length; ci++) {
        const chunkPath = chunkPaths[ci];
        const chunkIdx = ci + 1; // 1-based for readability
        const chunkStart = performance.now();

        await heartbeat(shopName, jobId);

        // Resume: skip chunks already translated in a prior run
        const translatePath = chunkPath.replace(`${blobPrefix}/init/`, `${blobPrefix}/translate/`);
        const existingTranslated = await blobRead<Array<{ resourceId: string }>>(translatePath);
        if (existingTranslated !== null) {
          translateDone += existingTranslated.length;
          // Re-count this chunk's units so node progress stays consistent on resume.
          const initChunk = await blobRead<Array<{ fields: TranslateItem[] }>>(chunkPath);
          if (initChunk) {
            for (const r of initChunk) for (const f of r.fields) translateUnitDone += countFieldUnits(f.key, f.value);
          }
          console.log(
            `[translate] job=${jobId} module=${module} chunk=${chunkIdx}/${chunkTotal} ` +
              `skip (already translated, ${existingTranslated.length} resources)`,
          );
          await setProgress(jobId, {
            translateDone,
            translateFailed,
            translateUnitDone,
            translateUnitTotal,
            translateTotal,
            currentModule: module,
          });
          continue;
        }

        const chunk = await blobRead<Array<{ resourceId: string; fields: TranslateItem[] }>>(chunkPath);
        if (!chunk) continue;

        const chunkResourceCount = chunk.length;
        const chunkFieldCount = chunk.reduce((sum, r) => sum + (r.fields?.length ?? 0), 0);
        console.log(
          `[translate] job=${jobId} module=${module} chunk=${chunkIdx}/${chunkTotal} ` +
            `resources=${chunkResourceCount} fields=${chunkFieldCount}`,
        );

        const resources = chunk.filter((r) => r.fields?.length);
        const translatedChunk = [];
        try {
          // Per-batch progress: write Redis every batch (cheap, smooth bar) and
          // heartbeat Cosmos throttled (expensive, just keep-alive).
          const onProgress = async (deltaUnits: number) => {
            translateUnitDone += deltaUnits;
            await setProgress(jobId, {
              translateDone,
              translateFailed,
              translateFallback,
              translateUnitDone,
              translateUnitTotal,
              translateTotal,
              currentModule: module,
            });
            const now = Date.now();
            if (now - lastHeartbeatAt > HEARTBEAT_THROTTLE_MS) {
              lastHeartbeatAt = now;
              await heartbeat(shopName, jobId);
            }
          };
          const { resources: perResource, usage } = await translateResources(
            resources.map((r) => ({ resourceId: r.resourceId, fields: r.fields })),
            source,
            target,
            aiModel,
            testMode,
            shopName,
            onProgress,
          );
          mergeEngineUsage(engineUsage, usage);
          for (const { resourceId, results } of perResource) {
            const orig = resources.find((r) => r.resourceId === resourceId);
            translatedChunk.push({
              resourceId,
              translations: results.map((r) => ({
                key: r.key,
                originalValue: orig?.fields.find((f) => f.key === r.key)?.value ?? "",
                translatedValue: r.translatedValue,
                digest: r.digest,
                status: r.status,
              })),
            });
            for (const r of results) {
              if (r.status === "fallback") {
                translateFallback++;
                fallbacks.push({ resourceId, module, key: r.key });
              }
            }
            translateDone++;
          }
        } catch (e) {
          translateFailed += resources.length;
          console.warn(`[translate] chunk ${chunkIdx}/${chunkTotal} failed`, e);
        }

        // Write to translate/ blob
        await blobWrite(translatePath, translatedChunk);

        const chunkElapsed = ((performance.now() - chunkStart) / 1000).toFixed(1);
        console.log(
          `[translate] job=${jobId} module=${module} chunk=${chunkIdx}/${chunkTotal} ` +
            `done translated=${translatedChunk.length} elapsed=${chunkElapsed}s doneSoFar=${translateDone}/${translateTotal}`,
        );

        await setProgress(jobId, {
          translateDone,
          translateFailed,
          translateFallback,
          translateUnitDone,
          translateUnitTotal,
          translateTotal,
          currentModule: module,
        });
      }
    }

    // Persist the list of fields that fell back to original for UI visibility.
    if (fallbacks.length > 0) {
      await blobWrite(`${blobPrefix}/translate/fallbacks.json`, fallbacks);
    }

    // Record the engine actually used (real data — job.aiModel is only the request).
    const engine = testMode
      ? { provider: "test", model: "test" }
      : resolveEngine(aiModel);

    // Refresh job to get latest metrics
    const latestJob = await getJob(shopName, jobId);
    await updateJob(shopName, jobId, {
      status: "WRITEBACK_QUEUED",
      claimedBy: null,
      aiModelUsed: engine.model,
      aiProvider: engine.provider,
      engineUsage,
      metrics: {
        ...(latestJob?.metrics ?? job.metrics),
        translateDone,
        translateFailed,
        translateFallback,
        translateUnitDone,
        translateUnitTotal,
        writebackTotal: translateDone,
      },
    });

    await pushHint("writeback", { taskId: jobId, shopName });
    console.log(
      `[translate] done job=${jobId} done=${translateDone} failed=${translateFailed} fallback=${translateFallback}`,
    );
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    await updateJob(shopName, jobId, {
      status: "FAILED",
      errorMessage,
      errorStage: "TRANSLATE",
      claimedBy: null,
    });
    console.error(`[translate] failed job=${jobId}`, e);
  }
}
