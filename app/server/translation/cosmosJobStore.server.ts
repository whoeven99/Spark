import { CosmosClient, type Container } from "@azure/cosmos";
import type {
  TranslationJobRecord,
  TranslationJobStatus,
  TranslationTaskCheckpoint,
  TranslationTaskMetrics,
} from "./types";

type CreateJobInput = {
  id: string;
  shop: string;
  sourceLocale: string;
  targetLocale: string;
  taskType?: string;
  aiModel?: string;
  isCover?: boolean;
  isHandle?: boolean;
  moduleList?: string[];
  sessionId?: string;
  checkpoint?: TranslationTaskCheckpoint;
  metrics?: TranslationTaskMetrics;
  resourceTypes: string[];
  limitPerType: number;
  createdBy: string;
  /** Shopify Admin API token（来自 Turso Session）；仅写入 Cosmos，不下发前端。 */
  accessToken?: string;
};

type UpdateJobInput = {
  status?: TranslationJobStatus;
  taskType?: string;
  aiModel?: string;
  isCover?: boolean;
  isHandle?: boolean;
  moduleList?: string[];
  sessionId?: string;
  checkpoint?: TranslationTaskCheckpoint;
  metrics?: TranslationTaskMetrics;
  totalItems?: number;
  fetchedItems?: number;
  errorMessage?: string | null;
};

/**
 * Cosmos 翻译任务文档。
 * 线上容器 `translation_jobs` 分区键为 `/shop`（非 `/shopName`）；老文档可能仅有 `shopName` 而无 `shop`，此时物理分区为 undefined。
 */
export type TranslationJobDoc = {
  id: string;
  /** 与容器分区键 `/shop` 对齐；新建任务应与 shopName 同值 */
  shop?: string;
  shopName: string;
  source: string;
  target: string;
  status: number;
  statusText: string;
  taskType: string;
  aiModel: string;
  moduleList: string;
  sessionId: string;
  checkpoint: TranslationTaskCheckpoint;
  metrics: TranslationTaskMetrics;
  createdAt: string;
  updatedAt: string;
  handle: boolean;
  cover: boolean;
  accessToken?: string;
};

const STATUS_META: Record<TranslationJobStatus, { code: number; text: string }> = {
  PENDING: { code: 0, text: "INIT_PENDING" },
  FETCHING: { code: 1, text: "INIT_READING_SHOPIFY" },
  FETCHED: { code: 2, text: "INIT_DONE" },
  TRANSLATING: { code: 3, text: "TRANSLATE_RUNNING" },
  PAUSED: { code: 4, text: "TRANSLATE_STOPPED_MANUAL" },
  TRANSLATED: { code: 5, text: "TRANSLATE_DONE" },
  WRITING_BACK: { code: 6, text: "SAVE_RUNNING" },
  COMPLETED: { code: 7, text: "SAVE_DONE" },
  FAILED: { code: 8, text: "FAILED" },
};

const STATUS_TEXT_TO_APP: Record<string, TranslationJobStatus> = {
  INIT_PENDING: "PENDING",
  INIT_READING_SHOPIFY: "FETCHING",
  INIT_DONE: "FETCHED",
  TRANSLATE_RUNNING: "TRANSLATING",
  TRANSLATE_STOPPED_MANUAL: "PAUSED",
  TRANSLATE_DONE: "TRANSLATED",
  SAVE_RUNNING: "WRITING_BACK",
  SAVE_DONE: "COMPLETED",
  FAILED: "FAILED",
};

const STATUS_CODE_TO_APP: Record<number, TranslationJobStatus> = {
  0: "PENDING",
  1: "FETCHING",
  2: "FETCHED",
  3: "TRANSLATING",
  4: "PAUSED",
  5: "TRANSLATED",
  6: "WRITING_BACK",
  7: "COMPLETED",
  8: "FAILED",
};

export type TranslationCosmosTarget = {
  databaseId: string;
  containerId: string;
};

/** Spark 默认数据位置（sparkcosmostest → translation / translation_jobs） */
const SPARK_TRANSLATION_COSMOS_TARGET: TranslationCosmosTarget = {
  databaseId: "translation",
  containerId: "translation_jobs",
};

const LOG_PREFIX = "[TranslationCosmos]";

function logTranslationCosmos(message: string, extra?: Record<string, unknown>) {
  if (extra && Object.keys(extra).length > 0) {
    console.log(`${LOG_PREFIX} ${message}`, extra);
  } else {
    console.log(`${LOG_PREFIX} ${message}`);
  }
}

let cosmosClientPromise: Promise<CosmosClient> | null = null;
const containerPromises = new Map<string, Promise<Container>>();

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`缺少环境变量 ${name}`);
  return value;
}

function nowIso() {
  return new Date().toISOString();
}

function parseModuleList(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) return parsed.filter((item) => typeof item === "string");
  } catch {
    // ignore parse errors
  }
  return [];
}

function mapStatusFromDoc(doc: TranslationJobDoc): TranslationJobStatus {
  if (STATUS_TEXT_TO_APP[doc.statusText]) return STATUS_TEXT_TO_APP[doc.statusText];
  if (STATUS_CODE_TO_APP[doc.status]) return STATUS_CODE_TO_APP[doc.status];
  return "PENDING";
}

function readNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function mapJob(doc: TranslationJobDoc): TranslationJobRecord {
  const status = mapStatusFromDoc(doc);
  const moduleList = parseModuleList(doc.moduleList);
  const metrics = (doc.metrics ?? {}) as Record<string, unknown>;
  const checkpoint = (doc.checkpoint ?? {}) as Record<string, unknown>;
  const totalItems = readNumber(metrics.totalCount, 0);
  const fetchedItems = readNumber(metrics.fetchedItems, totalItems);
  return {
    id: doc.id,
    shop: doc.shopName,
    status,
    sourceLocale: doc.source,
    targetLocale: doc.target,
    taskType: doc.taskType ?? "manual",
    aiModel: doc.aiModel ?? "gpt-4.1-nano",
    isCover: doc.cover ?? false,
    isHandle: doc.handle ?? false,
    moduleList,
    sessionId: doc.sessionId ?? `${doc.shopName}:${doc.id}`,
    checkpoint: doc.checkpoint ?? {},
    metrics: doc.metrics ?? {},
    resourceTypes: moduleList,
    limitPerType: readNumber(checkpoint.limitPerType, 20),
    totalItems,
    fetchedItems,
    errorMessage:
      typeof checkpoint.errorMessage === "string" && checkpoint.errorMessage.length > 0
        ? checkpoint.errorMessage
        : null,
    createdBy: doc.shopName,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function toCosmosDoc(record: TranslationJobRecord, previous?: TranslationJobDoc): TranslationJobDoc {
  const meta = STATUS_META[record.status] ?? STATUS_META.PENDING;
  const prevCheckpoint = (previous?.checkpoint ?? {}) as Record<string, unknown>;
  const nextCheckpoint: Record<string, unknown> = {
    ...prevCheckpoint,
    ...record.checkpoint,
    limitPerType: record.limitPerType,
  };
  if (record.errorMessage) {
    nextCheckpoint.errorMessage = record.errorMessage;
  } else {
    delete nextCheckpoint.errorMessage;
  }

  const prevMetrics = (previous?.metrics ?? {}) as Record<string, unknown>;
  const nextMetrics = {
    ...prevMetrics,
    usedToken: readNumber(prevMetrics.usedToken, 0),
    savedCount: readNumber((record.metrics as Record<string, unknown>).savedCount, 0),
    translatedCount: readNumber((record.metrics as Record<string, unknown>).translatedCount, 0),
    ...record.metrics,
    totalCount: record.totalItems,
    fetchedItems: record.fetchedItems,
  };

  return {
    id: record.id,
    shop: record.shop,
    shopName: record.shop,
    source: record.sourceLocale,
    target: record.targetLocale,
    status: meta.code,
    statusText: meta.text,
    taskType: record.taskType,
    aiModel: record.aiModel,
    moduleList: JSON.stringify(record.moduleList ?? record.resourceTypes ?? []),
    sessionId: record.sessionId,
    checkpoint: nextCheckpoint,
    metrics: nextMetrics,
    createdAt: previous?.createdAt ?? record.createdAt,
    updatedAt: record.updatedAt,
    handle: record.isHandle,
    cover: record.isCover,
  };
}

function cosmosEndpointHost(): string {
  const endpoint = process.env.COSMOS_ENDPOINT?.trim() || "";
  try {
    return new URL(endpoint).hostname;
  } catch {
    return endpoint ? endpoint.slice(0, 48) : "";
  }
}

/** 环境变量优先，否则 Spark 默认 translation / translation_jobs */
export function resolveTranslationCosmosConfig(): TranslationCosmosTarget {
  const databaseId =
    process.env.COSMOS_TRANSLATION_DATABASE_ID?.trim() ||
    SPARK_TRANSLATION_COSMOS_TARGET.databaseId;
  const containerId =
    process.env.COSMOS_TRANSLATION_JOBS_CONTAINER?.trim() ||
    SPARK_TRANSLATION_COSMOS_TARGET.containerId;
  return { databaseId, containerId };
}

export function getTranslationCosmosMeta() {
  const target = resolveTranslationCosmosConfig();
  return {
    endpointHost: cosmosEndpointHost(),
    databaseId: target.databaseId,
    containerId: target.containerId,
    partitionKeyPath: "/shop",
  };
}

async function getCosmosClient() {
  if (!cosmosClientPromise) {
    cosmosClientPromise = Promise.resolve(
      new CosmosClient({
        endpoint: getRequiredEnv("COSMOS_ENDPOINT"),
        key: getRequiredEnv("COSMOS_KEY"),
      }),
    );
  }
  return cosmosClientPromise;
}

async function getJobsContainerForTarget(target: TranslationCosmosTarget) {
  const cacheKey = `${target.databaseId}/${target.containerId}`;
  let promise = containerPromises.get(cacheKey);
  if (!promise) {
    promise = (async () => {
      const client = await getCosmosClient();
      const { database } = await client.databases.createIfNotExists({ id: target.databaseId });
      const { container } = await database.containers.createIfNotExists({
        id: target.containerId,
        partitionKey: { paths: ["/shop"] },
      });
      return container;
    })();
    containerPromises.set(cacheKey, promise);
  }
  return promise;
}

/** 创建/更新任务使用的容器（环境变量主配置） */
async function getJobsContainer() {
  return getJobsContainerForTarget(resolveTranslationCosmosConfig());
}

/** 与 Cosmos 容器分区键路径 `/shop` 一致；缺 `shop` 的老文档物理分区为 undefined */
export function cosmosPartitionKeyForDoc(doc: TranslationJobDoc): string | undefined {
  const shop = doc.shop?.trim();
  if (shop) return shop;
  return undefined;
}

async function readJobDocWithPartitionKey(
  jobs: Container,
  jobId: string,
  partitionKey: string | undefined,
): Promise<TranslationJobDoc | null> {
  try {
    const { resource } = await jobs.item(jobId, partitionKey).read<TranslationJobDoc>();
    return resource ?? null;
  } catch (error) {
    const code = (error as { code?: number })?.code;
    const status = (error as { statusCode?: number })?.statusCode;
    if (code === 404 || status === 404) {
      return null;
    }
    logTranslationCosmos("readJobDocWithPartitionKey failed", {
      jobId,
      partitionKey: partitionKey ?? "(undefined)",
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function readJobDoc(shop: string, jobId: string) {
  const cleanShop = shop.trim();
  const cleanId = jobId.trim();
  if (!cleanId) return null;
  const jobs = await getJobsContainer();
  const partitionAttempts: (string | undefined)[] = cleanShop
    ? [cleanShop, undefined]
    : [undefined];
  for (const pk of partitionAttempts) {
    const doc = await readJobDocWithPartitionKey(jobs, cleanId, pk);
    if (doc) return doc;
  }
  return null;
}

/** 按 id 跨分区查询（与 AgentTask listByTaskId 一致） */
export async function findTranslationJobsById(jobId: string): Promise<TranslationJobDoc[]> {
  const cleanId = jobId.trim();
  if (!cleanId) return [];
  const jobs = await getJobsContainer();
  const target = resolveTranslationCosmosConfig();
  const sql = "SELECT * FROM c WHERE c.id = @id";
  const startedAt = Date.now();
  try {
    const { resources } = await jobs.items
      .query<TranslationJobDoc>({
        query: sql,
        parameters: [{ name: "@id", value: cleanId }],
      })
      .fetchAll();
    const items = resources ?? [];
    logTranslationCosmos("findTranslationJobsById", {
      ...target,
      jobId: cleanId,
      count: items.length,
      elapsedMs: Date.now() - startedAt,
      shopNames: items.map((d) => d.shopName),
    });
    return items;
  } catch (error) {
    logTranslationCosmos("findTranslationJobsById failed", {
      ...target,
      jobId: cleanId,
      elapsedMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/**
 * 解析任务文档：先按 shop 点读，失败则跨分区按 id 查（分区键与传入 shop 不一致时仍可命中）。
 */
export async function resolveTranslationJobDocument(
  shop: string,
  jobId: string,
): Promise<{ doc: TranslationJobDoc; resolvedVia: "partition" | "crossPartition" } | null> {
  const cleanId = jobId.trim();
  const cleanShop = shop.trim();
  if (!cleanId) return null;

  if (cleanShop) {
    const direct = await readJobDoc(cleanShop, cleanId);
    if (direct) {
      return { doc: direct, resolvedVia: "partition" };
    }
  }

  const byId = await findTranslationJobsById(cleanId);
  if (byId.length === 0) return null;

  if (cleanShop) {
    const normalized = normalizeShopDomain(cleanShop);
    const matched = byId.find((d) => normalizeShopDomain(d.shopName) === normalized);
    if (matched) {
      return { doc: matched, resolvedVia: "crossPartition" };
    }
  }

  if (byId.length > 1) {
    logTranslationCosmos("resolveTranslationJobDocument multiple ids", {
      jobId: cleanId,
      requestedShop: cleanShop,
      shopNames: byId.map((d) => d.shopName),
      using: byId[0].shopName,
    });
  }
  return { doc: byId[0], resolvedVia: "crossPartition" };
}

function normalizeShopDomain(value: string): string {
  return value.trim().toLowerCase();
}

/** 点读任务文档（含 checkpoint），供翻译任务详情 API 与 AgentTask 对齐 */
export async function readTranslationJobDocument(shop: string, jobId: string) {
  const resolved = await resolveTranslationJobDocument(shop, jobId);
  return resolved?.doc ?? null;
}

export async function createTranslationJobRecord(input: CreateJobInput) {
  const jobs = await getJobsContainer();
  const now = nowIso();
  const record: TranslationJobRecord = {
    id: input.id,
    shop: input.shop,
    status: "PENDING",
    sourceLocale: input.sourceLocale,
    targetLocale: input.targetLocale,
    taskType: input.taskType ?? "spark-transtion",
    aiModel: input.aiModel ?? "gpt-4.1-nano",
    isCover: input.isCover ?? false,
    isHandle: input.isHandle ?? false,
    moduleList: input.moduleList ?? input.resourceTypes,
    sessionId: input.sessionId ?? `${input.shop}:${input.id}`,
    checkpoint: input.checkpoint ?? { phase: "INIT_CREATED", updatedAt: now, limitPerType: input.limitPerType },
    metrics: input.metrics ?? { usedToken: 0, totalCount: 0, savedCount: 0, translatedCount: 0 },
    resourceTypes: input.resourceTypes,
    limitPerType: input.limitPerType,
    totalItems: 0,
    fetchedItems: 0,
    errorMessage: null,
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  };
  const doc = toCosmosDoc(record);
  const token = input.accessToken?.trim();
  if (token) {
    doc.accessToken = token;
  }
  const target = resolveTranslationCosmosConfig();
  logTranslationCosmos("createTranslationJobRecord upsert", {
    endpointHost: cosmosEndpointHost(),
    ...target,
    taskId: input.id,
    shop: input.shop,
    taskType: doc.taskType,
  });
  await jobs.items.upsert(doc);
  return mapJob(doc);
}

export async function resetTranslationJobRecord(
  shop: string,
  jobId: string,
  input: Partial<Omit<CreateJobInput, "id" | "shop">> &
    Pick<CreateJobInput, "sourceLocale" | "targetLocale" | "resourceTypes" | "limitPerType" | "createdBy">,
) {
  const jobs = await getJobsContainer();
  const currentDoc = await readTranslationJobDocument(shop, jobId);
  if (!currentDoc) return null;
  const pk = cosmosPartitionKeyForDoc(currentDoc);
  const current = mapJob(currentDoc);
  const now = nowIso();
  const nextRecord: TranslationJobRecord = {
    ...current,
    status: "PENDING",
    sourceLocale: input.sourceLocale,
    targetLocale: input.targetLocale,
    taskType: input.taskType ?? current.taskType,
    aiModel: input.aiModel ?? current.aiModel,
    isCover: input.isCover ?? current.isCover,
    isHandle: input.isHandle ?? current.isHandle,
    moduleList: input.moduleList ?? current.moduleList,
    sessionId: input.sessionId ?? current.sessionId,
    checkpoint: input.checkpoint ?? { phase: "INIT_CREATED", updatedAt: now, limitPerType: input.limitPerType },
    metrics: input.metrics ?? { usedToken: 0, totalCount: 0, savedCount: 0, translatedCount: 0 },
    resourceTypes: input.resourceTypes,
    limitPerType: input.limitPerType,
    totalItems: 0,
    fetchedItems: 0,
    errorMessage: null,
    createdBy: input.createdBy,
    updatedAt: now,
  };
  const nextDoc = toCosmosDoc(nextRecord, currentDoc);
  await jobs.item(jobId, pk).replace(nextDoc);
  return mapJob(nextDoc);
}

export async function updateTranslationJobRecord(shop: string, jobId: string, input: UpdateJobInput) {
  const jobs = await getJobsContainer();
  const currentDoc = await readTranslationJobDocument(shop, jobId);
  if (!currentDoc) return null;
  const pk = cosmosPartitionKeyForDoc(currentDoc);
  const current = mapJob(currentDoc);
  const nextRecord: TranslationJobRecord = {
    ...current,
    status: input.status ?? current.status,
    taskType: input.taskType ?? current.taskType,
    aiModel: input.aiModel ?? current.aiModel,
    isCover: input.isCover ?? current.isCover,
    isHandle: input.isHandle ?? current.isHandle,
    moduleList: input.moduleList ?? current.moduleList,
    sessionId: input.sessionId ?? current.sessionId,
    checkpoint: input.checkpoint ?? current.checkpoint,
    metrics: input.metrics ?? current.metrics,
    totalItems: input.totalItems ?? current.totalItems,
    fetchedItems: input.fetchedItems ?? current.fetchedItems,
    errorMessage: input.errorMessage === undefined ? current.errorMessage : input.errorMessage,
    updatedAt: nowIso(),
  };
  const nextDoc = toCosmosDoc(nextRecord, currentDoc);
  await jobs.item(jobId, pk).replace(nextDoc);
  return mapJob(nextDoc);
}

export async function listTranslationJobs(shop: string) {
  const jobs = await getJobsContainer();
  const query = jobs.items.query<TranslationJobDoc>({
    query: "SELECT TOP 50 * FROM c WHERE c.shopName = @shop ORDER BY c.createdAt DESC",
    parameters: [{ name: "@shop", value: shop }],
  });
  const { resources } = await query.fetchAll();
  return resources.map(mapJob);
}

export type TranslationTaskListItem = {
  id: string;
  shopName: string;
  source: string;
  target: string;
  status: number;
  statusText: string;
  taskType: string;
  aiModel: string;
  createdAt: string;
  updatedAt: string;
  sessionId: string;
  moduleList: string;
};

function mapDocToListItem(doc: TranslationJobDoc): TranslationTaskListItem {
  return {
    id: doc.id,
    shopName: doc.shopName,
    source: doc.source,
    target: doc.target,
    status: doc.status,
    statusText: doc.statusText,
    taskType: doc.taskType ?? "spark-transtion",
    aiModel: doc.aiModel ?? "",
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    sessionId: doc.sessionId ?? "",
    moduleList: doc.moduleList ?? "",
  };
}

function buildListTasksSql(shopTrim: string, taskTypes: string[]) {
  const parameters: { name: string; value: string }[] = [{ name: "@shop", value: shopTrim }];
  const normalizedTypes = taskTypes.map((t) => t.trim().toLowerCase()).filter(Boolean);
  let sql: string;
  if (normalizedTypes.length === 0) {
    sql = "SELECT TOP 50 * FROM c WHERE c.shopName = @shop ORDER BY c.updatedAt DESC";
  } else if (normalizedTypes.length === 1) {
    sql =
      "SELECT TOP 50 * FROM c WHERE c.shopName = @shop AND c.taskType = @taskType ORDER BY c.updatedAt DESC";
    parameters.push({ name: "@taskType", value: normalizedTypes[0] });
  } else {
    const clauses = normalizedTypes.map((_, i) => `c.taskType = @tt${i}`).join(" OR ");
    sql = `SELECT TOP 50 * FROM c WHERE c.shopName = @shop AND (${clauses}) ORDER BY c.updatedAt DESC`;
    normalizedTypes.forEach((t, i) => parameters.push({ name: `@tt${i}`, value: t }));
  }
  return { sql, parameters };
}

async function listTranslationTasksInContainer(
  target: TranslationCosmosTarget,
  shop: string,
  taskTypes: string[],
): Promise<TranslationTaskListItem[]> {
  const shopTrim = shop.trim();
  if (!shopTrim) return [];
  const { sql, parameters } = buildListTasksSql(shopTrim, taskTypes);
  const startedAt = Date.now();
  logTranslationCosmos("query start", {
    endpointHost: cosmosEndpointHost(),
    databaseId: target.databaseId,
    containerId: target.containerId,
    shop: shopTrim,
    taskTypes,
    sql,
    parameters,
  });
  try {
    const container = await getJobsContainerForTarget(target);
    const { resources } = await container.items
      .query<TranslationJobDoc>({ query: sql, parameters })
      .fetchAll();
    const items = resources.map(mapDocToListItem);
    logTranslationCosmos("query done", {
      databaseId: target.databaseId,
      containerId: target.containerId,
      shop: shopTrim,
      count: items.length,
      elapsedMs: Date.now() - startedAt,
      taskIds: items.slice(0, 10).map((t) => t.id),
      taskTypesFound: [...new Set(items.map((t) => t.taskType))],
    });
    return items;
  } catch (error) {
    logTranslationCosmos("query failed", {
      databaseId: target.databaseId,
      containerId: target.containerId,
      shop: shopTrim,
      elapsedMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/** 从 translation / translation_jobs 列出店铺翻译任务 */
export async function listTranslationTasksForShop(
  shop: string,
  taskTypes: string[] = [],
): Promise<TranslationTaskListItem[]> {
  const target = resolveTranslationCosmosConfig();

  logTranslationCosmos("listTranslationTasksForShop", {
    endpointHost: cosmosEndpointHost(),
    ...target,
    shop,
    taskTypes,
  });

  const batch = await listTranslationTasksInContainer(target, shop, taskTypes);
  const tasks = [...batch]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 50);

  logTranslationCosmos("listTranslationTasksForShop result", {
    shop,
    total: tasks.length,
    taskIds: tasks.slice(0, 10).map((t) => t.id),
  });

  return tasks;
}

export async function getTranslationJobRecord(shop: string, jobId: string) {
  const doc = await readTranslationJobDocument(shop, jobId);
  return doc ? mapJob(doc) : null;
}
