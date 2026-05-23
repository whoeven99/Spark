import { claimJob, updateJob, heartbeat, findPendingJobs } from "../services/cosmosV4.js";
import { popHint, pushHint, setProgress } from "../services/redisV4.js";
import { blobWrite } from "../services/blobV4.js";
import { fetchTranslatableResources } from "../services/shopifyFetch.js";

const WORKER_ID = `init-${process.pid}`;
const CHUNK_SIZE = 50;

export async function runInitWorker(): Promise<void> {
  // Check hint queue first, then fall back to CosmosDB scan
  const hints = await drainHints();
  const jobs = hints.length > 0
    ? (await Promise.all(hints.map((h) => claimJob(h.shopName, h.taskId, "INIT_QUEUED", "INITIALIZING", WORKER_ID)))).filter(Boolean)
    : (await findPendingJobs("INIT_QUEUED", 3))
        .map((j) => undefined as never) // claim below
        .slice(0, 0); // replaced by the next block

  const pending = hints.length > 0
    ? jobs.filter((j) => j !== null)
    : await claimPendingJobs("INIT_QUEUED", 3);

  for (const job of pending) {
    if (!job) continue;
    console.log(`[init] processing job ${job.id} shop=${job.shopName}`);
    await processInitJob(job.id, job.shopName).catch((e) => {
      console.error(`[init] job ${job.id} failed`, e);
    });
  }
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
  return claimed.filter((j) => j !== null);
}

async function processInitJob(jobId: string, shopName: string): Promise<void> {
  const { getJob } = await import("../services/cosmosV4.js");
  const job = await getJob(shopName, jobId);
  if (!job) return;

  const shopDomain = job.shopName;
  const blobPrefix = `tasks/v4/${shopName}/${jobId}`;

  await updateJob(shopName, jobId, { blobPrefix, status: "INITIALIZING" });

  const manifest: Record<string, { totalItems: number; chunks: number }> = {};
  let totalItems = 0;

  try {
    for (const module of job.modules) {
      await heartbeat(shopName, jobId);

      console.log(`[init] fetching module=${module} job=${jobId}`);
      const chunks = await fetchTranslatableResources(
        shopDomain,
        job.shopifyAccessToken,
        module,
        job.limitPerType,
        CHUNK_SIZE,
      );

      for (let i = 0; i < chunks.length; i++) {
        const chunkPath = `${blobPrefix}/init/${module}/chunk-${String(i).padStart(2, "0")}.json`;
        await blobWrite(chunkPath, chunks[i]);
      }

      const moduleItemCount = chunks.reduce((sum, c) => sum + c.length, 0);
      manifest[module] = { totalItems: moduleItemCount, chunks: chunks.length };
      totalItems += moduleItemCount;

      await setProgress(jobId, {
        initDone: totalItems,
        currentModule: module,
      });

      await heartbeat(shopName, jobId);
    }

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
      metrics: {
        ...job.metrics,
        initTotal: totalItems,
        initDone: totalItems,
        translateTotal: totalItems,
      },
    });

    await setProgress(jobId, { initTotal: totalItems, initDone: totalItems });

    // Push hint to translate stage for immediate pickup
    await pushHint("translate", { taskId: jobId, shopName });
    console.log(`[init] done job=${jobId} totalItems=${totalItems}`);
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    await updateJob(shopName, jobId, {
      status: "FAILED",
      errorMessage,
      errorStage: "INIT",
      claimedBy: null,
    });
    console.error(`[init] failed job=${jobId}`, e);
  }
}
