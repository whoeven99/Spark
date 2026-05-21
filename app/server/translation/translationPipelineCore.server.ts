import { getAppEntry } from "../../config/appEntry.server";
import { createTranslationJobRecord, listTranslationJobs } from "./cosmosJobStore.server";
import { SPARK_TRANSLATION_V4_TASK_TYPE } from "./translationTaskTypes.server";
import {
  ALLOWED_TRANSLATABLE_RESOURCE_TYPES,
  type TranslatableResourceType,
  type TranslationJobRecord,
} from "./types";

export type CreateTranslationJobResult = {
  job: TranslationJobRecord;
  /** 为 true 时表示未新建文档，返回了同店同源同目标下已有的一条任务（幂等） */
  reusedExisting: boolean;
};

type CreateTranslationJobInput = {
  shop: string;
  sourceLocale: string;
  targetLocale: string;
  resourceTypes: string[];
  createdBy: string;
  limitPerType: number;
  accessToken: string;
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

/** Spark 侧仅在 Cosmos 中新建翻译任务记录。同店同源同目标已存在任务时幂等返回其中最近更新的一条，避免重复提交被误判为失败。 */
export async function createTranslationJob(
  input: CreateTranslationJobInput,
): Promise<CreateTranslationJobResult> {
  const sourceLocale = normalizeLocale(input.sourceLocale || "zh-CN");
  const targetLocale = normalizeLocale(input.targetLocale);
  const resourceTypes = normalizeResourceTypes(input.resourceTypes);
  const limitPerType = normalizeLimit(input.limitPerType);
  if (!targetLocale) throw new Error("请先填写目标语言，例如 fr 或 ja");
  if (targetLocale === sourceLocale) throw new Error("目标语言不能和源语言相同");

  const existingJobs = await listTranslationJobs(input.shop);
  const samePairJobs = existingJobs.filter(
    (job) =>
      normalizeLocale(job.sourceLocale) === sourceLocale &&
      normalizeLocale(job.targetLocale) === targetLocale,
  );
  if (samePairJobs.length > 0) {
    const sorted = [...samePairJobs].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
    const job = sorted[0];
    if (job) {
      return { job, reusedExisting: true };
    }
  }

  const jobId = crypto.randomUUID();
  // 直接返回 upsert 后的映射结果，避免紧接点读因 Cosmos 一致性/延迟返回 null，
  // 导致路由误判 500 而任务实际已写入（列表刷新可见）。
  const job = await createTranslationJobRecord({
    id: jobId,
    shop: input.shop,
    sourceLocale,
    targetLocale,
    taskType: SPARK_TRANSLATION_V4_TASK_TYPE,
    aiModel: process.env.TRANSLATION_AI_MODEL?.trim() || "gpt-4o-mini",
    isCover: false,
    isHandle: false,
    moduleList: resourceTypes,
    sessionId: `${input.shop}:${jobId}`,
    checkpoint: {
      phase: "INIT_CREATED",
      updatedAt: new Date().toISOString(),
      billingAppName: getAppEntry(),
    },
    metrics: {},
    resourceTypes,
    limitPerType,
    createdBy: input.createdBy,
    accessToken: input.accessToken,
  });
  return { job, reusedExisting: false };
}
