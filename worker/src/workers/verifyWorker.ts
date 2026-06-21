import { hostname } from "os";
import { claimJob, updateJob, heartbeat, findPendingJobs, getJob, withStageTiming, prefersStoredToken } from "../services/cosmosV4.js";
import { popHint, setProgress, setItemsCount } from "../services/redisV4.js";
import { computeModuleCount } from "../services/itemsCount.js";
import { blobRead } from "../services/blobV4.js";
import { loadTranslatedItemsForJob } from "../services/translateBlobIO.js";
import {
  registerTranslations,
  fetchResourceTranslations,
  diffResourceTranslations,
  type TranslationInput,
} from "../services/shopifyFetch.js";
import { filterWritebackFields } from "../services/writebackFields.js";
import { QpsLogger } from "../services/qpsLogger.js";
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
  return filterWritebackFields(resource.translations).map((t) => ({
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

  for (const { resource } of await loadTranslatedItemsForJob(blobPrefix, job.modules)) {
    if (byId.has(resource.resourceId)) continue;
    if (!writtenIds.has(resource.resourceId)) continue;
    const translations = toTranslationInputs(resource, target);
    if (translations.length > 0) {
      byId.set(resource.resourceId, translations);
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

  const stageStartedAt = new Date().toISOString(); // ISO span start for stageTimings
  const qps = new QpsLogger(jobId, shopName, "VERIFY");

  try {
    for (const { resourceId, translations } of targets) {
      await heartbeat(shopName, jobId);

      let mismatches = diffResourceTranslations(
        translations,
        await fetchResourceTranslations(shopName, job.shopifyAccessToken, resourceId, target, prefersStoredToken(job)),
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
          prefersStoredToken(job),
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
          await fetchResourceTranslations(shopName, job.shopifyAccessToken, resourceId, target, prefersStoredToken(job)),
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
    const mergedMetrics = {
      ...(latestJob?.metrics ?? job.metrics),
      verifyTotal,
      verifyDone,
      verifyFailed,
    };
    const wroteAnything =
      (mergedMetrics.writebackDone ?? 0) > 0 || verifyDone > 0;
    await updateJob(shopName, jobId, {
      status: wroteAnything ? "COMPLETED" : "FAILED",
      errorStage: wroteAnything ? undefined : "WRITEBACK",
      errorMessage: wroteAnything
        ? undefined
        : "写回未成功：全部资源均未写入 Shopify（请查看 worker 日志或写回详情）",
      claimedBy: null,
      stageTimings: withStageTiming(
        latestJob?.stageTimings ?? job.stageTimings,
        "VERIFY",
        stageStartedAt,
        new Date().toISOString(),
      ),
      metrics: mergedMetrics,
    });

    // 任务完成后刷新汇总页统计缓存（TsFrontend 专用，TSF 汇总页直接读）。非致命。
    if (prefersStoredToken(job) && job.shopifyAccessToken) {
      for (const module of job.modules) {
        try {
          const count = await computeModuleCount(
            shopName,
            job.shopifyAccessToken,
            module,
            job.target,
          );
          await setItemsCount(shopName, job.target, module, count);
          console.log(
            `[verify] items_count job=${jobId} ${module} ${count.translated}/${count.total} stored`,
          );
        } catch (e) {
          console.error(`[verify] items_count job=${jobId} ${module} failed:`, e);
        }
      }
    }

    console.log(`[verify] done job=${jobId} verified=${verifyDone} failed=${verifyFailed}`);
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    await updateJob(shopName, jobId, {
      status: "FAILED",
      errorMessage,
      errorStage: "VERIFY",
      claimedBy: null,
      stageTimings: withStageTiming(job.stageTimings, "VERIFY", stageStartedAt, new Date().toISOString()),
    });
    console.error(`[verify] failed job=${jobId}`, e);
  } finally {
    qps.stop();
  }
}
