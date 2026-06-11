/**
 * Cosmos DB helpers for ShopAnalysisJob.
 *
 * Container: shop_analysis_jobs  (same DB as translation_v4_jobs)
 * Partition key: /shopName
 * Document id: shopName  — one active analysis per shop; upsert pattern.
 */
import { CosmosClient, type Container } from "@azure/cosmos";
import { hostname } from "os";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ShopAnalysisStatus =
  | "SCAN_QUEUED"
  | "SCANNING"
  | "ANALYZE_QUEUED"
  | "ANALYZING"
  | "COMPLETED"
  | "FAILED";

export type ShopAnalysisJob = {
  id: string;          // = shopName
  shopName: string;
  status: ShopAnalysisStatus;
  sourceLanguage: string;
  modules: string[];
  triggeredBy: string;
  claimedBy: string | null;
  claimedAt: string | null;
  lastHeartbeat: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  metrics: {
    scannedModules: number;
    scannedResources: number;
    analyzedChunks: number;
    glossaryDraftCount: number;
  };
  errorMessage: string | null;
};

// ── Container ─────────────────────────────────────────────────────────────────

let _client: CosmosClient | null = null;
let _ensureContainerPromise: Promise<Container> | null = null;

function getClient(): CosmosClient {
  if (!_client) {
    const endpoint = process.env.COSMOS_ENDPOINT?.trim();
    const key = process.env.COSMOS_KEY?.trim();
    if (!endpoint || !key) throw new Error("COSMOS_ENDPOINT and COSMOS_KEY are required");
    _client = new CosmosClient({ endpoint, key });
  }
  return _client;
}

function shopAnalysisDatabaseId(): string {
  return process.env.COSMOS_TRANSLATION_DATABASE_ID?.trim() || "translation";
}

function shopAnalysisContainerId(): string {
  return process.env.COSMOS_SHOP_ANALYSIS_CONTAINER?.trim() || "shop_analysis_jobs";
}

async function ensureContainer(): Promise<Container> {
  if (_ensureContainerPromise) return _ensureContainerPromise;

  _ensureContainerPromise = (async () => {
    const client = getClient();
    const { database } = await client.databases.createIfNotExists({
      id: shopAnalysisDatabaseId(),
    });
    const { container } = await database.containers.createIfNotExists({
      id: shopAnalysisContainerId(),
      partitionKey: { paths: ["/shopName"] },
    });
    return container;
  })();

  return _ensureContainerPromise;
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function getAnalysisJob(shopName: string): Promise<ShopAnalysisJob | null> {
  try {
    const container = await ensureContainer();
    const { resource } = await container.item(shopName, shopName).read<ShopAnalysisJob>();
    return resource ?? null;
  } catch {
    return null;
  }
}

/** Create or overwrite the analysis job for this shop. */
export async function upsertAnalysisJob(job: ShopAnalysisJob): Promise<ShopAnalysisJob> {
  const container = await ensureContainer();
  const { resource } = await container.items.upsert<ShopAnalysisJob>(job);
  return resource!;
}

export async function updateAnalysisJob(
  shopName: string,
  updates: Partial<Pick<ShopAnalysisJob, "status" | "claimedBy" | "claimedAt" | "lastHeartbeat" | "completedAt" | "metrics" | "errorMessage">>,
): Promise<void> {
  try {
    const container = await ensureContainer();
    const { resource: existing, etag } = await container
      .item(shopName, shopName)
      .read<ShopAnalysisJob>();
    if (!existing) return;
    const updated: ShopAnalysisJob = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    await container
      .item(shopName, shopName)
      .replace<ShopAnalysisJob>(updated, { accessCondition: { type: "IfMatch", condition: etag! } });
  } catch (e) {
    console.warn(`[cosmosAnalysis] updateAnalysisJob failed ${shopName}`, e);
  }
}

export async function heartbeatAnalysis(shopName: string): Promise<void> {
  await updateAnalysisJob(shopName, { lastHeartbeat: new Date().toISOString() });
}

/** Claim the job atomically: expected status → new status. Returns null on race. */
export async function claimAnalysisJob(
  shopName: string,
  expectedStatus: ShopAnalysisStatus,
  newStatus: ShopAnalysisStatus,
  workerId: string,
): Promise<ShopAnalysisJob | null> {
  try {
    const container = await ensureContainer();
    const { resource: existing, etag } = await container
      .item(shopName, shopName)
      .read<ShopAnalysisJob>();
    if (!existing || existing.status !== expectedStatus) return null;
    const now = new Date().toISOString();
    const updated: ShopAnalysisJob = {
      ...existing,
      status: newStatus,
      claimedBy: workerId,
      claimedAt: now,
      lastHeartbeat: now,
      updatedAt: now,
    };
    const { resource: saved } = await container
      .item(shopName, shopName)
      .replace<ShopAnalysisJob>(updated, { accessCondition: { type: "IfMatch", condition: etag! } });
    return saved ?? updated;
  } catch {
    return null;
  }
}

/** Find all jobs in a given status (cross-partition). */
export async function findAnalysisJobs(status: ShopAnalysisStatus, limit = 5): Promise<ShopAnalysisJob[]> {
  try {
    const container = await ensureContainer();
    const { resources } = await container
      .items.query<ShopAnalysisJob>({
        query: "SELECT * FROM c WHERE c.status = @status ORDER BY c.createdAt ASC OFFSET 0 LIMIT @limit",
        parameters: [{ name: "@status", value: status }, { name: "@limit", value: limit }],
      })
      .fetchAll();
    return resources;
  } catch (e) {
    console.warn(`[cosmosAnalysis] findAnalysisJobs(${status}) failed`, e);
    return [];
  }
}

/** Reset analysis jobs stuck in processing states (heartbeat stale > threshold). */
export async function resetStaleAnalysisJobs(staleMinutes = 60): Promise<void> {
  const threshold = new Date(Date.now() - staleMinutes * 60_000).toISOString();
  const staleMap: Array<[ShopAnalysisStatus, ShopAnalysisStatus]> = [
    ["SCANNING", "SCAN_QUEUED"],
    ["ANALYZING", "ANALYZE_QUEUED"],
  ];
  for (const [processing, reset] of staleMap) {
    try {
      const container = await ensureContainer();
      const { resources } = await container
        .items.query<ShopAnalysisJob>({
          query: `SELECT * FROM c WHERE c.status = @s AND (IS_NULL(c.lastHeartbeat) OR c.lastHeartbeat < @t) OFFSET 0 LIMIT 20`,
          parameters: [{ name: "@s", value: processing }, { name: "@t", value: threshold }],
        })
        .fetchAll();
      for (const job of resources) {
        await updateAnalysisJob(job.shopName, { status: reset, claimedBy: null, claimedAt: null })
          .catch(() => {});
      }
      if (resources.length > 0)
        console.log(`[cosmosAnalysis] reset ${resources.length} stale ${processing} → ${reset}`);
    } catch { /* best-effort */ }
  }
}

export const ANALYSIS_WORKER_ID =
  `analysis-${process.env.HOSTNAME ?? hostname()}-${process.pid}`;
