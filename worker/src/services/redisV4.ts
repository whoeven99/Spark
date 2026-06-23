import IORedis from "ioredis";

let _redis: IORedis | undefined;
let _lastRedisErrorLogAt = 0;

const REDIS_COMMON_OPTIONS = {
  maxRetriesPerRequest: 2,
  connectTimeout: 10_000,
  retryStrategy: (times: number) => Math.min(times * 500, 5_000),
} as const;

function attachRedisListeners(redis: IORedis): void {
  redis.on("error", (err: Error) => {
    const now = Date.now();
    if (now - _lastRedisErrorLogAt < 60_000) return;
    _lastRedisErrorLogAt = now;
    console.error(`[redisV4] connection error: ${err.message}`);
  });
  redis.on("connect", () => {
    console.info("[redisV4] connected");
  });
  redis.on("reconnecting", () => {
    const now = Date.now();
    if (now - _lastRedisErrorLogAt < 60_000) return;
    _lastRedisErrorLogAt = now;
    console.warn("[redisV4] reconnecting…");
  });
}

export function getRedis(): IORedis {
  if (_redis) return _redis;

  const url = process.env.REDIS_URL?.trim();
  if (url) {
    _redis = new IORedis(url, REDIS_COMMON_OPTIONS);
    attachRedisListeners(_redis);
    return _redis;
  }

  const host =
    process.env.REDIS_HOSTNAME?.trim() ||
    process.env.REDIS_HOST?.trim() ||
    process.env.REDISCACHEHOSTNAME?.trim();
  const password =
    process.env.REDIS_PASSWORD?.trim() ||
    process.env.REDISCACHEKEY?.trim();

  if (!host || !password) {
    throw new Error("Redis not configured: set REDIS_URL or REDIS_HOSTNAME + REDIS_PASSWORD");
  }

  const port = Number(process.env.REDIS_PORT?.trim() || "6380");
  const useTls = process.env.REDIS_TLS !== "false";

  _redis = new IORedis({
    host,
    port,
    password,
    tls: useTls ? {} : undefined,
    ...REDIS_COMMON_OPTIONS,
  });
  attachRedisListeners(_redis);
  return _redis;
}

/** 启动时探测 Redis 连通性（不阻塞 worker 调度）。 */
export async function pingRedis(): Promise<boolean> {
  try {
    const pong = await getRedis().ping();
    return pong === "PONG";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[redisV4] ping failed: ${message}`);
    return false;
  }
}

export const HINT_KEYS = {
  init: "translate:v4:hint:init",
  translate: "translate:v4:hint:translate",
  writeback: "translate:v4:hint:writeback",
  verify: "translate:v4:hint:verify",
  analysis: "translate:v4:hint:analysis",
} as const;

export type HintPayload = { taskId: string; shopName: string };
export type AnalysisHintPayload = {
  shopName: string;
  sourceLanguage: string;
  modules: string[];
  target?: "profile" | "glossary" | "both";
};

export async function popHint(
  stage: keyof typeof HINT_KEYS,
): Promise<HintPayload | null> {
  try {
    const raw = await getRedis().lpop(HINT_KEYS[stage]);
    if (!raw) return null;
    return JSON.parse(raw) as HintPayload;
  } catch {
    return null;
  }
}

export async function pushHint(
  stage: keyof typeof HINT_KEYS,
  payload: HintPayload,
): Promise<void> {
  try {
    await getRedis().lpush(HINT_KEYS[stage], JSON.stringify(payload));
  } catch {
    // best-effort
  }
}

const PROGRESS_TTL = 7 * 24 * 3600; // 7 days in seconds

export function progressKey(taskId: string): string {
  return `translate:v4:progress:${taskId}`;
}

/**
 * 任务运行时的外部控制键。外部（TSF/Spark 前端、运营、或额度耗尽逻辑）写入
 * "pause" / "cancel"，worker 在阶段中途的检查点读取后优雅中断。
 */
export function controlKey(taskId: string): string {
  return `translate:v4:control:${taskId}`;
}

export type V4Control = "pause" | "cancel" | null;

/** 读取任务的外部控制指令（无则 null）。 */
export async function readControl(taskId: string): Promise<V4Control> {
  try {
    const v = await getRedis().get(controlKey(taskId));
    return v === "pause" || v === "cancel" ? v : null;
  } catch {
    return null;
  }
}

/** 设置外部控制指令（TTL 1 天，避免残留）。 */
export async function setControl(
  taskId: string,
  action: "pause" | "cancel",
): Promise<void> {
  try {
    await getRedis().set(controlKey(taskId), action, "EX", 24 * 3600);
  } catch {
    // best-effort
  }
}

/** 清除控制指令（resume / 任务收尾时调用）。 */
export async function clearControl(taskId: string): Promise<void> {
  try {
    await getRedis().del(controlKey(taskId));
  } catch {
    // best-effort
  }
}

export async function setProgress(
  taskId: string,
  fields: Record<string, string | number>,
): Promise<void> {
  try {
    const redis = getRedis();
    const key = progressKey(taskId);
    const flat: string[] = [];
    for (const [k, v] of Object.entries(fields)) {
      flat.push(k, String(v));
    }
    flat.push("updatedAt", Date.now().toString());
    await redis.hset(key, ...flat);
    await redis.expire(key, PROGRESS_TTL);
  } catch {
    // best-effort
  }
}

export async function getProgress(
  taskId: string,
): Promise<Record<string, string>> {
  try {
    return await getRedis().hgetall(progressKey(taskId)) ?? {};
  } catch {
    return {};
  }
}

/**
 * 汇总页统计缓存键。TSF 汇总页直接读此 hash（field=module，value=JSON）。
 * 由 worker 任务完成时写入，TSF 缺失时现算并回写。
 */
export function itemsCountKey(shopName: string, locale: string): string {
  return `tsf:items_count:${shopName}:${locale}`;
}

/** 写入某 module 的统计（total/translated），随 hash 续期 TTL。 */
export async function setItemsCount(
  shopName: string,
  locale: string,
  module: string,
  value: { total: number; translated: number },
): Promise<boolean> {
  try {
    const redis = getRedis();
    const key = itemsCountKey(shopName, locale);
    await redis.hset(
      key,
      module,
      JSON.stringify({ ...value, updatedAt: new Date().toISOString() }),
    );
    await redis.expire(key, PROGRESS_TTL);
    return true;
  } catch {
    return false;
  }
}
