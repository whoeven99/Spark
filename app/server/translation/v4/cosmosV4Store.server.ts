import { CosmosClient, type Container } from "@azure/cosmos";
import { sameTranslationLocale } from "./localeUtils";
import {
  EMPTY_V4_METRICS,
  type TranslationV4Job,
  type TranslationV4Metrics,
  type TranslationV4Status,
} from "./types";

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

export async function createV4Job(
  input: Omit<
    TranslationV4Job,
    | "metrics"
    | "claimedBy"
    | "claimedAt"
    | "lastHeartbeat"
    | "errorMessage"
    | "errorStage"
    | "createdAt"
    | "updatedAt"
    | "aiModelUsed"
    | "aiProvider"
  > & { metrics?: Partial<TranslationV4Metrics> },
): Promise<TranslationV4Job> {
  const now = new Date().toISOString();
  const doc: TranslationV4Job = {
    ...input,
    metrics: { ...EMPTY_V4_METRICS, ...input.metrics },
    aiModelUsed: null,
    aiProvider: null,
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

export async function getV4Job(
  shopName: string,
  jobId: string,
): Promise<TranslationV4Job | null> {
  try {
    const { resource } = await getContainer()
      .item(jobId, shopName)
      .read<TranslationV4Job>();
    return resource ?? null;
  } catch {
    return null;
  }
}

/** 同 shop + source + target 是否存在阻塞态任务（用于创建前互斥）。 */
export async function existsBlockingV4Job(
  shopName: string,
  source: string,
  target: string,
  blockingStatuses: TranslationV4Status[],
): Promise<boolean> {
  if (!blockingStatuses.length) return false;

  try {
    const { resources } = await getContainer()
      .items.query<TranslationV4Job>(
        {
          query:
            "SELECT c.source, c.target, c.status FROM c WHERE c.shopName = @shopName AND ARRAY_CONTAINS(@blockingStatuses, c.status)",
          parameters: [
            { name: "@shopName", value: shopName },
            { name: "@blockingStatuses", value: blockingStatuses },
          ],
        },
        { partitionKey: shopName },
      )
      .fetchAll();

    return resources.some(
      (job) =>
        sameTranslationLocale(job.source, source) &&
        sameTranslationLocale(job.target, target),
    );
  } catch {
    return false;
  }
}

export async function listV4Jobs(shopName: string, limit = 50): Promise<TranslationV4Job[]> {
  try {
    const { resources } = await getContainer()
      .items.query<TranslationV4Job>(
        {
          query:
            "SELECT * FROM c WHERE c.shopName = @shopName ORDER BY c.createdAt DESC OFFSET 0 LIMIT @limit",
          parameters: [
            { name: "@shopName", value: shopName },
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

export type UpdateV4JobInput = Partial<
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
>;

export async function updateV4Job(
  shopName: string,
  jobId: string,
  updates: UpdateV4JobInput,
): Promise<TranslationV4Job | null> {
  try {
    const { resource: existing, etag } = await getContainer()
      .item(jobId, shopName)
      .read<TranslationV4Job>();
    if (!existing) return null;
    const updated: TranslationV4Job = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
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

/** Atomically claim a job by moving it from expectedStatus → newStatus using etag. */
export async function claimV4Job(
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
