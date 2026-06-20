import { hostname } from "os";
import { claimJob, updateJob, heartbeat, findPendingJobs, getJob, withStageTiming } from "../services/cosmosV4.js";
import { popHint, pushHint, setProgress, readControl, clearControl, getProgress } from "../services/redisV4.js";
import {
  deductTsfQuota,
  getTsfRemaining,
  quotaEnforceEnabled,
  quotaConcurrencyCap,
  quotaTokenMultiplier,
} from "../services/tsfQuota.js";
import { blobRead, blobWrite, blobListPaths } from "../services/blobV4.js";
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
} from "../services/llmTranslate.js";
import { QpsLogger } from "../services/qpsLogger.js";
import type { TranslationV4Job } from "../services/cosmosV4.js";

const HEARTBEAT_THROTTLE_MS = 30_000;

/** Scale-out safe: hostname + pid unique across Docker containers sharing pid=1 */
const WORKER_ID = `translate-${process.env.HOSTNAME ?? hostname()}-${process.pid}`;

export async function runTranslateWorker(): Promise<void> {
  const claimed = await claimNextJob();
  if (!claimed) return;
  console.log(`[translate] processing job=${claimed.id} testMode=${claimed.testMode}`);
  await processTranslateJob(claimed).catch((e) => {
    console.error(`[translate] job ${claimed.id} failed`, e);
  });
}

async function claimNextJob(): Promise<TranslationV4Job | null> {
  const hint = await popHint("translate");
  if (hint) {
    const job = await claimJob(hint.shopName, hint.taskId, "TRANSLATE_QUEUED", "TRANSLATING", WORKER_ID);
    if (job) return job;
  }
  const candidates = await findPendingJobs("TRANSLATE_QUEUED", 3);
  for (const candidate of candidates) {
    const job = await claimJob(candidate.shopName, candidate.id, "TRANSLATE_QUEUED", "TRANSLATING", WORKER_ID);
    if (job) return job;
  }
  return null;
}

// All chunks within a module are translated concurrently.
// The pool's AdaptiveSemaphore (driven by X-RateLimit-* headers) gates the
// actual LLM calls — no separate chunk concurrency knob is needed.

async function processTranslateJob(job: TranslationV4Job): Promise<void> {
  const { shopName, id: jobId, source, target, aiModel, testMode } = job;
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

  let translateDone = 0;
  let translateFailed = 0;
  let translateFallback = 0;
  let translateUnitDone = 0; // node-level progress
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

  if (testMode) {
    console.log(`[translate] TEST MODE: using original values as translations`);
  }

  // Write the start timestamp to Redis immediately so the UI can compute elapsed time.
  await setProgress(jobId, { translateStartedAt });

  // ── 中断信号 ──────────────────────────────────────────────────────────────
  // 外部手动暂停/取消（Redis 控制键）或额度耗尽（quota 申请失败）都汇入这里，
  // chunk 入口与 onProgress 检查到后优雅停止：不再起新 chunk，已在飞的自然跑完。
  const abort: { tripped: boolean; action: "pause" | "cancel"; reason: string } = {
    tripped: false,
    action: "pause",
    reason: "",
  };
  let lastControlCheckAt = 0;
  const CONTROL_CHECK_THROTTLE_MS = 4000;
  const tripAbort = (action: "pause" | "cancel", reason: string) => {
    if (abort.tripped) return;
    abort.tripped = true;
    abort.action = action;
    abort.reason = reason;
  };
  /** 读取外部控制键（节流），命中则置位 abort。 */
  const checkControl = async (force = false): Promise<void> => {
    if (abort.tripped) return;
    const now = Date.now();
    if (!force && now - lastControlCheckAt < CONTROL_CHECK_THROTTLE_MS) return;
    lastControlCheckAt = now;
    const ctrl = await readControl(jobId);
    if (ctrl === "pause") tripAbort("pause", "已手动暂停");
    else if (ctrl === "cancel") tripAbort("cancel", "已取消");
  };
  // 是否对本任务做额度校验：TsFrontend 默认开启（QUOTA_ENFORCE=false 可关），其它来源关闭。
  const enforceQuota = quotaEnforceEnabled(job.taskSource) && !testMode;
  const quotaMult = quotaTokenMultiplier();

  // 进入翻译前先按当前剩余额度设定该 shop 的并发上限（额度少→并发低）。
  // 剩余已 <=0 则直接暂停，一个 LLM 都不发。
  if (enforceQuota) {
    const remaining0 = await getTsfRemaining(shopName);
    if (remaining0 <= 0) {
      tripAbort("pause", "额度不足，已自动暂停");
    } else {
      setShopQuotaCap(shopName, quotaConcurrencyCap(remaining0));
    }
  }

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
    // 64 keeps near-every chunk active for typical stores while the pool still
    // protects the API from overload.
    const CHUNK_CONCURRENCY = Math.max(1, Number(process.env.TRANSLATE_CHUNK_CONCURRENCY) || 64);

    await pAll(work, CHUNK_CONCURRENCY, async ({ module, chunkPath, chunkIdx, chunkTotal }) => {
      {
        const chunkStart = performance.now();

        await heartbeat(shopName, jobId);

        // 中断检查：外部手动暂停/取消 → 不再处理新 chunk。
        await checkControl();
        if (abort.tripped) return;

        // Resume: skip chunks already translated in a prior run
        const translatePath = chunkPath.replace(`${blobPrefix}/init/`, `${blobPrefix}/translate/`);
        const existingTranslated = await blobRead<Array<{ resourceId: string }>>(translatePath);
        if (existingTranslated !== null) {
          translateDone += existingTranslated.length;
          // Re-count this chunk's units so node progress stays consistent on resume.
          const initChunk = await blobRead<Array<{ fields: TranslateItem[] }>>(chunkPath);
          if (initChunk) {
            for (const r of initChunk) for (const f of r.fields) translateUnitDone += countFieldUnits(f.key, f.value);
          }
          console.log(
            `[translate] job=${jobId} module=${module} chunk=${chunkIdx}/${chunkTotal} ` +
              `skip (already translated, ${existingTranslated.length} resources)`,
          );
          await setProgress(jobId, {
            translateDone,
            translateFailed,
            translateUnitDone,
            translateUnitTotal,
            translateTotal,
            currentModule: module,
          });
          return;
        }

        const chunk = await blobRead<Array<{ resourceId: string; fields: TranslateItem[] }>>(chunkPath);
        if (!chunk) return;

        const chunkResourceCount = chunk.length;
        const chunkFieldCount = chunk.reduce((sum, r) => sum + (r.fields?.length ?? 0), 0);
        console.log(
          `[translate] job=${jobId} module=${module} chunk=${chunkIdx}/${chunkTotal} ` +
            `resources=${chunkResourceCount} fields=${chunkFieldCount}`,
        );

        const resources = chunk.filter((r) => r.fields?.length);

        const translatedChunk = [];
        try {
          // Per-batch progress: write Redis every batch (cheap, smooth bar) and
          // heartbeat Cosmos throttled (expensive, just keep-alive).
          const onProgress = async (deltaUnits: number, deltaTokens: number) => {
            translateUnitDone += deltaUnits;
            liveTokens += Math.ceil(deltaTokens * tokenMultiplier);
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
            // Flush LLM key stats to Redis (throttled internally to ~10s intervals).
            await flushKeyStats();
            // QPS logger flush is throttled by its own 30s interval.
            qps.flush().catch(() => {});
            // 中途响应外部暂停/取消（节流读取控制键）。
            await checkControl();

            // 额度：每批按真实 token×系数 事后实扣，并据剩余额度动态调该 shop 并发上限。
            // 剩余为负 → 暂停（已在飞的调用继续完成，可接受）。
            if (enforceQuota && deltaTokens > 0) {
              const charge = Math.ceil(deltaTokens * quotaMult);
              const { ok, remaining } = await deductTsfQuota(shopName, charge);
              if (!ok) {
                // 额度服务异常：停止扩张并暂停，避免无账本超用。
                setShopQuotaCap(shopName, 1);
                tripAbort("pause", "额度服务异常，已自动暂停");
              } else {
                setShopQuotaCap(shopName, quotaConcurrencyCap(remaining));
                if (remaining < 0) tripAbort("pause", "额度不足，已自动暂停");
              }
            }
          };
          const { resources: perResource, usage } = await translateResources(
            resources.map((r) => ({ resourceId: r.resourceId, fields: r.fields })),
            source,
            target,
            aiModel,
            testMode,
            shopName,
            onProgress,
          );
          mergeEngineUsage(engineUsage, usage);
          for (const { resourceId, results } of perResource) {
            const orig = resources.find((r) => r.resourceId === resourceId);
            translatedChunk.push({
              resourceId,
              translations: results.map((r) => ({
                key: r.key,
                originalValue: orig?.fields.find((f) => f.key === r.key)?.value ?? "",
                translatedValue: r.translatedValue,
                digest: r.digest,
                status: r.status,
              })),
            });
            for (const r of results) {
              if (r.status === "fallback") {
                translateFallback++;
                fallbacks.push({ resourceId, module, key: r.key });
              }
            }
            translateDone++;
          }
        } catch (e) {
          translateFailed += resources.length;
          console.warn(`[translate] chunk ${chunkIdx}/${chunkTotal} failed`, e);
        }

        // Write to translate/ blob
        await blobWrite(translatePath, translatedChunk);

        const chunkElapsed = ((performance.now() - chunkStart) / 1000).toFixed(1);
        console.log(
          `[translate] job=${jobId} module=${module} chunk=${chunkIdx}/${chunkTotal} ` +
            `done translated=${translatedChunk.length} elapsed=${chunkElapsed}s doneSoFar=${translateDone}/${translateTotal}`,
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

    // Persist the list of fields that fell back to original for UI visibility.
    if (fallbacks.length > 0) {
      await blobWrite(`${blobPrefix}/translate/fallbacks.json`, fallbacks);
    }

    // Record the engine actually used (real data — job.aiModel is only the request).
    const engine = testMode
      ? { provider: "test", model: "test" }
      : resolveEngine(aiModel);

    // 被中断（手动暂停/取消 或 额度不足）：持久化已完成进度后停在 TRANSLATE，
    // 不进入回写。补额度/解除暂停后由 resume 重新入队，跳过已翻译 chunk 续跑。
    if (abort.tripped) {
      const latestAbort = await getJob(shopName, jobId);
      const redisUsedOnAbort = Number((await getProgress(jobId)).usedTokens) || 0;
      await updateJob(shopName, jobId, {
        status: abort.action === "cancel" ? "CANCELLED" : "PAUSED",
        claimedBy: null,
        errorStage: "TRANSLATE",
        errorMessage: abort.action === "cancel" ? null : abort.reason,
        stageTimings: withStageTiming(
          latestAbort?.stageTimings ?? job.stageTimings,
          "TRANSLATE",
          stageStartedAt,
          new Date().toISOString(),
        ),
        metrics: {
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
        },
      });
      await clearControl(jobId); // 消费掉控制信号，避免 resume 后立即再次暂停
      console.log(
        `[translate] job=${jobId} 已${abort.action === "cancel" ? "取消" : "暂停"}（${abort.reason}）done=${translateDone}/${translateTotal}`,
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
  }
}
