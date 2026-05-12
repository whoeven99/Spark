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

let jobsContainerPromise: Promise<Container> | null = null;

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

async function getJobsContainer() {
  if (jobsContainerPromise) return jobsContainerPromise;
  jobsContainerPromise = (async () => {
    const endpoint = getRequiredEnv("COSMOS_ENDPOINT");
    const key = getRequiredEnv("COSMOS_KEY");
    const databaseId = process.env.COSMOS_TRANSLATION_DATABASE_ID?.trim() || "translation";
    const jobsId = process.env.COSMOS_TRANSLATION_JOBS_CONTAINER?.trim() || "translation_jobs";
    const client = new CosmosClient({ endpoint, key });
    const { database } = await client.databases.createIfNotExists({ id: databaseId });
    const { container } = await database.containers.createIfNotExists({
      id: jobsId,
      partitionKey: { paths: ["/shopName"] },
    });
    return container;
  })();
  return jobsContainerPromise;
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
    taskType: input.taskType ?? "spark",
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

/** 与 Spark 创建任务同一容器；taskType 为 spark（忽略大小写），并兼容历史 json-runtime。按 updatedAt 降序，最多 50 条。 */
export async function listJsonRuntimeTasksForShop(shop: string) {
  const shopTrim = shop.trim();
  if (!shopTrim) return [];
  const jobs = await getJobsContainer();
  const query = jobs.items.query<TranslationJobDoc>(
    {
      query:
        "SELECT TOP 50 * FROM c WHERE c.shopName = @shop AND (LOWER(c.taskType) = 'spark' OR LOWER(c.taskType) = 'json-runtime') ORDER BY c.updatedAt DESC",
      parameters: [{ name: "@shop", value: shopTrim }],
    },
    { partitionKey: shopTrim },
  );
  const { resources } = await query.fetchAll();
  return resources.map((doc) => ({
    id: doc.id,
    shopName: doc.shopName,
    source: doc.source,
    target: doc.target,
    status: doc.status,
    statusText: doc.statusText,
    taskType: doc.taskType ?? "spark",
    aiModel: doc.aiModel ?? "",
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    sessionId: doc.sessionId ?? "",
    moduleList: doc.moduleList ?? "",
  }));
}

export async function getTranslationJobRecord(shop: string, jobId: string) {
  const doc = await readJobDoc(shop, jobId);
  return doc ? mapJob(doc) : null;
}
