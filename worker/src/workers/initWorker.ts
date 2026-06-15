import { hostname } from "os";
import { claimJob, updateJob, heartbeat, findPendingJobs, withStageTiming } from "../services/cosmosV4.js";
import { popHint, pushHint, setProgress } from "../services/redisV4.js";
import { blobWrite } from "../services/blobV4.js";
import { fetchTranslatableResources } from "../services/shopifyFetch.js";
import { countFieldUnits, pAll } from "../services/llmTranslate.js";
import { QpsLogger } from "../services/qpsLogger.js";

/**
 * Scale-out safe: hostname + pid ensures uniqueness across containers that may
 * share the same pid (e.g. Node process always starts at pid 1 in Docker).
 */
const WORKER_ID = `init-${process.env.HOSTNAME ?? hostname()}-${process.pid}`;

const CHUNK_SIZE = 50;
const HEARTBEAT_THROTTLE_MS = 30_000;

/**
 * How many modules to fetch from Shopify in parallel within a single job.
 * Each module issues independent Shopify API requests; they share the shop's
 * rate-limit bucket (1000 pts, 50 pts/s restore).  Default 3 keeps total
 * in-flight requests well within the bucket's safe zone.
 * Override with INIT_MODULE_CONCURRENCY env var.
 */
const MODULE_CONCURRENCY = Math.max(1, Number(process.env.INIT_MODULE_CONCURRENCY) || 3);

export async function runInitWorker(): Promise<void> {
  // Drain hint queue first (O(1) Redis pop), then fall back to Cosmos scan.
  const hints = await drainHints();
  const pending =
    hints.length > 0
      ? (
          await Promise.all(
            hints.map((h) =>
              claimJob(h.shopName, h.taskId, "INIT_QUEUED", "INITIALIZING", WORKER_ID),
            ),
          )
        ).filter((j): j is NonNullable<typeof j> => j !== null)
      : await claimPendingJobs("INIT_QUEUED", 3);

  if (pending.length === 0) return;

  // Different shops have independent Shopify rate-limit buckets — run their
  // init jobs in parallel.  Same-shop jobs are prevented by the single-job
  // claim (claimJob etag guard ensures each job is owned by exactly one worker
  // across all scaled-out instances).
  await Promise.all(
    pending.map((job) =>
      processInitJob(job.id, job.shopName).catch((e) => {
        console.error(`[init] job ${job.id} failed`, e);
      }),
    ),
  );
}

async function drainHints() {
  const hints = [];
  for (let i = 0; i < 5; i++) {
    const h = await popHint("init");
    if (!h) break;
    hints.push(h);
  }
  return hints;
}

async function claimPendingJobs(status: "INIT_QUEUED", limit: number) {
  const candidates = await findPendingJobs(status, limit);
  const claimed = await Promise.all(
    candidates.map((j) => claimJob(j.shopName, j.id, status, "INITIALIZING", WORKER_ID)),
  );
  return claimed.filter((j): j is NonNullable<typeof j> => j !== null);
}

async function processInitJob(jobId: string, shopName: string): Promise<void> {
  const { getJob } = await import("../services/cosmosV4.js");
  const job = await getJob(shopName, jobId);
  if (!job) return;

  const shopDomain = job.shopName;
  const blobPrefix = `tasks/v4/${shopName}/${jobId}`;

  await updateJob(shopName, jobId, { blobPrefix, status: "INITIALIZING" });

  const stageStartedAt = new Date().toISOString(); // ISO span start for stageTimings
  const manifest: Record<string, { totalItems: number; chunks: number }> = {};
  // JS is single-threaded: these are mutated synchronously between await
  // points inside pAll callbacks — safe without a mutex.
  let totalItems = 0;
  let totalUnits = 0;

  let lastHeartbeatAt = 0;
  const throttledHeartbeat = async () => {
    const now = Date.now();
    // Synchronous guard update before the async heartbeat call prevents
    // concurrent pAll callbacks from triggering duplicate heartbeats.
    if (now - lastHeartbeatAt > HEARTBEAT_THROTTLE_MS) {
      lastHeartbeatAt = now;
      await heartbeat(shopName, jobId);
    }
  };

  const qps = new QpsLogger(jobId, shopName, "INIT");

  try {
    // ── Parallel module fetching ─────────────────────────────────────────────
    // MODULE_CONCURRENCY controls how many Shopify API requests run in
    // parallel.  shopifyGraphql() handles proactive throttle (extensions.cost)
    // and 429 retry, so we don't need explicit back-off here.
    await pAll(job.modules, MODULE_CONCURRENCY, async (module) => {
      await throttledHeartbeat();

      console.log(`[init] fetching module=${module} job=${jobId}`);
      const chunks = await fetchTranslatableResources(
        shopDomain,
        job.shopifyAccessToken,
        module,
        job.limitPerType,
        CHUNK_SIZE,
        {
          targetLocale: job.target,
          isCover: job.isCover,
          isHandle: job.isHandle,
          onPage: throttledHeartbeat,
        },
      );

      if (chunks.length === 0) {
        console.log(`[init] module=${module} 0 items, skipping`);
        return;
      }

      // Upload all chunks for this module in parallel — each blob path is
      // unique so concurrent writes are safe.
      await Promise.all(
        chunks.map((chunk, i) =>
          blobWrite(
            `${blobPrefix}/init/${module}/chunk-${String(i).padStart(2, "0")}.json`,
            chunk,
          ),
        ),
      );

      // Compute per-module stats
      const moduleItemCount = chunks.reduce((sum, c) => sum + c.length, 0);
      let moduleUnits = 0;
      for (const chunk of chunks) {
        for (const r of chunk) {
          for (const f of r.fields) moduleUnits += countFieldUnits(f.key, f.value);
        }
      }

      // Accumulate into shared totals.  These +=  happen synchronously (no
      // await between read and write) so they are safe despite interleaved
      // async callbacks in JS's single-threaded event loop.
      manifest[module] = { totalItems: moduleItemCount, chunks: chunks.length };
      totalItems += moduleItemCount;
      totalUnits += moduleUnits;

      await setProgress(jobId, { initDone: totalItems, currentModule: module });
      await throttledHeartbeat();
    });

    // ── Write manifest and advance status ────────────────────────────────────
    await blobWrite(`${blobPrefix}/manifest.json`, {
      taskId: jobId,
      shopName,
      source: job.source,
      target: job.target,
      modules: manifest,
      createdAt: new Date().toISOString(),
    });

    await updateJob(shopName, jobId, {
      status: "TRANSLATE_QUEUED",
      claimedBy: null,
      stageTimings: withStageTiming(
        job.stageTimings,
        "INIT",
        stageStartedAt,
        new Date().toISOString(),
      ),
      metrics: {
        ...job.metrics,
        initTotal: totalItems,
        initDone: totalItems,
        translateTotal: totalItems,
        translateUnitTotal: totalUnits,
      },
    });

    await setProgress(jobId, {
      initTotal: totalItems,
      initDone: totalItems,
      translateUnitTotal: totalUnits,
    });

    await pushHint("translate", { taskId: jobId, shopName });
    console.log(`[init] done job=${jobId} totalItems=${totalItems}`);
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    await updateJob(shopName, jobId, {
      status: "FAILED",
      errorMessage,
      errorStage: "INIT",
      claimedBy: null,
      stageTimings: withStageTiming(job.stageTimings, "INIT", stageStartedAt, new Date().toISOString()),
    });
    console.error(`[init] failed job=${jobId}`, e);
  } finally {
    qps.stop();
  }
}
