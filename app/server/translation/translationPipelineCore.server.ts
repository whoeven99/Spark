import { createTranslationJobRecord, listTranslationJobs } from "./cosmosJobStore.server";
import {
  ALLOWED_TRANSLATABLE_RESOURCE_TYPES,
  type TranslatableResourceType,
} from "./types";

/** 与 SpringBackend `TranslateV3Service.isRuntimeJsonTask` 一致，供 AgentTask 调度 Spark 翻译任务 */
const SPARK_TRANSLATION_TASK_TYPE = "spark";

type CreateTranslationJobInput = {
  shop: string;
  sourceLocale: string;
  targetLocale: string;
  resourceTypes: string[];
  createdBy: string;
  limitPerType: number;
};

const DEFAULT_RESOURCE_TYPES: TranslatableResourceType[] = ["PRODUCT", "COLLECTION", "PAGE", "ARTICLE"];

function normalizeLocale(locale: string) {
  return locale.trim().toLowerCase();
}

function normalizeResourceTypes(resourceTypes: string[]): TranslatableResourceType[] {
  const allowed = new Set<string>(ALLOWED_TRANSLATABLE_RESOURCE_TYPES);
  const normalized = resourceTypes
    .map((item) => item.trim().toUpperCase())
    .filter((item) => allowed.has(item)) as TranslatableResourceType[];
  return normalized.length ? normalized : DEFAULT_RESOURCE_TYPES;
}

function normalizeLimit(limitPerType: number) {
  const limit = Number(limitPerType);
  if (!Number.isFinite(limit) || limit <= 0) return 20;
  return Math.min(Math.floor(limit), 200);
}

/** Spark 侧仅在 Cosmos 中新建翻译任务记录；同店同源同目标已有一条记录则拒绝创建。执行由其他服务（如 AgentTask）完成。 */
export async function createTranslationJob(input: CreateTranslationJobInput) {
  const sourceLocale = normalizeLocale(input.sourceLocale || "zh-CN");
  const targetLocale = normalizeLocale(input.targetLocale);
  const resourceTypes = normalizeResourceTypes(input.resourceTypes);
  const limitPerType = normalizeLimit(input.limitPerType);
  if (!targetLocale) throw new Error("请先填写目标语言，例如 fr 或 ja");
  if (targetLocale === sourceLocale) throw new Error("目标语言不能和源语言相同");

  const existingJobs = await listTranslationJobs(input.shop);
  const samePairJobs = existingJobs.filter(
    (job) => job.sourceLocale === sourceLocale && job.targetLocale === targetLocale,
  );
  if (samePairJobs.length > 0) {
    throw new Error("任务已存在");
  }

  const jobId = crypto.randomUUID();
  // 直接返回 upsert 后的映射结果，避免紧接点读因 Cosmos 一致性/延迟返回 null，
  // 导致路由误判 500 而任务实际已写入（列表刷新可见）。
  return createTranslationJobRecord({
    id: jobId,
    shop: input.shop,
    sourceLocale,
    targetLocale,
    taskType: SPARK_TRANSLATION_TASK_TYPE,
    aiModel: process.env.TRANSLATION_AI_MODEL?.trim() || "gpt-4o-mini",
    isCover: false,
    isHandle: false,
    moduleList: resourceTypes,
    sessionId: `${input.shop}:${jobId}`,
    checkpoint: { phase: "INIT_CREATED", updatedAt: new Date().toISOString() },
    metrics: {},
    resourceTypes,
    limitPerType,
    createdBy: input.createdBy,
  });
}
