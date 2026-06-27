import { hostname } from "os";
import { claimJob, updateJob, heartbeat, findPendingJobs, getJob, withStageTiming, prefersStoredToken } from "../services/cosmosV4.js";
import { popHint, setProgress } from "../services/redisV4.js";
import { blobRead, blobWrite } from "../services/blobV4.js";
import { loadTranslatedItemsForJob } from "../services/translateBlobIO.js";
import { registerTranslations, type TranslationInput } from "../services/shopifyFetch.js";
import { filterWritebackFields } from "../services/writebackFields.js";
import { runShopifyAdaptive, getShopifyCap } from "../services/shopifyConcurrency.js";
import { QpsLogger } from "../services/qpsLogger.js";
import type { TranslationV4Job } from "../services/cosmosV4.js";
import { isShuttingDown } from "../shutdown.js";
import { finalizeJobAfterWriteback } from "../services/finalizeJobAfterWriteback.js";

/**
 * Scale-out safe: hostname + pid is unique across containers even when every
 * container's Node process starts at pid 1.
 */
const WORKER_ID = `writeback-${process.env.HOSTNAME ?? hostname()}-${process.pid}`;

const HEARTBEAT_THROTTLE_MS = 30_000;

export async function runWritebackWorker(): Promise<void> {
  if (isShuttingDown()) return;
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
    const job = await claimJob(
      hint.shopName,
      hint.taskId,
      "WRITEBACK_QUEUED",
      "WRITING_BACK",
      WORKER_ID,
    );
    if (job) return job;
    // Hint was stale (job already claimed by another worker) — fall through.
  }
  const candidates = await findPendingJobs("WRITEBACK_QUEUED", 3);
  for (const candidate of candidates) {
    const job = await claimJob(
      candidate.shopName,
      candidate.id,
      "WRITEBACK_QUEUED",
      "WRITING_BACK",
      WORKER_ID,
    );
    // claimJob uses CosmosDB etag: only one worker across all scaled-out
    // instances will win; the rest get null and skip to the next candidate.
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

type FailedResource = {
  resourceId: string;
  translations: TranslationInput[];
};

type PendingResource = {
  resource: TranslatedItem;
  module: string;
};

async function persistWritebackCheckpoint(
  jobId: string,
  progressPath: string,
  writtenSet: Set<string>,
  writebackDone: number,
  writebackFailed: number,
  writebackTotal: number,
  currentModule?: string,
): Promise<void> {
  await blobWrite(progressPath, { written: [...writtenSet] });
  await setProgress(jobId, {
    writebackDone,
    writebackFailed,
    writebackTotal,
    ...(currentModule ? { currentModule } : {}),
  });
}

async function processWritebackJob(job: TranslationV4Job): Promise<void> {
  const { shopName, id: jobId, target } = job;
  const shopDomain = job.shopName;
  const blobPrefix = job.blobPrefix || `tasks/v4/${shopName}/${jobId}`;
  const progressPath = `${blobPrefix}/writeback/progress.json`;
  const failedPath = `${blobPrefix}/writeback/failed.json`;

  // Load existing progress for resume support (idempotent re-entry after crash)
  const existingProgress = await blobRead<{ written: string[] }>(progressPath);
  const writtenSet = new Set<string>(existingProgress?.written ?? []);

  // JS is single-threaded: these counters are mutated synchronously between
  // await points — safe to share across pAll callbacks without a mutex.
  let writebackDone = writtenSet.size;
  let writebackFailed = 0;
  const writebackTotal = job.metrics.writebackTotal || job.metrics.translateDone;
  const failedResources: FailedResource[] = [];
  let lastHeartbeatAt = 0;
  const stageStartedAt = new Date().toISOString(); // ISO span start for stageTimings
  const qps = new QpsLogger(jobId, shopName, "WRITEBACK");

  const maybeHeartbeat = async () => {
    const now = Date.now();
    if (now - lastHeartbeatAt > HEARTBEAT_THROTTLE_MS) {
      lastHeartbeatAt = now;
      await heartbeat(shopName, jobId);
    }
  };

  try {
    // ── Phase 1: Collect all pending resources ────────────────────────────────
    await heartbeat(shopName, jobId);
    const pendingResources: PendingResource[] = [];
    const allItems = await loadTranslatedItemsForJob(blobPrefix, job.modules, {
      onModuleLoaded: async () => {
        if (isShuttingDown()) return;
        await maybeHeartbeat();
      },
    });
    if (isShuttingDown()) {
      await persistWritebackCheckpoint(
        jobId,
        progressPath,
        writtenSet,
        writebackDone,
        writebackFailed,
        writebackTotal,
      );
      console.log(`[writeback] job=${jobId} yielding for shutdown (after blob load)`);
      return;
    }
    for (const { module, resource } of allItems) {
      if (!writtenSet.has(resource.resourceId)) {
        pendingResources.push({ resource, module });
      }
    }

    console.log(
      `[writeback] job=${jobId} pending=${pendingResources.length} concurrency=${getShopifyCap(shopDomain)}(adaptive)`,
    );

    // ── Phase 2: Adaptive parallel writeback ──────────────────────────────────
    let shutdownYield = false;
    await runShopifyAdaptive(shopDomain, pendingResources, async ({ resource, module }) => {
      if (isShuttingDown()) {
        shutdownYield = true;
        return;
      }

      await maybeHeartbeat();

      const translations: TranslationInput[] = filterWritebackFields(resource.translations)
        .map((t) => ({
          locale: target,
          key: t.key,
          value: t.translatedValue,
          translatableContentDigest: t.digest,
        }));

      // Nothing to write for this resource (all fields unchanged / empty)
      if (!translations.length) {
        writtenSet.add(resource.resourceId);
        writebackDone++;
        await setProgress(jobId, {
          writebackDone,
          writebackFailed,
          writebackTotal,
          currentModule: module,
        });
        return;
      }

      const result = await registerTranslations(
        shopDomain,
        job.shopifyAccessToken,
        resource.resourceId,
        translations,
        prefersStoredToken(job),
      );

      if (result.success) {
        writtenSet.add(resource.resourceId);
        writebackDone++;
      } else {
        writebackFailed++;
        failedResources.push({ resourceId: resource.resourceId, translations });
        console.warn(
          `[writeback] resource ${resource.resourceId} errors:`,
          result.userErrors,
        );
      }

      if ((writebackDone + writebackFailed) % 20 === 0) {
        await blobWrite(progressPath, { written: [...writtenSet] });
      }

      await setProgress(jobId, {
        writebackDone,
        writebackFailed,
        writebackTotal,
        currentModule: module,
      });
    });

    if (shutdownYield || isShuttingDown()) {
      await persistWritebackCheckpoint(
        jobId,
        progressPath,
        writtenSet,
        writebackDone,
        writebackFailed,
        writebackTotal,
      );
      console.log(
        `[writeback] job=${jobId} yielding for shutdown written=${writebackDone}/${writebackTotal}`,
      );
      return;
    }

    // ── Phase 3: Finalise ─────────────────────────────────────────────────────
    await blobWrite(progressPath, { written: [...writtenSet] });

    const latestJob = await getJob(shopName, jobId);
    const updatedMetrics = {
      ...(latestJob?.metrics ?? job.metrics),
      writebackDone,
      writebackFailed,
    };

    await blobWrite(failedPath, failedResources);

    const writebackTiming = withStageTiming(
      latestJob?.stageTimings ?? job.stageTimings,
      "WRITEBACK",
      stageStartedAt,
      new Date().toISOString(),
    );

    // 本次写回是「暂停/取消时先写回已翻译」触发的 → 写回完成后据意图收尾。
    const pauseIntent = latestJob?.pauseAfterWriteback ?? job.pauseAfterWriteback;
    if (pauseIntent === "pause" || pauseIntent === "cancel") {
      await updateJob(shopName, jobId, {
        status: pauseIntent === "cancel" ? "CANCELLED" : "PAUSED",
        claimedBy: null,
        // pause：errorStage=TRANSLATE，resume 时重新入队翻译续译剩余资源。
        errorStage: pauseIntent === "pause" ? "TRANSLATE" : null,
        errorMessage:
          pauseIntent === "pause"
            ? (latestJob?.errorMessage ?? job.errorMessage)
            : null,
        pauseAfterWriteback: null, // 消费意图
        stageTimings: writebackTiming,
        metrics: updatedMetrics,
      });
      console.log(
        `[writeback] done job=${jobId} written=${writebackDone} failed=${writebackFailed} → ${pauseIntent === "cancel" ? "CANCELLED" : "PAUSED"}（暂停/取消时已写回已翻译）`,
      );
      return;
    }

    await finalizeJobAfterWriteback(job, {
      writebackDone,
      writebackFailed,
      metrics: updatedMetrics,
      stageTimings: writebackTiming,
    });
    console.log(
      `[writeback] done job=${jobId} written=${writebackDone} failed=${writebackFailed} → finalized`,
    );
  } catch (e) {
    if (isShuttingDown()) {
      await persistWritebackCheckpoint(
        jobId,
        progressPath,
        writtenSet,
        writebackDone,
        writebackFailed,
        writebackTotal,
      ).catch(() => {});
      console.log(`[writeback] job=${jobId} yielding for shutdown (error path)`);
      return;
    }
    const errorMessage = e instanceof Error ? e.message : String(e);
    await updateJob(shopName, jobId, {
      status: "FAILED",
      errorMessage,
      errorStage: "WRITEBACK",
      claimedBy: null,
      pauseAfterWriteback: null, // 清掉暂停意图，避免下次写回被误判
      stageTimings: withStageTiming(job.stageTimings, "WRITEBACK", stageStartedAt, new Date().toISOString()),
    });
    console.error(`[writeback] failed job=${jobId}`, e);
  } finally {
    qps.stop();
  }
}
