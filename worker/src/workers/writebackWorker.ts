import { claimJob, updateJob, heartbeat, findPendingJobs, getJob } from "../services/cosmosV4.js";
import { popHint, setProgress } from "../services/redisV4.js";
import { blobRead, blobListPaths, blobWrite } from "../services/blobV4.js";
import { registerTranslations, type TranslationInput } from "../services/shopifyFetch.js";
import type { TranslationV4Job } from "../services/cosmosV4.js";

const WORKER_ID = `writeback-${process.pid}`;

export async function runWritebackWorker(): Promise<void> {
  const claimed = await claimNextJob();
  if (!claimed) return;
  console.log(`[writeback] processing job=${claimed.id}`);
  await processWritebackJob(claimed).catch((e) => {
    console.error(`[writeback] job ${claimed.id} failed`, e);
  });
}

async function claimNextJob(): Promise<TranslationV4Job | null> {
  const hint = await popHint("writeback");
  if (hint) {
    const job = await claimJob(hint.shopName, hint.taskId, "WRITEBACK_QUEUED", "WRITING_BACK", WORKER_ID);
    if (job) return job;
  }
  const candidates = await findPendingJobs("WRITEBACK_QUEUED", 3);
  for (const candidate of candidates) {
    const job = await claimJob(candidate.shopName, candidate.id, "WRITEBACK_QUEUED", "WRITING_BACK", WORKER_ID);
    if (job) return job;
  }
  return null;
}

type TranslatedItem = {
  resourceId: string;
  translations: Array<{
    key: string;
    originalValue: string;
    translatedValue: string;
    digest: string;
  }>;
};

async function processWritebackJob(job: TranslationV4Job): Promise<void> {
  const { shopName, id: jobId, target, isCover } = job;
  const shopDomain = job.shopName;
  const blobPrefix = job.blobPrefix || `tasks/v4/${shopName}/${jobId}`;
  const progressPath = `${blobPrefix}/writeback/progress.json`;

  // Load existing progress for resume support
  const existingProgress = await blobRead<{ written: string[] }>(progressPath);
  const writtenSet = new Set<string>(existingProgress?.written ?? []);

  let writebackDone = writtenSet.size;
  let writebackFailed = 0;
  const writebackTotal = job.metrics.writebackTotal || job.metrics.translateDone;

  try {
    for (const module of job.modules) {
      await heartbeat(shopName, jobId);

      const translatePaths = await blobListPaths(`${blobPrefix}/translate/${module}/`);
      const chunkPaths = translatePaths.filter((p) => p.endsWith(".json"));

      for (const chunkPath of chunkPaths) {
        const chunk = await blobRead<TranslatedItem[]>(chunkPath);
        if (!chunk) continue;

        for (const resource of chunk) {
          if (writtenSet.has(resource.resourceId)) continue;

          await heartbeat(shopName, jobId);

          const translations: TranslationInput[] = resource.translations
            .filter((t) => t.translatedValue?.trim() && t.translatedValue !== t.originalValue)
            .map((t) => ({
              locale: target,
              key: t.key,
              value: t.translatedValue,
              translatableContentDigest: t.digest,
            }));

          if (!translations.length) {
            writtenSet.add(resource.resourceId);
            writebackDone++;
            continue;
          }

          const result = await registerTranslations(
            shopDomain,
            job.shopifyAccessToken,
            resource.resourceId,
            translations,
          );

          if (result.success) {
            writtenSet.add(resource.resourceId);
            writebackDone++;
          } else {
            writebackFailed++;
            console.warn(`[writeback] resource ${resource.resourceId} errors:`, result.userErrors);
          }

          // Persist progress periodically for resume support
          if ((writebackDone + writebackFailed) % 20 === 0) {
            await blobWrite(progressPath, { written: [...writtenSet] });
          }

          await setProgress(jobId, {
            writebackDone,
            writebackFailed,
            writebackTotal,
            currentModule: module,
          });
        }
      }
    }

    // Final progress persist
    await blobWrite(progressPath, { written: [...writtenSet] });

    const latestJob = await getJob(shopName, jobId);
    await updateJob(shopName, jobId, {
      status: "COMPLETED",
      claimedBy: null,
      metrics: {
        ...(latestJob?.metrics ?? job.metrics),
        writebackDone,
        writebackFailed,
      },
    });

    console.log(`[writeback] done job=${jobId} written=${writebackDone} failed=${writebackFailed}`);
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    await updateJob(shopName, jobId, {
      status: "FAILED",
      errorMessage,
      errorStage: "WRITEBACK",
      claimedBy: null,
    });
    console.error(`[writeback] failed job=${jobId}`, e);
  }
}
