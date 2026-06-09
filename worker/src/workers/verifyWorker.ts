import { hostname } from "os";
import { claimJob, updateJob, heartbeat, findPendingJobs, getJob } from "../services/cosmosV4.js";
import { popHint, setProgress } from "../services/redisV4.js";
import { blobRead, blobListPaths } from "../services/blobV4.js";
import {
  registerTranslations,
  fetchResourceTranslations,
  diffResourceTranslations,
  type TranslationInput,
} from "../services/shopifyFetch.js";
import type { TranslationV4Job } from "../services/cosmosV4.js";

const WORKER_ID = `verify-${process.env.HOSTNAME ?? hostname()}-${process.pid}`;

type TranslatedItem = {
  resourceId: string;
  translations: Array<{
    key: string;
    originalValue: string;
    translatedValue: string;
    digest: string;
  }>;
};

type FailedResource = {
  resourceId: string;
  translations: TranslationInput[];
};

type VerifyTarget = {
  resourceId: string;
  translations: TranslationInput[];
};

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

function toTranslationInputs(
  resource: TranslatedItem,
  targetLocale: string,
): TranslationInput[] {
  return resource.translations
    .filter((t) => t.translatedValue?.trim() && t.translatedValue !== t.originalValue)
    .map((t) => ({
      locale: targetLocale,
      key: t.key,
      value: t.translatedValue,
      translatableContentDigest: t.digest,
    }));
}

async function collectVerifyTargets(job: TranslationV4Job): Promise<VerifyTarget[]> {
  const { shopName, id: jobId, target } = job;
  const blobPrefix = job.blobPrefix || `tasks/v4/${shopName}/${jobId}`;
  const progress = await blobRead<{ written: string[] }>(`${blobPrefix}/writeback/progress.json`);
  const writtenIds = new Set(progress?.written ?? []);
  const failedResources = (await blobRead<FailedResource[]>(`${blobPrefix}/writeback/failed.json`)) ?? [];

  const byId = new Map<string, TranslationInput[]>();

  for (const failed of failedResources) {
    if (failed.translations.length > 0) {
      byId.set(failed.resourceId, failed.translations);
    }
  }

  for (const module of job.modules) {
    const translatePaths = await blobListPaths(`${blobPrefix}/translate/${module}/`);
    const chunkPaths = translatePaths.filter((p) => p.endsWith(".json"));
    for (const chunkPath of chunkPaths) {
      const chunk = await blobRead<TranslatedItem[]>(chunkPath);
      if (!chunk) continue;
      for (const resource of chunk) {
        if (byId.has(resource.resourceId)) continue;
        if (!writtenIds.has(resource.resourceId)) continue;
        const translations = toTranslationInputs(resource, target);
        if (translations.length > 0) {
          byId.set(resource.resourceId, translations);
        }
      }
    }
  }

  return [...byId.entries()].map(([resourceId, translations]) => ({
    resourceId,
    translations,
  }));
}

async function processVerifyJob(job: TranslationV4Job): Promise<void> {
  const { shopName, id: jobId, target } = job;
  const targets = await collectVerifyTargets(job);
  const verifyTotal = targets.length;
  let verifyDone = 0;
  let verifyFailed = 0;

  console.log(`[verify] job=${jobId} targets=${verifyTotal}`);

  await setProgress(jobId, { verifyTotal, verifyDone, verifyFailed, currentModule: "VERIFY" });

  try {
    for (const { resourceId, translations } of targets) {
      await heartbeat(shopName, jobId);

      let mismatches = diffResourceTranslations(
        translations,
        await fetchResourceTranslations(shopName, job.shopifyAccessToken, resourceId, target),
      );

      if (mismatches.length > 0) {
        console.warn(
          `[verify] job=${jobId} resource ${resourceId} read-back mismatch (${mismatches.length} keys), retrying write`,
          mismatches.slice(0, 3).map((m) => m.key),
        );
        const retryKeys = new Set(mismatches.map((m) => m.key));
        const retryPayload = translations.filter((t) => retryKeys.has(t.key));
        const writeResult = await registerTranslations(
          shopName,
          job.shopifyAccessToken,
          resourceId,
          retryPayload,
        );
        if (!writeResult.success) {
          verifyFailed++;
          console.warn(
            `[verify] job=${jobId} resource ${resourceId} retry write failed:`,
            writeResult.userErrors,
          );
          await setProgress(jobId, { verifyDone, verifyFailed, verifyTotal });
          continue;
        }

        mismatches = diffResourceTranslations(
          translations,
          await fetchResourceTranslations(shopName, job.shopifyAccessToken, resourceId, target),
        );
      }

      if (mismatches.length === 0) {
        verifyDone++;
      } else {
        verifyFailed++;
        console.warn(
          `[verify] job=${jobId} resource ${resourceId} still mismatched after retry:`,
          mismatches.slice(0, 5),
        );
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

    console.log(`[verify] done job=${jobId} verified=${verifyDone} failed=${verifyFailed}`);
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
