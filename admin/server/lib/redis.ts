import { Cluster, Redis } from "ioredis";

export type RedisClient = Redis | Cluster;

let _redis: RedisClient | null = null;

/**
 * 云 Redis Cluster（如 Azure Redis Enterprise）需用 Cluster 客户端，否则会报 MOVED。
 * 仅本地单机 Redis 时显式设 REDIS_CLUSTER=false。
 */
export function isRedisClusterMode(): boolean {
  const v = process.env.REDIS_CLUSTER?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "no") return false;
  if (v === "1" || v === "true" || v === "yes") return true;
  return true;
}

function isClusterMode(): boolean {
  return isRedisClusterMode();
}

export function isRedisClusterClient(client: RedisClient): client is Cluster {
  return client instanceof Cluster;
}

/** Cluster 下 pipeline 要求所有 key 在同一 slot；跨 slot 时改为并行单条命令。 */
export async function batchHgetall(
  redis: RedisClient,
  keys: string[],
): Promise<Record<string, string>[]> {
  if (keys.length === 0) return [];

  if (isRedisClusterClient(redis)) {
    return Promise.all(
      keys.map(async (key) => {
        const raw = await redis.hgetall(key);
        return raw && typeof raw === "object" ? raw : {};
      }),
    );
  }

  const pipe = redis.pipeline();
  for (const key of keys) pipe.hgetall(key);
  const results = await pipe.exec();
  return keys.map((_, i) => {
    const raw = results?.[i]?.[1];
    return raw && typeof raw === "object" ? (raw as Record<string, string>) : {};
  });
}

export async function batchGetWithTtl(
  redis: RedisClient,
  keys: string[],
): Promise<Array<{ value: string | null; ttl: number }>> {
  if (keys.length === 0) return [];

  if (isRedisClusterClient(redis)) {
    return Promise.all(
      keys.map(async (key) => {
        const [value, ttl] = await Promise.all([redis.get(key), redis.ttl(key)]);
        return { value, ttl };
      }),
    );
  }

  const pipe = redis.pipeline();
  for (const key of keys) {
    pipe.get(key);
    pipe.ttl(key);
  }
  const results = await pipe.exec();
  return keys.map((_, i) => ({
    value: (results?.[i * 2]?.[1] as string | null) ?? null,
    ttl: (results?.[i * 2 + 1]?.[1] as number) ?? -2,
  }));
}

export async function batchLrange(
  redis: RedisClient,
  keys: string[],
  start = 0,
  stop = -1,
): Promise<string[][]> {
  if (keys.length === 0) return [];

  if (isRedisClusterClient(redis)) {
    return Promise.all(keys.map((key) => redis.lrange(key, start, stop)));
  }

  const pipe = redis.pipeline();
  for (const key of keys) pipe.lrange(key, start, stop);
  const results = await pipe.exec();
  return keys.map((_, i) => (results?.[i]?.[1] as string[] | null) ?? []);
}

function parseRedisUrl(url: string) {
  const parsed = new URL(url);
  const port = parsed.port
    ? Number(parsed.port)
    : parsed.protocol === "rediss:" ? 6380 : 6379;
  const password = parsed.password
    ? decodeURIComponent(parsed.password)
    : undefined;
  return {
    host: parsed.hostname,
    port,
    password,
    tls:
      parsed.protocol === "rediss:"
        ? ({ servername: parsed.hostname } as const)
        : undefined,
  };
}

const commonOpts = {
  maxRetriesPerRequest: 1,
  connectTimeout: 5_000,
  lazyConnect: true,
} as const;

/**
 * Admin 专用 Redis 客户端。读取 `REDIS_URL`（与 Render 等部署配置一致）。
 * 默认按 Redis Cluster 连接；本地单机 Redis 设 `REDIS_CLUSTER=false`。
 */
export function getRedis(): RedisClient | null {
  if (_redis) return _redis;

  const url = process.env.REDIS_URL?.trim();
  if (!url) return null;

  if (isClusterMode()) {
    const node = parseRedisUrl(url);
    _redis = new Cluster([{ host: node.host, port: node.port }], {
      // Azure / 云 Redis Cluster 的 MOVED 可能返回内网 IP，跳过 DNS 解析
      dnsLookup: (address, callback) => callback(null, address),
      slotsRefreshTimeout: 10_000,
      redisOptions: {
        ...commonOpts,
        password: node.password,
        tls: node.tls,
      },
    });
  } else {
    _redis = new Redis(url, commonOpts);
  }

  return _redis;
}
