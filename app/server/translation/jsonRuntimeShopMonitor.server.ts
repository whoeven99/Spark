import {
  getTranslationJobsCosmosLocation,
  listTranslationJobDocsForShop,
  type TranslationJobDoc,
} from "./cosmosJobStore.server";
import { getJsonRuntimeTaskProgress } from "./jsonRuntimeTaskDetail.server";
import { getTranslateRedisClient } from "./translateRedis.server";

const TRANSLATE_MONITOR_V3_KEY_PREFIX = "translate_monitor_v3:";
const DEFAULT_MAX_TASKS = 20;

export type ShopMonitorTaskRow = {
  cosmos: Record<string, unknown>;
  resolvedRedisPrefix: string;
  redisRuntime: Record<string, unknown> | null;
  translateMonitor: Record<string, string> | null;
  redisError: string | null;
};

export type ShopTranslationMonitorPayload = {
  shopName: string;
  total: number;
  tasks: ShopMonitorTaskRow[];
  cosmos: ReturnType<typeof getTranslationJobsCosmosLocation>;
  dataSource: "spark-local-cosmos-redis";
};

function safeText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function cosmosDocToSummary(doc: TranslationJobDoc): Record<string, unknown> {
  return {
    id: doc.id,
    shopName: doc.shopName ?? doc.shop ?? "",
    source: doc.source,
    target: doc.target,
    status: doc.status,
    statusText: doc.statusText,
    taskType: doc.taskType,
    updatedAt: doc.updatedAt,
    checkpointPhase:
      doc.checkpoint && typeof doc.checkpoint === "object"
        ? safeText((doc.checkpoint as Record<string, unknown>).phase)
        : "",
  };
}

function resolveRedisPrefix(doc: TranslationJobDoc): string {
  const ck = doc.checkpoint;
  if (ck && typeof ck === "object") {
    const fromCk = safeText((ck as Record<string, unknown>).redisPrefix);
    if (fromCk) return fromCk;
  }
  return "tr:v1";
}

async function readTranslateMonitorV3(taskId: string): Promise<Record<string, string> | null> {
  try {
    const redis = getTranslateRedisClient();
    const monitor = await redis.hgetall(`${TRANSLATE_MONITOR_V3_KEY_PREFIX}${taskId}`);
    if (!monitor || Object.keys(monitor).length === 0) return null;
    return monitor;
  } catch {
    return null;
  }
}

/**
 * 任务监控：先查 Cosmos 该店任务，再逐条读 Redis（runtime + translate_monitor_v3）。
 */
export async function buildShopTranslationMonitor(shopName: string, maxTasks = DEFAULT_MAX_TASKS) {
  const shop = safeText(shopName);
  if (!shop) {
    return { shopName: "", total: 0, tasks: [], cosmos: getTranslationJobsCosmosLocation(), dataSource: "spark-local-cosmos-redis" as const };
  }

  const docs = await listTranslationJobDocsForShop(shop, maxTasks);
  const tasks: ShopMonitorTaskRow[] = await Promise.all(
    docs.map(async (doc) => {
      const taskId = safeText(doc.id);
      const prefix = resolveRedisPrefix(doc);
      let redisRuntime: Record<string, unknown> | null = null;
      let translateMonitor: Record<string, string> | null = null;
      let redisError: string | null = null;

      try {
        const [runtime, monitor] = await Promise.all([
          taskId ? getJsonRuntimeTaskProgress(taskId, prefix) : Promise.resolve(null),
          taskId ? readTranslateMonitorV3(taskId) : Promise.resolve(null),
        ]);
        redisRuntime = runtime;
        translateMonitor = monitor;
      } catch (err) {
        redisError = err instanceof Error ? err.message : String(err);
      }

      return {
        cosmos: cosmosDocToSummary(doc),
        resolvedRedisPrefix: prefix,
        redisRuntime,
        translateMonitor,
        redisError,
      };
    }),
  );

  return {
    shopName: shop,
    total: tasks.length,
    tasks,
    cosmos: getTranslationJobsCosmosLocation(),
    dataSource: "spark-local-cosmos-redis" as const,
  };
}
