import { claimJob, updateJob, heartbeat, findPendingJobs, getJob } from "../services/cosmosV4.js";
import { popHint, pushHint, setProgress } from "../services/redisV4.js";
import { blobRead, blobWrite, blobListPaths } from "../services/blobV4.js";
import { translateBatch, type TranslateItem } from "../services/llmTranslate.js";
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
  // Honor environment override for translation engine (TRANSLATION_AI_MODEL)
  const effectiveAiModel = process.env.TRANSLATION_AI_MODEL?.trim() || aiModel;
  const blobPrefix = job.blobPrefix || `tasks/v4/${shopName}/${jobId}`;

  let translateDone = 0;
  let translateFailed = 0;
  const translateTotal = job.metrics.translateTotal || job.metrics.initTotal;

  if (testMode) {
    console.log(`[translate] TEST MODE: using original values as translations`);
  }

  try {
    for (const module of job.modules) {
      await heartbeat(shopName, jobId);

      const initPaths = await blobListPaths(`${blobPrefix}/init/${module}/`);
      const chunkPaths = initPaths.filter((p) => p.endsWith(".json"));

      for (const chunkPath of chunkPaths) {
        await heartbeat(shopName, jobId);

        // Resume: skip chunks already translated in a prior run
        const translatePath = chunkPath.replace(`${blobPrefix}/init/`, `${blobPrefix}/translate/`);
        const existingTranslated = await blobRead<Array<{ resourceId: string }>>(translatePath);
        if (existingTranslated !== null) {
          translateDone += existingTranslated.length;
          await setProgress(jobId, { translateDone, translateFailed, translateTotal, currentModule: module });
          continue;
        }

        const chunk = await blobRead<Array<{ resourceId: string; fields: TranslateItem[] }>>(chunkPath);
        if (!chunk) continue;

        const translatedChunk = [];
        for (const resource of chunk) {
          if (!resource.fields?.length) continue;

          try {
            const results = await translateBatch(resource.fields, source, target, aiModel, testMode);
            translatedChunk.push({
              resourceId: resource.resourceId,
              translations: results.map((r) => ({
                key: r.key,
                originalValue: resource.fields.find((f) => f.key === r.key)?.value ?? "",
                translatedValue: r.translatedValue,
                digest: r.digest,
              })),
            });
            translateDone++;
          } catch (e) {
            translateFailed++;
            console.warn(`[translate] resource ${resource.resourceId} failed`, e);
          }
        }

        // Write to translate/ blob
        await blobWrite(translatePath, translatedChunk);

        await setProgress(jobId, {
          translateDone,
          translateFailed,
          translateTotal,
          currentModule: module,
        });
      }
    }

    // Refresh job to get latest metrics
    const latestJob = await getJob(shopName, jobId);
    await updateJob(shopName, jobId, {
      status: "WRITEBACK_QUEUED",
      claimedBy: null,
      metrics: {
        ...(latestJob?.metrics ?? job.metrics),
        translateDone,
        translateFailed,
        writebackTotal: translateDone,
      },
    });

    await pushHint("writeback", { taskId: jobId, shopName });
    console.log(`[translate] done job=${jobId} done=${translateDone} failed=${translateFailed}`);
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
