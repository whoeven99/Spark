import { hostname } from "os";
import {
  claimJob,
  updateJob,
  heartbeat,
  findPendingJobs,
  withStageTiming,
  prefersStoredToken,
  countShopInitializingJobs,
  findInitQueuedJobsForShop,
  type TranslationV4Job,
} from "../services/cosmosV4.js";
import { popHint, pushHint, setProgress } from "../services/redisV4.js";
import { runTranslateWorker } from "./translateWorker.js";
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

const INIT_MAX_REQUEUE = Math.max(0, Number(process.env.INIT_MAX_REQUEUE) || 5);

function isRecoverableInitError(message: string): boolean {
  return /THROTTLED|429|rate limit/i.test(message);
}

async function completeEmptyInitJob(
  job: TranslationV4Job,
  jobId: string,
  shopName: string,
  blobPrefix: string,
  stageStartedAt: string,
  manifest: Record<string, { totalItems: number; chunks: number }>,
): Promise<void> {
  await blobWrite(`${blobPrefix}/manifest.json`, {
    taskId: jobId,
    shopName,
    source: job.source,
    target: job.target,
    modules: manifest,
    createdAt: new Date().toISOString(),
    empty: true,
  });

  await updateJob(shopName, jobId, {
    status: "COMPLETED",
    claimedBy: null,
    errorMessage: null,
    errorStage: null,
    stageTimings: withStageTiming(job.stageTimings, "INIT", stageStartedAt, new Date().toISOString()),
    metrics: {
      ...job.metrics,
      initTotal: 0,
      initDone: 0,
      translateTotal: 0,
      translateDone: 0,
      translateUnitTotal: 0,
      translateUnitDone: 0,
      writebackTotal: 0,
      writebackDone: 0,
      verifyTotal: 0,
      verifyDone: 0,
    },
  });

  await setProgress(jobId, {
    initTotal: 0,
    initDone: 0,
    translateUnitTotal: 0,
    translateUnitDone: 0,
    writebackTotal: 0,
    writebackDone: 0,
    verifyTotal: 0,
    verifyDone: 0,
  });

  console.log(
    `[init] done job=${jobId} totalItems=0 — 无待翻译增量（可能已全部译完或非覆盖模式无 outdated 字段）→ COMPLETED`,
  );
}

export async function runInitWorker(): Promise<void> {
  const claimed = await claimNextInitJob();
  if (!claimed) return;
  console.log(`[init] processing job=${claimed.id} shop=${claimed.shopName}`);
  await processInitJob(claimed.id, claimed.shopName).catch((e) => {
    console.error(`[init] job ${claimed.id} failed`, e);
  });
}

async function wakeNextInitForShop(shopName: string): Promise<void> {
  if ((await countShopInitializingJobs(shopName)) > 0) return;
  const [next] = await findInitQueuedJobsForShop(shopName, 1);
  if (!next) return;
  await pushHint("init", { taskId: next.id, shopName });
  void runInitWorker().catch((e) =>
    console.error(`[init] wake next failed shop=${shopName}`, e),
  );
  console.log(
    `[init] shop=${shopName} slot free → queued next job=${next.id} ${next.source}->${next.target}`,
  );
}

/**
 * 同 shop 同一时间只允许一个 INITIALIZING（不同 target 共享 Shopify rate-limit bucket）。
 * 返回 null 表示该 shop 已有 INIT 在跑，或 claim 失败。
 */
async function tryClaimInitJob(
  shopName: string,
  taskId: string,
): Promise<TranslationV4Job | null> {
  if ((await countShopInitializingJobs(shopName)) > 0) {
    return null;
  }
  const job = await claimJob(
    shopName,
    taskId,
    "INIT_QUEUED",
    "INITIALIZING",
    WORKER_ID,
  );
  if (!job) return null;
  const active = await countShopInitializingJobs(shopName);
  if (active > 1) {
    await updateJob(shopName, job.id, { status: "INIT_QUEUED", claimedBy: null });
    console.log(
      `[init] yield duplicate claim job=${job.id} shop=${shopName} (${active} INITIALIZING)`,
    );
    return null;
  }
  return job;
}

async function claimNextInitJob(): Promise<TranslationV4Job | null> {
  const hint = await popHint("init");
  if (hint) {
    const job = await tryClaimInitJob(hint.shopName, hint.taskId);
    if (job) return job;
    // shop 已有 INIT 在跑 —— 把 hint 放回队列，等当前任务结束后 wakeNext 再拾取
    await pushHint("init", hint);
    return null;
  }
  const candidates = await findPendingJobs("INIT_QUEUED", 10);
  for (const candidate of candidates) {
    const job = await tryClaimInitJob(candidate.shopName, candidate.id);
    if (job) return job;
  }
  return null;
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
          preferLegacyToken: prefersStoredToken(job),
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
          for (const f of r.fields) moduleUnits += countFieldUnits(f.key, f.value, f.shopifyType);
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

    if (totalItems === 0) {
      await completeEmptyInitJob(job, jobId, shopName, blobPrefix, stageStartedAt, manifest);
      return;
    }

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
    void runTranslateWorker().catch((e) =>
      console.error(`[init] wake translate failed job=${jobId}`, e),
    );
    console.log(`[init] done job=${jobId} totalItems=${totalItems}`);
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    const initRequeues = job.metrics?.initRequeues ?? 0;
    if (isRecoverableInitError(errorMessage) && initRequeues < INIT_MAX_REQUEUE) {
      const next = initRequeues + 1;
      await updateJob(shopName, jobId, {
        status: "INIT_QUEUED",
        claimedBy: null,
        errorStage: null,
        errorMessage: `INIT 限流，已自动重试 (${next}/${INIT_MAX_REQUEUE})`,
        metrics: { ...job.metrics, initRequeues: next },
        stageTimings: withStageTiming(job.stageTimings, "INIT", stageStartedAt, new Date().toISOString()),
      });
      const delayMs = Math.min(60_000, 3_000 * next);
      console.warn(
        `[init] throttled job=${jobId} requeue in ${delayMs}ms (${next}/${INIT_MAX_REQUEUE})`,
      );
      setTimeout(() => {
        void pushHint("init", { taskId: jobId, shopName }).then(() =>
          runInitWorker().catch((err) =>
            console.error(`[init] requeue wake failed job=${jobId}`, err),
          ),
        );
      }, delayMs);
      return;
    }
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
    await wakeNextInitForShop(shopName).catch((e) => {
      console.warn(`[init] wakeNext failed shop=${shopName}`, e);
    });
  }
}
