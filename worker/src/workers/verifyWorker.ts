import { claimJob, updateJob, heartbeat, findPendingJobs, getJob } from "../services/cosmosV4.js";
import { popHint, setProgress } from "../services/redisV4.js";
import { blobRead } from "../services/blobV4.js";
import { registerTranslations, type TranslationInput } from "../services/shopifyFetch.js";
import type { TranslationV4Job } from "../services/cosmosV4.js";

const WORKER_ID = `verify-${process.pid}`;

export async function runVerifyWorker(): Promise<void> {
  const claimed = await claimNextJob();
  if (!claimed) return;
  console.log(`[verify] processing job=${claimed.id}`);
  await processVerifyJob(claimed).catch((e) => {
    console.error(`[verify] job ${claimed.id} failed`, e);
  });
}

async function claimNextJob(): Promise<TranslationV4Job | null> {
  const hint = await popHint("verify");
  if (hint) {
    const job = await claimJob(hint.shopName, hint.taskId, "VERIFY_QUEUED", "VERIFYING", WORKER_ID);
    if (job) return job;
  }
  const candidates = await findPendingJobs("VERIFY_QUEUED", 3);
  for (const candidate of candidates) {
    const job = await claimJob(candidate.shopName, candidate.id, "VERIFY_QUEUED", "VERIFYING", WORKER_ID);
    if (job) return job;
  }
  return null;
}

type FailedResource = {
  resourceId: string;
  translations: TranslationInput[];
};

async function processVerifyJob(job: TranslationV4Job): Promise<void> {
  const { shopName, id: jobId } = job;
  const blobPrefix = job.blobPrefix || `tasks/v4/${shopName}/${jobId}`;
  const failedPath = `${blobPrefix}/writeback/failed.json`;

  const failedResources = (await blobRead<FailedResource[]>(failedPath)) ?? [];
  const verifyTotal = failedResources.length;
  let verifyDone = 0;
  let verifyFailed = 0;

  await setProgress(jobId, { verifyTotal, verifyDone, verifyFailed, currentModule: "VERIFY" });

  try {
    for (const resource of failedResources) {
      await heartbeat(shopName, jobId);

      const result = await registerTranslations(
        shopName,
        job.shopifyAccessToken,
        resource.resourceId,
        resource.translations,
      );

      if (result.success) {
        verifyDone++;
      } else {
        verifyFailed++;
        console.warn(`[verify] resource ${resource.resourceId} still failing:`, result.userErrors);
      }

      await setProgress(jobId, { verifyDone, verifyFailed, verifyTotal });
    }

    const latestJob = await getJob(shopName, jobId);
    await updateJob(shopName, jobId, {
      status: "COMPLETED",
      claimedBy: null,
      metrics: {
        ...(latestJob?.metrics ?? job.metrics),
        verifyTotal,
        verifyDone,
        verifyFailed,
      },
    });

    console.log(`[verify] done job=${jobId} recovered=${verifyDone} stillFailed=${verifyFailed}`);
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    await updateJob(shopName, jobId, {
      status: "FAILED",
      errorMessage,
      errorStage: "VERIFY",
      claimedBy: null,
    });
    console.error(`[verify] failed job=${jobId}`, e);
  }
}
