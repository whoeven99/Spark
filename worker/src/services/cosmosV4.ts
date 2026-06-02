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
  writebackTotal: number;
  writebackDone: number;
  writebackFailed: number;
  verifyTotal: number;
  verifyDone: number;
  verifyFailed: number;
  usedTokens: number;
};

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
  limitPerType: number;
  isCover: boolean;
  isHandle: boolean;
  testMode: boolean;
  status: TranslationV4Status;
  claimedBy: string | null;
  claimedAt: string | null;
  lastHeartbeat: string | null;
  blobPrefix: string;
  metrics: TranslationV4Metrics;
  errorMessage: string | null;
  errorStage: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

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
    >
  >,
): Promise<void> {
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
  } catch (e) {
    console.warn(`[cosmosV4] updateJob failed ${jobId}`, e);
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
export async function resetStaleJobs(staleMinutes = 10): Promise<void> {
  const threshold = new Date(Date.now() - staleMinutes * 60 * 1000).toISOString();
  const staleMap: Array<[TranslationV4Status, TranslationV4Status]> = [
    ["INITIALIZING", "INIT_QUEUED"],
    ["TRANSLATING", "TRANSLATE_QUEUED"],
    ["WRITING_BACK", "WRITEBACK_QUEUED"],
    ["VERIFYING", "VERIFY_QUEUED"],
  ];
  for (const [processingStatus, resetStatus] of staleMap) {
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
