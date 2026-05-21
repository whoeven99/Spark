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

/** 与 SpringBackend Cosmos TranslateTaskV3 文档对齐（partitionKey: shopName） */
export type TranslationJobDoc = {
  id: string;
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

/** AgentTask / Spring 侧库表（仅作回退） */
const KNOWN_TRANSLATION_COSMOS_TARGETS: TranslationCosmosTarget[] = [
  SPARK_TRANSLATION_COSMOS_TARGET,
  { databaseId: "bogdatechtest", containerId: "translate_tasks_v3" },
];

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

/** 主库表：环境变量优先，否则 Spark 默认 translation / translation_jobs */
export function resolveTranslationCosmosConfig(): TranslationCosmosTarget {
  const databaseId =
    process.env.COSMOS_TRANSLATION_DATABASE_ID?.trim() ||
    process.env.COSMOS_DATABASE_ID?.trim() ||
    SPARK_TRANSLATION_COSMOS_TARGET.databaseId;
  const containerId =
    process.env.COSMOS_TRANSLATION_JOBS_CONTAINER?.trim() ||
    SPARK_TRANSLATION_COSMOS_TARGET.containerId;
  return { databaseId, containerId };
}

export function getTranslationCosmosLookupTargets(): TranslationCosmosTarget[] {
  const primary = resolveTranslationCosmosConfig();
  const seen = new Set<string>();
  const ordered: TranslationCosmosTarget[] = [];
  for (const target of [primary, ...KNOWN_TRANSLATION_COSMOS_TARGETS]) {
    const key = `${target.databaseId}/${target.containerId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    ordered.push(target);
  }
  return ordered;
}

export function getTranslationCosmosMeta() {
  const primary = resolveTranslationCosmosConfig();
  return {
    endpointHost: cosmosEndpointHost(),
    databaseId: primary.databaseId,
    containerId: primary.containerId,
    lookupTargets: getTranslationCosmosLookupTargets(),
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
        partitionKey: { paths: ["/shopName"] },
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

async function readJobDoc(shop: string, jobId: string) {
  const jobs = await getJobsContainer();
  const { resource } = await jobs.item(jobId, shop).read<TranslationJobDoc>();
  return resource ?? null;
}

/** 点读任务文档（含 checkpoint），供 JSON Runtime 详情与后端 getJsonRuntimeTaskDetail 对齐 */
export async function readTranslationJobDocument(shop: string, jobId: string) {
  return readJobDoc(shop.trim(), jobId.trim());
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
  const currentDoc = await readJobDoc(shop, jobId);
  if (!currentDoc) return null;
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
  await jobs.item(jobId, shop).replace(nextDoc);
  return mapJob(nextDoc);
}

export async function updateTranslationJobRecord(shop: string, jobId: string, input: UpdateJobInput) {
  const jobs = await getJobsContainer();
  const currentDoc = await readJobDoc(shop, jobId);
  if (!currentDoc) return null;
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
  await jobs.item(jobId, shop).replace(nextDoc);
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

export type TranslationTaskListResult = {
  tasks: TranslationTaskListItem[];
  /** 实际命中数据的 Cosmos 库表（多目标回退时可能与环境变量主配置不同） */
  resolvedFrom: TranslationCosmosTarget | null;
  queriedTargets: TranslationCosmosTarget[];
};

/**
 * 列出翻译任务：先查环境变量主库表，无结果时回退到已知库表组合（与 AgentTask 共用 translate_tasks_v3 等）。
 */
export async function listTranslationTasksForShop(
  shop: string,
  taskTypes: string[] = [],
): Promise<TranslationTaskListResult> {
  const primary = resolveTranslationCosmosConfig();
  const enableFallback = process.env.TRANSLATION_COSMOS_ENABLE_FALLBACK !== "false";
  const targets = enableFallback
    ? getTranslationCosmosLookupTargets()
    : [primary];

  logTranslationCosmos("listTranslationTasksForShop", {
    endpointHost: cosmosEndpointHost(),
    primary,
    enableFallback,
    targets,
    shop,
    taskTypes,
  });

  const merged = new Map<string, TranslationTaskListItem>();
  let resolvedFrom: TranslationCosmosTarget | null = null;

  for (const target of targets) {
    const batch = await listTranslationTasksInContainer(target, shop, taskTypes);
    if (batch.length === 0) continue;
    if (!resolvedFrom) resolvedFrom = target;
    for (const item of batch) {
      merged.set(item.id, item);
    }
    if (!enableFallback) break;
  }

  const tasks = [...merged.values()]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 50);

  logTranslationCosmos("listTranslationTasksForShop result", {
    shop,
    total: tasks.length,
    resolvedFrom,
    taskIds: tasks.slice(0, 10).map((t) => t.id),
  });

  return { tasks, resolvedFrom, queriedTargets: targets };
}

/** @deprecated 请使用 {@link listTranslationTasksForShop} 或 `GET /api/translate/v4/tasks` */
export async function listJsonRuntimeTasksForShop(shop: string) {
  const { tasks } = await listTranslationTasksForShop(shop);
  return tasks;
}

export async function getTranslationJobRecord(shop: string, jobId: string) {
  const doc = await readJobDoc(shop, jobId);
  return doc ? mapJob(doc) : null;
}
