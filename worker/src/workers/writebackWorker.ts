import { hostname } from "os";
import { claimJob, updateJob, heartbeat, findPendingJobs, getJob, withStageTiming, prefersStoredToken } from "../services/cosmosV4.js";
import { popHint, pushHint, setProgress } from "../services/redisV4.js";
import { blobRead, blobListPaths, blobWrite } from "../services/blobV4.js";
import { registerTranslations, type TranslationInput } from "../services/shopifyFetch.js";
import { pAll } from "../services/llmTranslate.js";
import { QpsLogger } from "../services/qpsLogger.js";
import type { TranslationV4Job } from "../services/cosmosV4.js";

/**
 * Scale-out safe: hostname + pid is unique across containers even when every
 * container's Node process starts at pid 1.
 */
const WORKER_ID = `writeback-${process.env.HOSTNAME ?? hostname()}-${process.pid}`;

const HEARTBEAT_THROTTLE_MS = 30_000;

/**
 * How many translationsRegister mutations to fire in parallel per job.
 * Shopify's bucket (1000 pts, 50 pts/s restore) handles this comfortably;
 * shopifyGraphql() throttles proactively and retries on 429.
 * Override with WRITEBACK_CONCURRENCY env var.
 */
const WRITEBACK_CONCURRENCY = Math.max(1, Number(process.env.WRITEBACK_CONCURRENCY) || 3);

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

  try {
    // ── Phase 1: Collect all pending resources ────────────────────────────────
    // Blob listing + reads are sequential here (fast, not the throughput bottleneck).
    // Resources already in writtenSet are skipped — supports crash-resume.
    const pendingResources: PendingResource[] = [];
    for (const module of job.modules) {
      const translatePaths = await blobListPaths(`${blobPrefix}/translate/${module}/`);
      const chunkPaths = translatePaths.filter((p) => p.endsWith(".json"));
      for (const chunkPath of chunkPaths) {
        const chunk = await blobRead<TranslatedItem[]>(chunkPath);
        if (!chunk) continue;
        for (const resource of chunk) {
          if (!writtenSet.has(resource.resourceId)) {
            pendingResources.push({ resource, module });
          }
        }
      }
    }

    console.log(
      `[writeback] job=${jobId} pending=${pendingResources.length} concurrency=${WRITEBACK_CONCURRENCY}`,
    );

    // ── Phase 2: Parallel writeback ───────────────────────────────────────────
    // shopifyGraphql() handles proactive throttle (extensions.cost) and 429
    // retry automatically — no additional back-off logic needed here.
    await pAll(pendingResources, WRITEBACK_CONCURRENCY, async ({ resource, module }) => {
      // Throttled heartbeat: the synchronous `lastHeartbeatAt = now` update
      // prevents concurrent callbacks from firing duplicate heartbeats.
      const now = Date.now();
      if (now - lastHeartbeatAt > HEARTBEAT_THROTTLE_MS) {
        lastHeartbeatAt = now;
        await heartbeat(shopName, jobId);
      }

      const translations: TranslationInput[] = resource.translations
        .filter((t) => t.translatedValue?.trim())
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

      // Persist progress every 20 resources for crash-resume support.
      // The % 20 check is safe: JS's single-threaded model ensures ++ is
      // never concurrent, so two callbacks can't see the same counter value.
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

    // ── Phase 3: Finalise ─────────────────────────────────────────────────────
    await blobWrite(progressPath, { written: [...writtenSet] });

    const latestJob = await getJob(shopName, jobId);
    const updatedMetrics = {
      ...(latestJob?.metrics ?? job.metrics),
      writebackDone,
      writebackFailed,
    };

    await blobWrite(failedPath, failedResources);

    const verifyTotal = writebackDone + writebackFailed;
    await updateJob(shopName, jobId, {
      status: "VERIFY_QUEUED",
      claimedBy: null,
      stageTimings: withStageTiming(
        latestJob?.stageTimings ?? job.stageTimings,
        "WRITEBACK",
        stageStartedAt,
        new Date().toISOString(),
      ),
      metrics: { ...updatedMetrics, verifyTotal },
    });
    await pushHint("verify", { taskId: jobId, shopName });
    console.log(
      `[writeback] done job=${jobId} written=${writebackDone} failed=${writebackFailed} → VERIFY_QUEUED (read-back verify ${verifyTotal} resources)`,
    );
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    await updateJob(shopName, jobId, {
      status: "FAILED",
      errorMessage,
      errorStage: "WRITEBACK",
      claimedBy: null,
      stageTimings: withStageTiming(job.stageTimings, "WRITEBACK", stageStartedAt, new Date().toISOString()),
    });
    console.error(`[writeback] failed job=${jobId}`, e);
  } finally {
    qps.stop();
  }
}
