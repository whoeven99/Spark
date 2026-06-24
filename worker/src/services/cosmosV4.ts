import { CosmosClient, type Container } from "@azure/cosmos";

export type TranslationV4Status =
  | "CREATED"
  | "INIT_QUEUED"
  | "INITIALIZING"
  | "INIT_DONE"
  | "TRANSLATE_QUEUED"
  | "TRANSLATING"
  | "TRANSLATE_DONE"
  | "WRITEBACK_QUEUED"
  | "WRITING_BACK"
  | "VERIFY_QUEUED"
  | "VERIFYING"
  | "COMPLETED"
  | "FAILED"
  | "PAUSED"
  | "CANCELLED";

export type TranslationV4Metrics = {
  initTotal: number;
  initDone: number;
  translateTotal: number;
  translateDone: number;
  translateFailed: number;
  translateFallback: number;
  /** Node-level progress: total / done translation units (HTML nodes + plain parts). */
  translateUnitTotal: number;
  translateUnitDone: number;
  writebackTotal: number;
  writebackDone: number;
  writebackFailed: number;
  verifyTotal: number;
  verifyDone: number;
  verifyFailed: number;
  usedTokens: number;
  /** INIT 因限流等可恢复错误重新入队次数 */
  initRequeues?: number;
};

/** Pipeline stages, in execution order. */
export type StageName = "INIT" | "TRANSLATE" | "WRITEBACK" | "VERIFY";

/** Wall-clock span a worker spent in one stage. endedAt is null while running. */
export type StageTiming = { startedAt: string; endedAt: string | null };

export type StageTimings = Partial<Record<StageName, StageTiming>>;

/**
 * Merge a single stage's timing into the existing map. Each stage runs
 * sequentially (gated by status), so the claimed job already carries prior
 * stages' timings — spreading them keeps the full history.
 */
export function withStageTiming(
  existing: StageTimings | null | undefined,
  stage: StageName,
  startedAt: string,
  endedAt: string | null,
): StageTimings {
  return { ...(existing ?? {}), [stage]: { startedAt, endedAt } };
}

export type TranslationV4Job = {
  id: string;
  shopName: string;
  shopifyAccessToken: string;
  source: string;
  target: string;
  modules: string[];
  aiModel: string;
  /** The engine actually used at translate time (real data, set by the worker). */
  aiModelUsed: string | null;
  aiProvider: string | null;
  /** Per-engine-model breakdown of translated content (units + source chars). */
  engineUsage: Record<string, { units: number; chars: number }> | null;
  limitPerType: number;
  isCover: boolean;
  isHandle: boolean;
  /** 任务来源标识（如 "Ciwi-Translator-Task"）。旧任务可能缺省。 */
  taskSource?: string | null;
  status: TranslationV4Status;
  claimedBy: string | null;
  claimedAt: string | null;
  lastHeartbeat: string | null;
  blobPrefix: string;
  metrics: TranslationV4Metrics;
  /** Per-stage wall-clock spans, written by each worker. Absent on older jobs. */
  stageTimings?: StageTimings | null;
  errorMessage: string | null;
  errorStage: string | null;
  /**
   * 翻译中途被暂停/取消时：先把已翻译的写回 Shopify，再据此决定写回完成后的终态
   * （"pause"→PAUSED 可续译，"cancel"→CANCELLED）。普通写回为 null/缺省。
   */
  pauseAfterWriteback?: "pause" | "cancel" | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

/** 任务来源：来自 TSF 独立前端的任务。 */
export const TS_FRONTEND_TASK_SOURCE = "TsFrontend";

/** 任务来源：worker 定时扫描自动创建的「自动更新」任务（isCover=false）。 */
export const TSF_AUTO_TASK_SOURCE = "TsFrontend-Auto";

/**
 * 该任务的 Shopify token 是否应直接取 job 快照（跳过 Turso Session 查询）。
 * 外部来源（TsFrontend / 自动任务）的 shop Session 不在本服务的 Turso 里，必须用 job 里存的 token。
 */
export function prefersStoredToken(job: Pick<TranslationV4Job, "taskSource">): boolean {
  return (
    job.taskSource === TS_FRONTEND_TASK_SOURCE ||
    job.taskSource === TSF_AUTO_TASK_SOURCE
  );
}

/** 全零指标，新建任务用。 */
export const EMPTY_V4_METRICS: TranslationV4Metrics = {
  initTotal: 0,
  initDone: 0,
  translateTotal: 0,
  translateDone: 0,
  translateFailed: 0,
  translateFallback: 0,
  translateUnitTotal: 0,
  translateUnitDone: 0,
  writebackTotal: 0,
  writebackDone: 0,
  writebackFailed: 0,
  verifyTotal: 0,
  verifyDone: 0,
  verifyFailed: 0,
  usedTokens: 0,
};

/** 进行中（非终态）状态，用于创建前互斥判断。 */
const ACTIVE_V4_STATUSES: TranslationV4Status[] = [
  "CREATED",
  "INIT_QUEUED",
  "INITIALIZING",
  "INIT_DONE",
  "TRANSLATE_QUEUED",
  "TRANSLATING",
  "TRANSLATE_DONE",
  "WRITEBACK_QUEUED",
  "WRITING_BACK",
  "VERIFY_QUEUED",
  "VERIFYING",
];

type CreateJobInput = Omit<
  TranslationV4Job,
  | "metrics"
  | "claimedBy"
  | "claimedAt"
  | "lastHeartbeat"
  | "errorMessage"
  | "errorStage"
  | "stageTimings"
  | "createdAt"
  | "updatedAt"
  | "aiModelUsed"
  | "aiProvider"
  | "engineUsage"
>;

/** 新建一个 v4 任务文档（upsert）。 */
export async function createJob(input: CreateJobInput): Promise<TranslationV4Job> {
  const now = new Date().toISOString();
  const doc: TranslationV4Job = {
    ...input,
    metrics: { ...EMPTY_V4_METRICS },
    aiModelUsed: null,
    aiProvider: null,
    engineUsage: null,
    claimedBy: null,
    claimedAt: null,
    lastHeartbeat: null,
    errorMessage: null,
    errorStage: null,
    createdAt: now,
    updatedAt: now,
  };
  await getContainer().items.upsert(doc);
  return doc;
}

/** 同 shop + target 是否已有进行中的任务（避免自动扫描重复建任务）。 */
export async function hasActiveJobForTarget(
  shopName: string,
  source: string,
  target: string,
): Promise<boolean> {
  try {
    const { resources } = await getContainer()
      .items.query<number>(
        {
          query:
            "SELECT VALUE COUNT(1) FROM c WHERE c.shopName = @shopName AND c.source = @source AND c.target = @target AND ARRAY_CONTAINS(@statuses, c.status)",
          parameters: [
            { name: "@shopName", value: shopName },
            { name: "@source", value: source },
            { name: "@target", value: target },
            { name: "@statuses", value: ACTIVE_V4_STATUSES },
          ],
        },
        { partitionKey: shopName },
      )
      .fetchAll();
    return (resources[0] ?? 0) > 0;
  } catch {
    return false;
  }
}

let _client: CosmosClient | null = null;

function getClient(): CosmosClient {
  if (!_client) {
    const endpoint = process.env.COSMOS_ENDPOINT?.trim();
    const key = process.env.COSMOS_KEY?.trim();
    if (!endpoint || !key) throw new Error("COSMOS_ENDPOINT and COSMOS_KEY are required");
    _client = new CosmosClient({ endpoint, key });
  }
  return _client;
}

function getContainer(): Container {
  const dbId = process.env.COSMOS_TRANSLATION_DATABASE_ID?.trim() || "translation";
  const containerId =
    process.env.COSMOS_TRANSLATION_V4_JOBS_CONTAINER?.trim() || "translation_v4_jobs";
  return getClient().database(dbId).container(containerId);
}

export async function getJob(shopName: string, jobId: string): Promise<TranslationV4Job | null> {
  try {
    const { resource } = await getContainer()
      .item(jobId, shopName)
      .read<TranslationV4Job>();
    return resource ?? null;
  } catch {
    return null;
  }
}

/** Atomically claim a job: expectedStatus → newStatus with etag. Returns null if status mismatch. */
export async function claimJob(
  shopName: string,
  jobId: string,
  expectedStatus: TranslationV4Status,
  newStatus: TranslationV4Status,
  claimedBy: string,
): Promise<TranslationV4Job | null> {
  try {
    const { resource: existing, etag } = await getContainer()
      .item(jobId, shopName)
      .read<TranslationV4Job>();
    if (!existing || existing.status !== expectedStatus) return null;
    const now = new Date().toISOString();
    const updated: TranslationV4Job = {
      ...existing,
      status: newStatus,
      claimedBy,
      claimedAt: now,
      lastHeartbeat: now,
      updatedAt: now,
    };
    const { resource: saved } = await getContainer()
      .item(jobId, shopName)
      .replace<TranslationV4Job>(updated, {
        accessCondition: { type: "IfMatch", condition: etag! },
      });
    return saved ?? updated;
  } catch {
    return null;
  }
}

function isCosmosPreconditionFailed(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { code?: number | string; statusCode?: number; message?: string };
  if (e.code === 412 || e.statusCode === 412 || e.code === "PreconditionFailed") {
    return true;
  }
  const message = e.message ?? "";
  return /precondition/i.test(message);
}

export async function updateJob(
  shopName: string,
  jobId: string,
  updates: Partial<
    Pick<
      TranslationV4Job,
      | "status"
      | "claimedBy"
      | "claimedAt"
      | "lastHeartbeat"
      | "metrics"
      | "errorMessage"
      | "errorStage"
      | "blobPrefix"
      | "aiModelUsed"
      | "aiProvider"
      | "engineUsage"
      | "stageTimings"
      | "pauseAfterWriteback"
    >
  >,
): Promise<void> {
  const maxAttempts = 5;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const { resource: existing, etag } = await getContainer()
        .item(jobId, shopName)
        .read<TranslationV4Job>();
      if (!existing) return;
      const updated: TranslationV4Job = {
        ...existing,
        ...updates,
        updatedAt: new Date().toISOString(),
      };
      await getContainer()
        .item(jobId, shopName)
        .replace<TranslationV4Job>(updated, {
          accessCondition: { type: "IfMatch", condition: etag! },
        });
      return;
    } catch (e) {
      if (isCosmosPreconditionFailed(e) && attempt < maxAttempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 50 * 2 ** attempt));
        continue;
      }
      console.warn(`[cosmosV4] updateJob failed ${jobId}`, e);
      return;
    }
  }
}

/** Count jobs currently in INIT for a shop (serial init queue per shop). */
export async function countShopInitializingJobs(shopName: string): Promise<number> {
  try {
    const { resources } = await getContainer()
      .items.query<number>(
        {
          query:
            "SELECT VALUE COUNT(1) FROM c WHERE c.shopName = @shopName AND c.status = @status",
          parameters: [
            { name: "@shopName", value: shopName },
            { name: "@status", value: "INITIALIZING" },
          ],
        },
        { partitionKey: shopName },
      )
      .fetchAll();
    const n = resources[0];
    return typeof n === "number" && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

/** Oldest INIT_QUEUED jobs for a shop (serial init queue). */
export async function findInitQueuedJobsForShop(
  shopName: string,
  limit = 1,
): Promise<TranslationV4Job[]> {
  try {
    const { resources } = await getContainer()
      .items.query<TranslationV4Job>(
        {
          query:
            "SELECT * FROM c WHERE c.shopName = @shopName AND c.status = @status ORDER BY c.createdAt ASC OFFSET 0 LIMIT @limit",
          parameters: [
            { name: "@shopName", value: shopName },
            { name: "@status", value: "INIT_QUEUED" },
            { name: "@limit", value: limit },
          ],
        },
        { partitionKey: shopName },
      )
      .fetchAll();
    return resources;
  } catch {
    return [];
  }
}

/** Count jobs currently in TRANSLATE for a shop (used to fair-share LLM concurrency). */
export async function countShopTranslatingJobs(shopName: string): Promise<number> {
  try {
    const { resources } = await getContainer()
      .items.query<number>(
        {
          query:
            "SELECT VALUE COUNT(1) FROM c WHERE c.shopName = @shopName AND c.status = @status",
          parameters: [
            { name: "@shopName", value: shopName },
            { name: "@status", value: "TRANSLATING" },
          ],
        },
        { partitionKey: shopName },
      )
      .fetchAll();
    const n = resources[0];
    return typeof n === "number" && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

/** Oldest TRANSLATE_QUEUED jobs for a shop (serial translate queue). */
export async function findTranslateQueuedJobsForShop(
  shopName: string,
  limit = 1,
): Promise<TranslationV4Job[]> {
  try {
    const { resources } = await getContainer()
      .items.query<TranslationV4Job>(
        {
          query:
            "SELECT * FROM c WHERE c.shopName = @shopName AND c.status = @status ORDER BY c.createdAt ASC OFFSET 0 LIMIT @limit",
          parameters: [
            { name: "@shopName", value: shopName },
            { name: "@status", value: "TRANSLATE_QUEUED" },
            { name: "@limit", value: limit },
          ],
        },
        { partitionKey: shopName },
      )
      .fetchAll();
    return resources;
  } catch {
    return [];
  }
}

/** Heartbeat: update lastHeartbeat timestamp to signal the job is still alive. */
export async function heartbeat(shopName: string, jobId: string): Promise<void> {
  await updateJob(shopName, jobId, { lastHeartbeat: new Date().toISOString() });
}

/** Find pending jobs for a given stage (cross-partition query). */
export async function findPendingJobs(
  queuedStatus: TranslationV4Status,
  limit = 5,
): Promise<TranslationV4Job[]> {
  try {
    const { resources } = await getContainer()
      .items.query<TranslationV4Job>({
        query:
          "SELECT * FROM c WHERE c.status = @status ORDER BY c.createdAt ASC OFFSET 0 LIMIT @limit",
        parameters: [
          { name: "@status", value: queuedStatus },
          { name: "@limit", value: limit },
        ],
      })
      .fetchAll();
    return resources;
  } catch {
    return [];
  }
}

/** Find jobs stuck in processing states past the stale threshold and reset them. */
/** 处理中状态 → 重新入队状态。stale-reset 与优雅停机释放都用它。 */
const PROCESSING_TO_QUEUED: Array<[TranslationV4Status, TranslationV4Status]> = [
  ["INITIALIZING", "INIT_QUEUED"],
  ["TRANSLATING", "TRANSLATE_QUEUED"],
  ["WRITING_BACK", "WRITEBACK_QUEUED"],
  ["VERIFYING", "VERIFY_QUEUED"],
];

/**
 * 优雅停机：把本进程（claimedBy 以 host+pid 后缀结尾）正在处理中的任务，
 * 立刻重新入队（claimedBy=null），让新部署的 worker 马上接着跑，不必等 10 分钟 stale-reset。
 * 覆盖全部 4 个阶段。返回释放数量。
 */
export async function releaseJobsClaimedBySuffix(claimSuffix: string): Promise<number> {
  let released = 0;
  for (const [processingStatus, resetStatus] of PROCESSING_TO_QUEUED) {
    try {
      const { resources } = await getContainer()
        .items.query<TranslationV4Job>({
          query:
            "SELECT * FROM c WHERE c.status = @status AND IS_DEFINED(c.claimedBy) AND ENDSWITH(c.claimedBy, @suffix) OFFSET 0 LIMIT 50",
          parameters: [
            { name: "@status", value: processingStatus },
            { name: "@suffix", value: claimSuffix },
          ],
        })
        .fetchAll();
      for (const job of resources) {
        await updateJob(job.shopName, job.id, {
          status: resetStatus,
          claimedBy: null,
          claimedAt: null,
        }).catch(() => {});
        released++;
        console.log(`[shutdown] release ${job.id} ${processingStatus} → ${resetStatus}`);
      }
    } catch (e) {
      console.warn(`[shutdown] release error for ${processingStatus}`, e);
    }
  }
  return released;
}

export async function resetStaleJobs(
  staleMinutes = Number(process.env.STALE_TIMEOUT_MINUTES) || 10,
): Promise<void> {
  const threshold = new Date(Date.now() - staleMinutes * 60 * 1000).toISOString();
  for (const [processingStatus, resetStatus] of PROCESSING_TO_QUEUED) {
    try {
      const { resources } = await getContainer()
        .items.query<TranslationV4Job>({
          query: `SELECT * FROM c WHERE c.status = @status AND (IS_NULL(c.lastHeartbeat) OR c.lastHeartbeat < @threshold) OFFSET 0 LIMIT 20`,
          parameters: [
            { name: "@status", value: processingStatus },
            { name: "@threshold", value: threshold },
          ],
        })
        .fetchAll();
      for (const job of resources) {
        await updateJob(job.shopName, job.id, {
          status: resetStatus,
          claimedBy: null,
          claimedAt: null,
        }).catch(() => {});
        console.log(`[cosmosV4] reset stale: ${job.id} ${processingStatus} → ${resetStatus}`);
      }
    } catch (e) {
      console.warn(`[cosmosV4] resetStale error for ${processingStatus}`, e);
    }
  }
}
