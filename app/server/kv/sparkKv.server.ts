import { Redis } from "ioredis";

const LOG_PREFIX = "[SparkKV]";

let redisClient: Redis | null = null;
let redisInitAttempted = false;

/** 主应用 Redis key 必须 spark: 前缀，避免碰到 TSF 的 translate:/tsf: 键。 */
export function sparkKvKey(...parts: Array<string | number>): string {
  const safe = parts.map((part) => String(part).replace(/:/g, "_"));
  return ["spark", ...safe].join(":");
}

export function isSparkKvConfigured(): boolean {
  return Boolean(process.env.SPARK_KV?.trim());
}

function getSparkKvClient(): Redis | null {
  const url = process.env.SPARK_KV?.trim();
  if (!url) return null;
  if (redisClient) return redisClient;
  if (redisInitAttempted) return redisClient;
  redisInitAttempted = true;
  try {
    redisClient = new Redis(url, {
      maxRetriesPerRequest: 1,
      connectTimeout: 5_000,
      lazyConnect: true,
      enableOfflineQueue: false,
    });
    redisClient.on("error", (error) => {
      console.warn(`${LOG_PREFIX} ${error instanceof Error ? error.message : String(error)}`);
    });
    return redisClient;
  } catch (error) {
    console.warn(
      `${LOG_PREFIX} init failed ${error instanceof Error ? error.message : String(error)}`,
    );
    redisClient = null;
    return null;
  }
}

async function withClient<T>(fn: (client: Redis) => Promise<T>, fallback: T): Promise<T> {
  const client = getSparkKvClient();
  if (!client) return fallback;
  try {
    return await fn(client);
  } catch (error) {
    console.warn(
      `${LOG_PREFIX} command failed ${error instanceof Error ? error.message : String(error)}`,
    );
    return fallback;
  }
}

export async function sparkKvGet(key: string): Promise<string | null> {
  return withClient((client) => client.get(key), null);
}

export async function sparkKvSet(
  key: string,
  value: string,
  ttlSeconds: number,
): Promise<boolean> {
  const ok = await withClient(async (client) => {
    await client.set(key, value, "EX", ttlSeconds);
    return true;
  }, false);
  return ok;
}

/** SET NX EX。成功占到键返回 true；未配置 Redis 视为未占到，交给 Turso 锁。 */
export async function sparkKvSetNx(
  key: string,
  value: string,
  ttlSeconds: number,
): Promise<boolean | null> {
  const client = getSparkKvClient();
  if (!client) return null;
  try {
    const result = await client.set(key, value, "EX", ttlSeconds, "NX");
    return result === "OK";
  } catch (error) {
    console.warn(
      `${LOG_PREFIX} setnx failed ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

export async function sparkKvDel(key: string): Promise<void> {
  await withClient(async (client) => {
    await client.del(key);
    return true;
  }, false);
}
