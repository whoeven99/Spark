import { hostname } from "os";
import {
  claimJob,
  updateJob,
  heartbeat,
  findPendingJobs,
  getJob,
  withStageTiming,
  countShopTranslatingJobs,
  findTranslateQueuedJobsForShop,
} from "../services/cosmosV4.js";
import { popHint, pushHint, setProgress, readControl, clearControl, getProgress } from "../services/redisV4.js";
import {
  deductTsfQuota,
  getTsfRemainingWithRetry,
  quotaEnforceEnabled,
  quotaConcurrencyCap,
  quotaTokenMultiplier,
  resolveQuotaSeedCap,
} from "../services/tsfQuota.js";
import { blobRead, blobWrite, blobListPaths } from "../services/blobV4.js";
import {
  assembleLegacyChunkBlob,
  countTranslatedResources,
  isChunkFullyCheckpointed,
  listTranslatedResourceIds,
  writeTranslatedResourceBlob,
  type TranslatedResourceItem,
} from "../services/translateBlobIO.js";
import {
  translateResources,
  resolveEngine,
  mergeEngineUsage,
  countFieldUnits,
  flushKeyStats,
  pAll,
  setShopQuotaCap,
  type EngineUsage,
  type TranslateItem,
  type TranslatedResourceOutput,
} from "../services/llmTranslate.js";
import { QpsLogger } from "../services/qpsLogger.js";
import type { TranslationV4Job } from "../services/cosmosV4.js";
import { translateJobGate } from "../services/workerConcurrency.js";
import { runWritebackWorker } from "./writebackWorker.js";

const HEARTBEAT_THROTTLE_MS = 30_000;

/** Scale-out safe: hostname + pid unique across Docker containers sharing pid=1 */
const WORKER_ID = `translate-${process.env.HOSTNAME ?? hostname()}-${process.pid}`;

/** Serialize shared counter + Redis updates across concurrent chunk handlers. */
function createExclusiveRunner() {
  let chain: Promise<void> = Promise.resolve();
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(fn, fn);
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
}

async function countUnitsForCheckpointedResources(
  blobPrefix: string,
  modules: string[],
): Promise<number> {
  let units = 0;
  for (const module of modules) {
    const doneIds = await listTranslatedResourceIds(blobPrefix, module);
    if (doneIds.size === 0) continue;
    const initPaths = (await blobListPaths(`${blobPrefix}/init/${module}/`)).filter((p) =>
      p.endsWith(".json"),
    );
    for (const initPath of initPaths) {
      const chunk = await blobRead<Array<{ resourceId: string; fields: TranslateItem[] }>>(initPath);
      if (!chunk) continue;
      for (const resource of chunk) {
        if (!doneIds.has(resource.resourceId)) continue;
        for (const field of resource.fields ?? []) {
          units += countFieldUnits(field.key, field.value, field.shopifyType);
        }
      }
    }
  }
  return units;
}

function toTranslatedResourceItem(
  resourceId: string,
  results: TranslatedResourceOutput["results"],
  origFields: TranslateItem[],
): TranslatedResourceItem {
  return {
    resourceId,
    translations: results.map((r) => ({
      key: r.key,
      originalValue: origFields.find((f) => f.key === r.key)?.value ?? "",
      translatedValue: r.translatedValue,
      digest: r.digest,
      status: r.status,
    })),
  };
}

export async function runTranslateWorker(): Promise<void> {
  // Scheduler polls without awaiting prior runs — cap in-flight jobs per process
  // so N shops do not each hold chunk pools + blob payloads in memory at once.
  if (!translateJobGate.tryAcquire()) return;
  try {
    const claimed = await claimNextJob();
    if (!claimed) return;
    console.log(`[translate] processing job=${claimed.id}`);
    await processTranslateJob(claimed).catch((e) => {
      console.error(`[translate] job ${claimed.id} failed`, e);
    });
  } finally {
    translateJobGate.release();
  }
}

async function wakeNextTranslateForShop(shopName: string): Promise<void> {
  if ((await countShopTranslatingJobs(shopName)) > 0) return;
  const [next] = await findTranslateQueuedJobsForShop(shopName, 1);
  if (!next) return;
  await pushHint("translate", { taskId: next.id, shopName });
  void runTranslateWorker().catch((e) =>
    console.error(`[translate] wake next failed shop=${shopName}`, e),
  );
  console.log(
    `[translate] shop=${shopName} slot free → queued next job=${next.id} ${next.source}->${next.target}`,
  );
}

function wakeWritebackWorker(jobId: string): void {
  void runWritebackWorker().catch((e) =>
    console.error(`[translate] wake writeback failed job=${jobId}`, e),
  );
}

/**
 * 同 shop 同一时间只允许一个 TRANSLATING（初始化可并行，翻译串行）。
 * 返回 null 表示该 shop 已有任务在译，或 claim 失败。
 */
async function tryClaimTranslateJob(
  shopName: string,
  taskId: string,
): Promise<TranslationV4Job | null> {
  if ((await countShopTranslatingJobs(shopName)) > 0) {
    return null;
  }
  const job = await claimJob(
    shopName,
    taskId,
    "TRANSLATE_QUEUED",
    "TRANSLATING",
    WORKER_ID,
  );
  if (!job) return null;
  const active = await countShopTranslatingJobs(shopName);
  if (active > 1) {
    await updateJob(shopName, job.id, { status: "TRANSLATE_QUEUED", claimedBy: null });
    console.log(
      `[translate] yield duplicate claim job=${job.id} shop=${shopName} (${active} TRANSLATING)`,
    );
    return null;
  }
  return job;
}

async function claimNextJob(): Promise<TranslationV4Job | null> {
  const hint = await popHint("translate");
  if (hint) {
    const job = await tryClaimTranslateJob(hint.shopName, hint.taskId);
    if (job) return job;
    // shop 已有任务在译 —— 把 hint 放回队列，等当前任务结束后 wakeNext 再拾取
    await pushHint("translate", hint);
    return null;
  }
  const candidates = await findPendingJobs("TRANSLATE_QUEUED", 10);
  for (const candidate of candidates) {
    const job = await tryClaimTranslateJob(candidate.shopName, candidate.id);
    if (job) return job;
  }
  return null;
}

// All chunks within a module are translated concurrently.
// The pool's AdaptiveSemaphore (driven by X-RateLimit-* headers) gates the
// actual LLM calls — no separate chunk concurrency knob is needed.

async function processTranslateJob(job: TranslationV4Job): Promise<void> {
  const { shopName, id: jobId, source, target, aiModel } = job;
  // Engine routing (Google vs DeepSeek) is applied inside translateBatch.
  const blobPrefix = job.blobPrefix || `tasks/v4/${shopName}/${jobId}`;

  // Resume: restore token counter from Cosmos + Redis (412 on pause may leave Cosmos stale).
  const latestAtStart = await getJob(shopName, jobId);
  const redisProgressAtStart = await getProgress(jobId);
  const redisUsedTokensAtStart = Number(redisProgressAtStart.usedTokens) || 0;
  const persistedUsedTokens = Math.max(
    latestAtStart?.metrics.usedTokens ?? job.metrics.usedTokens ?? 0,
    redisUsedTokensAtStart,
  );

  const runExclusive = createExclusiveRunner();
  const durableDone = await countTranslatedResources(blobPrefix, job.modules);
  const durableUnits = await countUnitsForCheckpointedResources(blobPrefix, job.modules);
  const redisDone = Number(redisProgressAtStart.translateDone) || 0;
  const redisUnits = Number(redisProgressAtStart.translateUnitDone) || 0;

  let translateDone = Math.max(durableDone, redisDone);
  let translateFailed = Number(redisProgressAtStart.translateFailed) || 0;
  let translateFallback = Number(redisProgressAtStart.translateFallback) || 0;
  let translateUnitDone = Math.max(durableUnits, redisUnits);
  let liveTokens = persistedUsedTokens; // accumulated LLM tokens (after multiplier)
  let lastHeartbeatAt = 0;
  const tokenMultiplier = Math.max(0, Number(process.env.TRANSLATION_TOKEN_MULTIPLIER) || 1);
  // Fields that were translated but fell back to the original value (engine
  // dropped the key / failed). Surfaced to the UI via translate/fallbacks.json.
  const fallbacks: Array<{ resourceId: string; module: string; key: string }> = [];
  const engineUsage: EngineUsage = {};
  const translateTotal = job.metrics.translateTotal || job.metrics.initTotal;
  const translateUnitTotal = job.metrics.translateUnitTotal || 0;
  // Record when this translate stage actually started (epoch ms string).
  const translateStartedAt = Date.now().toString();
  const stageStartedAt = new Date().toISOString(); // ISO span start for stageTimings
  const qps = new QpsLogger(jobId, shopName, "TRANSLATE");

  // Write the start timestamp to Redis immediately so the UI can compute elapsed time.
  await setProgress(jobId, {
    translateStartedAt,
    translateDone,
    translateFailed,
    translateFallback,
    translateUnitDone,
    translateUnitTotal,
    translateTotal,
    usedTokens: persistedUsedTokens,
  });

  // ── 中断信号 ──────────────────────────────────────────────────────────────
  // 外部手动暂停/取消（Redis 控制键）或额度耗尽（quota 申请失败）都汇入这里，
  // chunk 入口与 onProgress 检查到后优雅停止：不再起新 chunk，已在飞的自然跑完。
  const abort: { tripped: boolean; action: "pause" | "cancel"; reason: string } = {
    tripped: false,
    action: "pause",
    reason: "",
  };
  let lastControlCheckAt = 0;
  const CONTROL_CHECK_THROTTLE_MS = 1000;
  /**
   * 暂停/取消触发后立刻写 Redis「暂停待落盘」信号（UI 据此显示「正在暂停…」）。
   * 不再乐观地把 Cosmos 设成 PAUSED —— 真正的终态由 abort 块在在飞批次收尾后落定
   * （已翻译 >0 → WRITEBACK_QUEUED 先写回 → PAUSED/CANCELLED；否则直接终态）。
   * 这样状态单调推进，避免 PAUSED 闪现导致「继续」按钮提前出现又消失。
   */
  const persistAbortSoon = (_action: "pause" | "cancel", reason: string) => {
    void (async () => {
      try {
        await setProgress(jobId, { pausePending: "1", pauseReason: reason });
      } catch (e) {
        console.warn(`[translate] persist abort failed job=${jobId}`, e);
      }
    })();
  };
  const tripAbort = (
    action: "pause" | "cancel",
    reason: string,
    options?: { persist?: boolean },
  ) => {
    if (abort.tripped) return;
    abort.tripped = true;
    abort.action = action;
    abort.reason = reason;
    if (options?.persist !== false) {
      persistAbortSoon(action, reason);
    }
  };

  /** Lost claim / external re-queue — stop without clobbering the new runner. */
  const verifyStillClaimed = async (): Promise<boolean> => {
    const latest = await getJob(shopName, jobId);
    if (!latest) {
      tripAbort("pause", "任务已不存在", { persist: false });
      return false;
    }
    if (latest.claimedBy !== WORKER_ID) {
      tripAbort("pause", "任务已被其它 worker 接管", { persist: false });
      return false;
    }
    if (latest.status === "TRANSLATING") return true;
    if (latest.status === "CANCELLED") {
      tripAbort("cancel", "已取消", { persist: false });
      return false;
    }
    if (latest.status === "PAUSED" || latest.status === "TRANSLATE_QUEUED") {
      tripAbort(
        "pause",
        latest.status === "PAUSED" ? "已暂停" : "任务已重新排队",
        { persist: false },
      );
      return false;
    }
    return true;
  };

  /** 读取外部控制键（节流）+ 校验仍持有 claim，命中则置位 abort。 */
  const checkControl = async (force = false): Promise<void> => {
    if (abort.tripped) return;
    const now = Date.now();
    if (!force && now - lastControlCheckAt < CONTROL_CHECK_THROTTLE_MS) return;
    lastControlCheckAt = now;
    if (!(await verifyStillClaimed())) return;
    const ctrl = await readControl(jobId);
    if (ctrl === "pause") tripAbort("pause", "已手动暂停");
    else if (ctrl === "cancel") tripAbort("cancel", "已取消");
  };
  const shouldAbort = async (): Promise<boolean> => {
    if (abort.tripped) return true;
    await checkControl(true);
    return abort.tripped;
  };
  // 是否对本任务做额度校验：TsFrontend 默认开启（QUOTA_ENFORCE=false 可关），其它来源关闭。
  const enforceQuota = quotaEnforceEnabled(job.taskSource);
  const quotaMult = quotaTokenMultiplier();

  // 进入翻译前先按当前剩余额度设定该 shop 的并发上限（额度少→并发低）。
  // 续跑时若额度查询抖动，回退 Redis 中上次扣减后的 remaining，避免并发被 seed 到 1。
  if (enforceQuota) {
    const fallbackRemaining = Number(redisProgressAtStart.quotaRemaining) || undefined;
    const queriedRemaining = await getTsfRemainingWithRetry(shopName);
    const { remaining: quotaRemaining, cap: quotaCap, usedFallback } = resolveQuotaSeedCap(
      queriedRemaining,
      fallbackRemaining,
    );
    if (quotaRemaining <= 0) {
      tripAbort("pause", "额度不足，已自动暂停");
    } else {
      setShopQuotaCap(shopName, quotaCap);
      console.log(
        `[translate] job=${jobId} quota seed remaining=${quotaRemaining} concurrencyCap=${quotaCap}` +
          `${usedFallback ? " (redis fallback)" : ""}` +
          ` durableDone=${durableDone}/${translateTotal}`,
      );
    }
  }

  // ── 额度累积扣减 ──────────────────────────────────────────────────────────────
  // 原来每批都同步 HTTP 扣一次 Java 额度（在批完成的关键路径上）。高并发下这是大量
  // 并发往返 + 每批额外延迟。改为：内存累积欠账，攒到阈值才扣一次；阈值≈一次 perCall
  // 成本，保证并发上限(quotaConcurrencyCap)仍按每个 call 量级及时收紧，透支可控。
  // 任务收尾(成功/中断)再 flush 一次结清尾款。
  const QUOTA_FLUSH_CHARGE = Math.max(
    1,
    Number(process.env.TRANSLATE_QUOTA_FLUSH_CHARGE) || 15_000,
  );
  let pendingQuotaCharge = 0;
  const flushQuota = async (): Promise<void> => {
    if (!enforceQuota) return;
    let charge = 0;
    await runExclusive(async () => {
      charge = pendingQuotaCharge;
      pendingQuotaCharge = 0;
    });
    if (charge <= 0) return;
    const { ok, remaining } = await deductTsfQuota(shopName, charge);
    if (!ok) {
      setShopQuotaCap(shopName, 1);
      tripAbort("pause", "额度服务异常，已自动暂停");
      return;
    }
    const cap = quotaConcurrencyCap(remaining);
    setShopQuotaCap(shopName, cap);
    if (remaining < 0) tripAbort("pause", "额度不足，已自动暂停");
    await setProgress(jobId, {
      quotaRemaining: String(remaining),
      quotaConcurrencyCap: String(cap),
    });
  };

  try {
    // Flatten every chunk of every module into one work list. Previously modules
    // ran strictly one-after-another (only chunks *within* a module overlapped),
    // so many small single-chunk modules each ate a full ~40s LLM round-trip in
    // series. With all chunks in one pool the LLM pool's AdaptiveSemaphore — not
    // the module boundary — is the only thing gating throughput.
    type ChunkWork = { module: string; chunkPath: string; chunkIdx: number; chunkTotal: number };
    const work: ChunkWork[] = [];
    for (const module of job.modules) {
      await heartbeat(shopName, jobId);
      const initPaths = await blobListPaths(`${blobPrefix}/init/${module}/`);
      const chunkPaths = initPaths.filter((p) => p.endsWith(".json"));
      chunkPaths.forEach((chunkPath, ci) =>
        work.push({ module, chunkPath, chunkIdx: ci + 1, chunkTotal: chunkPaths.length }),
      );
    }

    // Cap chunks processed simultaneously to bound blob reads + in-memory pools;
    // actual LLM call concurrency is governed separately by the pool semaphore
    // (~0.9× the account in-flight limit), so this only needs to be high enough
    // that the slow "long-pole" chunks (those holding a 30KB+ metafield / long
    // body_html) are all in flight at once instead of queuing behind a low cap.
    // Default 16 balances throughput vs RSS: each chunk loads a full init blob +
    // builds translateResources pools in memory. Raise via TRANSLATE_CHUNK_CONCURRENCY
    // when the worker has headroom; lower when memory is tight.
    const CHUNK_CONCURRENCY = Math.max(1, Number(process.env.TRANSLATE_CHUNK_CONCURRENCY) || 16);

    await pAll(work, CHUNK_CONCURRENCY, async ({ module, chunkPath, chunkIdx, chunkTotal }) => {
      {
        const chunkStart = performance.now();

        await heartbeat(shopName, jobId);

        // 中断检查：外部手动暂停/取消 → 不再处理新 chunk。
        await checkControl(true);
        if (abort.tripped) return;

        const translatePath = chunkPath.replace(`${blobPrefix}/init/`, `${blobPrefix}/translate/`);
        const chunk = await blobRead<Array<{ resourceId: string; fields: TranslateItem[] }>>(chunkPath);
        if (!chunk) return;

        const chunkResources = chunk.filter((r) => r.fields?.length);
        const checkpointIds = await listTranslatedResourceIds(blobPrefix, module);

        // Legacy: full chunk file already written in a prior run.
        const existingChunk = await blobRead<Array<{ resourceId: string }>>(translatePath);
        if (existingChunk !== null) {
          console.log(
            `[translate] job=${jobId} module=${module} chunk=${chunkIdx}/${chunkTotal} ` +
              `skip (legacy chunk, ${existingChunk.length} resources)`,
          );
          return;
        }

        const pendingResources = chunkResources.filter((r) => !checkpointIds.has(r.resourceId));
        if (pendingResources.length === 0) {
          if (await isChunkFullyCheckpointed(blobPrefix, module, chunkResources)) {
            const legacyChunk = await assembleLegacyChunkBlob(blobPrefix, module, chunkResources);
            await blobWrite(translatePath, legacyChunk);
          }
          console.log(
            `[translate] job=${jobId} module=${module} chunk=${chunkIdx}/${chunkTotal} ` +
              `skip (all ${chunkResources.length} resources checkpointed)`,
          );
          return;
        }

        const chunkFieldCount = pendingResources.reduce((sum, r) => sum + (r.fields?.length ?? 0), 0);
        console.log(
          `[translate] job=${jobId} module=${module} chunk=${chunkIdx}/${chunkTotal} ` +
            `resources=${pendingResources.length}/${chunkResources.length} fields=${chunkFieldCount}`,
        );

        const checkpointedThisRun = new Set<string>();

        try {
          const onProgress = async (deltaUnits: number, deltaTokens: number) => {
            let shouldFlushQuota = false;
            await runExclusive(async () => {
              translateUnitDone += deltaUnits;
              liveTokens += Math.ceil(deltaTokens * tokenMultiplier);
              // 累积额度欠账；攒够一次 perCall 量级再扣（见 flushQuota）。
              if (enforceQuota && deltaTokens > 0) {
                pendingQuotaCharge += Math.ceil(deltaTokens * quotaMult);
                if (pendingQuotaCharge >= QUOTA_FLUSH_CHARGE) shouldFlushQuota = true;
              }
            });
            await setProgress(jobId, {
              translateDone,
              translateFailed,
              translateFallback,
              translateUnitDone,
              translateUnitTotal,
              translateTotal,
              usedTokens: liveTokens,
              currentModule: module,
            });
            const now = Date.now();
            if (now - lastHeartbeatAt > HEARTBEAT_THROTTLE_MS) {
              lastHeartbeatAt = now;
              await heartbeat(shopName, jobId);
            }
            await flushKeyStats();
            await checkControl();

            if (shouldFlushQuota) await flushQuota();
          };

          const onResourceDone = async ({ resourceId, results }: TranslatedResourceOutput) => {
            // 在锁内「认领」资源（去重），但把真正的 blob 写盘放到锁外并发执行——
            // 否则 64 个并发 chunk 的 checkpoint 写盘会全部串行走同一条 runExclusive 链。
            let claimedItem: TranslatedResourceItem | undefined;
            await runExclusive(async () => {
              if (checkpointedThisRun.has(resourceId) || checkpointIds.has(resourceId)) return;
              const orig = chunkResources.find((r) => r.resourceId === resourceId);
              if (!orig) return;
              checkpointedThisRun.add(resourceId); // 立即认领，防止并发重复写
              claimedItem = toTranslatedResourceItem(resourceId, results, orig.fields);
            });
            const item = claimedItem;
            if (!item) return;

            try {
              await writeTranslatedResourceBlob(blobPrefix, module, item); // 锁外并发 I/O
            } catch (e) {
              // 写失败 → 撤销认领，允许后续重试重新 checkpoint
              await runExclusive(async () => {
                checkpointedThisRun.delete(resourceId);
              });
              throw e;
            }

            await runExclusive(async () => {
              translateDone++;
              for (const r of results) {
                if (r.status === "fallback") {
                  translateFallback++;
                  fallbacks.push({ resourceId, module, key: r.key });
                }
              }
            });

            await setProgress(jobId, {
              translateDone,
              translateFailed,
              translateFallback,
              translateUnitDone,
              translateUnitTotal,
              translateTotal,
              usedTokens: liveTokens,
              currentModule: module,
            });
          };

          const { usage } = await translateResources(
            pendingResources.map((r) => ({ resourceId: r.resourceId, fields: r.fields })),
            source,
            target,
            aiModel,
            shopName,
            onProgress,
            onResourceDone,
            shouldAbort,
          );
          mergeEngineUsage(engineUsage, usage);
        } catch (e) {
          await runExclusive(async () => {
            translateFailed += pendingResources.length;
          });
          console.warn(`[translate] chunk ${chunkIdx}/${chunkTotal} failed`, e);
        }

        if (abort.tripped) return;

        if (await isChunkFullyCheckpointed(blobPrefix, module, chunkResources)) {
          const legacyChunk = await assembleLegacyChunkBlob(blobPrefix, module, chunkResources);
          await blobWrite(translatePath, legacyChunk);
        }

        const chunkElapsed = ((performance.now() - chunkStart) / 1000).toFixed(1);
        const chunkElapsedSec = Number(chunkElapsed);
        if (chunkElapsedSec >= 120) {
          console.warn(
            `[translate] job=${jobId} module=${module} chunk=${chunkIdx}/${chunkTotal} SLOW ` +
              `elapsed=${chunkElapsed}s checkpointed=${checkpointedThisRun.size} — ` +
              `check parallel jobs / LLM throttle for shop=${shopName}`,
          );
        }
        console.log(
          `[translate] job=${jobId} module=${module} chunk=${chunkIdx}/${chunkTotal} ` +
            `done checkpointed=${checkpointedThisRun.size} elapsed=${chunkElapsed}s doneSoFar=${translateDone}/${translateTotal}`,
        );

        await setProgress(jobId, {
          translateDone,
          translateFailed,
          translateFallback,
          translateUnitDone,
          translateUnitTotal,
          translateTotal,
          usedTokens: liveTokens,
          currentModule: module,
        });
      }
    });

    // 结清累积的额度欠账（无论正常跑完还是中断，尾款都要扣）。
    await flushQuota();

    // Persist the list of fields that fell back to original for UI visibility.
    if (fallbacks.length > 0) {
      await blobWrite(`${blobPrefix}/translate/fallbacks.json`, fallbacks);
    }

    // Record the engine actually used (real data — job.aiModel is only the request).
    const engine = resolveEngine(aiModel);

    // 被中断（手动暂停/取消 或 额度不足）。
    if (abort.tripped) {
      const latestAbort = await getJob(shopName, jobId);
      if (latestAbort?.claimedBy !== WORKER_ID) {
        console.log(`[translate] job=${jobId} yielding (claim lost, ${abort.reason})`);
        return;
      }
      const redisUsedOnAbort = Number((await getProgress(jobId)).usedTokens) || 0;
      const metricsOnAbort = {
        ...(latestAbort?.metrics ?? job.metrics),
        translateDone,
        translateFailed,
        translateFallback,
        translateUnitDone,
        translateUnitTotal,
        usedTokens: Math.max(
          liveTokens,
          latestAbort?.metrics.usedTokens ?? 0,
          redisUsedOnAbort,
        ),
      };
      const timingsOnAbort = withStageTiming(
        latestAbort?.stageTimings ?? job.stageTimings,
        "TRANSLATE",
        stageStartedAt,
        new Date().toISOString(),
      );

      // 已翻译出内容 → 先把已翻译的写回 Shopify（珍惜已完成的工作）；写回完成后
      // 由 writebackWorker 据 pauseAfterWriteback 收尾：pause→PAUSED(可续译)、cancel→CANCELLED。
      // 写回期间状态为 WRITING_BACK，前端「继续」自然禁用，直到写回结束。
      if (translateDone > 0) {
        await updateJob(shopName, jobId, {
          status: "WRITEBACK_QUEUED",
          claimedBy: null,
          pauseAfterWriteback: abort.action,
          errorStage: null,
          errorMessage: abort.action === "pause" ? abort.reason : null,
          stageTimings: timingsOnAbort,
          metrics: metricsOnAbort,
        });
        await clearControl(jobId); // 消费控制信号，避免写回后 resume 立即再次暂停
        // 清掉「暂停待落盘」标记：现在是 WRITING_BACK 主动写回，不是 paused-pending。
        await setProgress(jobId, { pausePending: "0", pauseReason: "" });
        await pushHint("writeback", { taskId: jobId, shopName });
        wakeWritebackWorker(jobId);
        console.log(
          `[translate] job=${jobId} ${abort.action}→先写回已翻译（${abort.reason}）done=${translateDone}/${translateTotal}`,
        );
        return;
      }

      // 还没翻译出任何内容 → 直接终态，无需写回。补额度/解除暂停后 resume 重新入队续译。
      await updateJob(shopName, jobId, {
        status: abort.action === "cancel" ? "CANCELLED" : "PAUSED",
        claimedBy: null,
        errorStage: "TRANSLATE",
        errorMessage: abort.action === "cancel" ? null : abort.reason,
        stageTimings: timingsOnAbort,
        metrics: metricsOnAbort,
      });
      await clearControl(jobId);
      console.log(
        `[translate] job=${jobId} 已${abort.action === "cancel" ? "取消" : "暂停"}（${abort.reason}）done=0`,
      );
      return;
    }

    // Refresh job to get latest metrics
    const latestJob = await getJob(shopName, jobId);
    const redisUsedOnComplete = Number((await getProgress(jobId)).usedTokens) || 0;
    const usedTokens = Math.max(
      liveTokens,
      latestJob?.metrics.usedTokens ?? 0,
      redisUsedOnComplete,
    );
    await updateJob(shopName, jobId, {
      status: "WRITEBACK_QUEUED",
      claimedBy: null,
      // 正常跑完的写回，清掉可能残留的暂停意图（防上次 pause-写回失败留下的脏标记
      // 把这次正常写回误判成「暂停写回」）。
      pauseAfterWriteback: null,
      aiModelUsed: engine.model,
      aiProvider: engine.provider,
      engineUsage,
      stageTimings: withStageTiming(
        latestJob?.stageTimings ?? job.stageTimings,
        "TRANSLATE",
        stageStartedAt,
        new Date().toISOString(),
      ),
      metrics: {
        ...(latestJob?.metrics ?? job.metrics),
        translateDone,
        translateFailed,
        translateFallback,
        translateUnitDone,
        translateUnitTotal,
        writebackTotal: translateDone,
        usedTokens,
      },
    });

    await pushHint("writeback", { taskId: jobId, shopName });
    wakeWritebackWorker(jobId);
    console.log(
      `[translate] done job=${jobId} done=${translateDone} failed=${translateFailed} fallback=${translateFallback}`,
    );
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    await updateJob(shopName, jobId, {
      status: "FAILED",
      errorMessage,
      errorStage: "TRANSLATE",
      claimedBy: null,
      stageTimings: withStageTiming(
        job.stageTimings,
        "TRANSLATE",
        stageStartedAt,
        new Date().toISOString(),
      ),
    });
    console.error(`[translate] failed job=${jobId}`, e);
  } finally {
    qps.stop();
    await wakeNextTranslateForShop(shopName).catch((e) => {
      console.warn(`[translate] wakeNext failed shop=${shopName}`, e);
    });
  }
}
