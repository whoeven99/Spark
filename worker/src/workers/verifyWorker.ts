import { hostname } from "os";
import { claimJob, updateJob, heartbeat, findPendingJobs, getJob, withStageTiming, prefersStoredToken } from "../services/cosmosV4.js";
import { popHint, setProgress, setItemsCount } from "../services/redisV4.js";
import { computeModuleCount } from "../services/itemsCount.js";
import { runShopifyAdaptive, getShopifyCap } from "../services/shopifyConcurrency.js";
import { blobRead } from "../services/blobV4.js";
import { loadTranslatedItemsForJob } from "../services/translateBlobIO.js";
import {
  registerTranslations,
  fetchResourceTranslations,
  diffResourceTranslations,
  type TranslationInput,
} from "../services/shopifyFetch.js";
import { filterWritebackFields } from "../services/writebackFields.js";
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

  console.log(`[verify] job=${jobId} concurrency=${getShopifyCap(shopName)}(adaptive)`);

  try {
    // 自适应并发：逐资源读回校验 + 必要时重写；并发随 Shopify throttleStatus 增减。
    await runShopifyAdaptive(shopName, targets, async ({ resourceId, translations }) => {
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
          return;
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
    });

    const latestJob = await getJob(shopName, jobId);
    const mergedMetrics = {
      ...(latestJob?.metrics ?? job.metrics),
      verifyTotal,
      verifyDone,
      verifyFailed,
    };
    const initTotal = mergedMetrics.initTotal ?? job.metrics?.initTotal ?? 0;
    const nothingToTranslate = initTotal === 0 && verifyTotal === 0;
    const wroteAnything =
      nothingToTranslate || (mergedMetrics.writebackDone ?? 0) > 0 || verifyDone > 0;

    // 翻译尚未覆盖全部资源（如额度中途暂停只翻了一部分）：不落 COMPLETED，
    // 停在可续译的 PAUSED —— 前端据此显示「继续」，resume 会回到翻译补译剩余资源。
    const tTotal = mergedMetrics.translateTotal ?? 0;
    const tAttempted =
      (mergedMetrics.translateDone ?? 0) + (mergedMetrics.translateFailed ?? 0);
    const translateIncomplete = wroteAnything && tTotal > 0 && tAttempted < tTotal;
    const finalStatus = translateIncomplete
      ? "PAUSED"
      : wroteAnything
        ? "COMPLETED"
        : "FAILED";

    // 先写 Redis 统计，再落 COMPLETED，便于前端读到最新覆盖率/管理翻译数据。
    if (
      finalStatus === "COMPLETED" &&
      prefersStoredToken(job) &&
      job.shopifyAccessToken
    ) {
      for (const module of job.modules) {
        try {
          const count = await computeModuleCount(
            shopName,
            job.shopifyAccessToken,
            module,
            job.target,
          );
          const stored = await setItemsCount(shopName, job.target, module, count);
          if (stored) {
            console.log(
              `[verify] items_count job=${jobId} ${module} ${count.translated}/${count.total} stored`,
            );
          } else {
            console.warn(
              `[verify] items_count job=${jobId} ${module} ${count.translated}/${count.total} redis unavailable`,
            );
          }
        } catch (e) {
          console.error(`[verify] items_count job=${jobId} ${module} failed:`, e);
        }
      }
    }

    await updateJob(shopName, jobId, {
      status: finalStatus,
      errorStage: translateIncomplete
        ? "TRANSLATE"
        : wroteAnything
          ? undefined
          : "WRITEBACK",
      errorMessage: translateIncomplete
        ? "额度不足，仅翻译并写回了部分资源，补充额度后点击「继续」可翻译剩余内容"
        : wroteAnything
          ? nothingToTranslate
            ? null
            : undefined
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
  }
}
