import { hostname } from "os";
import {
  claimJob,
  updateJob,
  heartbeat,
  findPendingJobs,
  getJob,
  withStageTiming,
  prefersStoredToken,
  countShopInitializingJobs,
  findInitQueuedJobsForShop,
  TSF_AUTO_TASK_SOURCE,
  type TranslationV4Job,
} from "../services/cosmosV4.js";
import { popHint, pushHint, requeueHintTail, setProgress, type HintPayload } from "../services/redisV4.js";
import { runTranslateWorker } from "./translateWorker.js";
import { blobWrite } from "../services/blobV4.js";
import { purgeAutoJob } from "../services/autoJobCleanup.js";
import { fetchTranslatableResources } from "../services/shopifyFetch.js";
import { countFieldUnits, pAll } from "../services/llmTranslate.js";
import {
  stagePoolKindForJob,
  stageSlots,
  type StagePoolKind,
} from "../services/stagePool.js";
import { isShuttingDown } from "../shutdown.js";

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

/**
 * 进程级 init 并发：自动与手动各占独立池（默认各 5 店）。
 * 见 stagePool.ts（MAX_CONCURRENT_AUTO_INIT_JOBS / MAX_CONCURRENT_MANUAL_INIT_JOBS）。
 * 同店 init 串行由 tryClaimInitJob 保证。
 */

/** Max stale/busy hints to drain per tick before falling back to Cosmos scan. */
const INIT_HINT_DRAIN_MAX = Math.max(1, Number(process.env.INIT_HINT_DRAIN_MAX) || 32);

function collectInitErrorStrings(error: unknown): string[] {
  const strings: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current != null && !seen.has(current)) {
    seen.add(current);
    if (current instanceof Error) {
      strings.push(current.message);
      const code = (current as NodeJS.ErrnoException).code;
      if (typeof code === "string") strings.push(code);
      if (current instanceof AggregateError) {
        for (const inner of current.errors) {
          strings.push(...collectInitErrorStrings(inner));
        }
      }
      current = current.cause;
    } else if (typeof current === "string") {
      strings.push(current);
      break;
    } else {
      strings.push(String(current));
      break;
    }
  }
  return strings;
}

function isRecoverableInitError(error: unknown): boolean {
  const text = collectInitErrorStrings(error).join("\n");
  return (
    /THROTTLED|429|rate limit/i.test(text) ||
    /HTTP 502|HTTP 503|HTTP 504/i.test(text) ||
    /ETIMEDOUT|ECONNRESET/i.test(text)
  );
}

function initRequeueLabel(error: unknown): string {
  const text = collectInitErrorStrings(error).join("\n");
  if (/THROTTLED|429|rate limit/i.test(text)) return "限流";
  if (/HTTP 502|HTTP 503|HTTP 504/i.test(text)) return "Shopify 暂时不可用";
  if (/ETIMEDOUT|ECONNRESET/i.test(text)) return "网络超时";
  return "暂时失败";
}

async function completeEmptyInitJob(
  job: TranslationV4Job,
  jobId: string,
  shopName: string,
  blobPrefix: string,
  stageStartedAt: string,
  manifest: Record<string, { totalItems: number; chunks: number }>,
): Promise<void> {
  // 自动任务无增量：直接删记录，避免任务列表堆积 0 条 COMPLETED
  if (job.taskSource === TSF_AUTO_TASK_SOURCE) {
    await purgeAutoJob({ id: jobId, shopName, blobPrefix });
    console.log(
      `[init] done job=${jobId} totalItems=0 — 自动任务无增量，已删除记录`,
    );
    return;
  }

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
    `[init] done job=${jobId} totalItems=0 — 无待翻译增量（可能已全部译完或非覆盖模式无 outdated/空译文 字段）→ COMPLETED`,
  );
}

export async function runInitWorker(): Promise<void> {
  if (!stageSlots.anyCapacity("init")) return;

  let claimed: TranslationV4Job | null = null;
  let poolKind: StagePoolKind | null = null;
  let slotHeld = false;
  try {
    claimed = await claimNextInitJob();
    if (!claimed) return;

    poolKind = stagePoolKindForJob(claimed);
    if (!stageSlots.tryAcquire("init", poolKind)) {
      await updateJob(claimed.shopName, claimed.id, {
        status: "INIT_QUEUED",
        claimedBy: null,
      });
      await pushHint("init", { taskId: claimed.id, shopName: claimed.shopName });
      return;
    }
    slotHeld = true;

    console.log(
      `[init] processing job=${claimed.id} shop=${claimed.shopName} pool=${poolKind} (${stageSlots.formatActive("init")})`,
    );
    await processInitJob(claimed.id, claimed.shopName);
  } catch (e) {
    if (claimed) console.error(`[init] job ${claimed.id} failed`, e);
    else console.error("[init] claim failed", e);
  } finally {
    if (poolKind && slotHeld) {
      stageSlots.release("init", poolKind);
      if (stageSlots.anyCapacity("init")) {
        void runInitWorker().catch((e) =>
          console.error("[init] wake on slot free failed", e),
        );
      }
    }
  }
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

async function isStaleInitHint(hint: HintPayload): Promise<boolean> {
  const job = await getJob(hint.shopName, hint.taskId);
  if (!job) return true;
  return job.status !== "INIT_QUEUED";
}

async function claimNextInitJob(): Promise<TranslationV4Job | null> {
  for (let n = 0; n < INIT_HINT_DRAIN_MAX; n++) {
    const hint = await popHint("init");
    if (!hint) break;

    if (await isStaleInitHint(hint)) {
      console.log(
        `[init] discard stale hint job=${hint.taskId} shop=${hint.shopName}`,
      );
      continue;
    }

    const queued = await getJob(hint.shopName, hint.taskId);
    if (
      queued &&
      !stageSlots.hasCapacity("init", stagePoolKindForJob(queued))
    ) {
      await requeueHintTail("init", hint);
      continue;
    }

    const job = await tryClaimInitJob(hint.shopName, hint.taskId);
    if (job) return job;

    // 仍为 INIT_QUEUED 但同店已有 INITIALIZING：塞回队尾，继续尝试其他店的 hint
    await requeueHintTail("init", hint);
  }

  const candidates = await findPendingJobs("INIT_QUEUED", 10);
  for (const candidate of candidates) {
    if (
      !stageSlots.hasCapacity("init", stagePoolKindForJob(candidate))
    ) {
      continue;
    }
    const job = await tryClaimInitJob(candidate.shopName, candidate.id);
    if (job) return job;
  }
  return null;
}

async function processInitJob(jobId: string, shopName: string): Promise<void> {
  const job = await getJob(shopName, jobId);
  if (!job) return;

  if (isShuttingDown()) {
    if (job.claimedBy === WORKER_ID) {
      await updateJob(shopName, jobId, {
        status: "INIT_QUEUED",
        claimedBy: null,
        errorStage: null,
        errorMessage: null,
      });
      await pushHint("init", { taskId: jobId, shopName });
      console.log(`[init] job=${jobId} shutdown at entry → INIT_QUEUED`);
    }
    return;
  }

  if (job.status !== "INITIALIZING" || job.claimedBy !== WORKER_ID) {
    console.log(
      `[init] skip stale processInitJob job=${jobId} status=${job.status} claimedBy=${job.claimedBy ?? "null"}`,
    );
    return;
  }

  const shopDomain = job.shopName;
  const blobPrefix = `tasks/v4/${shopName}/${jobId}`;

  await updateJob(shopName, jobId, { blobPrefix });

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

  try {
    // ── Parallel module fetching ─────────────────────────────────────────────
    // MODULE_CONCURRENCY controls how many Shopify API requests run in
    // parallel.  shopifyGraphql() handles proactive throttle (extensions.cost)
    // and 429 retry, so we don't need explicit back-off here.
    await pAll(job.modules, MODULE_CONCURRENCY, async (module) => {
      if (isShuttingDown()) {
        throw new Error("shutdown: init yielding for deploy");
      }
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
    if (isShuttingDown() || /shutdown: init yielding/i.test(errorMessage)) {
      await updateJob(shopName, jobId, {
        status: "INIT_QUEUED",
        claimedBy: null,
        errorStage: null,
        errorMessage: null,
        stageTimings: withStageTiming(job.stageTimings, "INIT", stageStartedAt, new Date().toISOString()),
      });
      await pushHint("init", { taskId: jobId, shopName });
      console.log(`[init] job=${jobId} yielding for shutdown → INIT_QUEUED`);
      return;
    }
    const initRequeues = job.metrics?.initRequeues ?? 0;
    if (isRecoverableInitError(e) && initRequeues < INIT_MAX_REQUEUE) {
      const next = initRequeues + 1;
      const reason = initRequeueLabel(e);
      await updateJob(shopName, jobId, {
        status: "INIT_QUEUED",
        claimedBy: null,
        errorStage: null,
        errorMessage: `INIT ${reason}，已自动重试 (${next}/${INIT_MAX_REQUEUE})`,
        metrics: { ...job.metrics, initRequeues: next },
        stageTimings: withStageTiming(job.stageTimings, "INIT", stageStartedAt, new Date().toISOString()),
      });
      const delayMs = Math.min(60_000, 3_000 * next);
      console.warn(
        `[init] recoverable (${reason}) job=${jobId} requeue in ${delayMs}ms (${next}/${INIT_MAX_REQUEUE})`,
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
    await wakeNextInitForShop(shopName).catch((e) => {
      console.warn(`[init] wakeNext failed shop=${shopName}`, e);
    });
  }
}
