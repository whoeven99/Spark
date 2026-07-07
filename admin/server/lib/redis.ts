import { Cluster, Redis } from "ioredis";

export type RedisClient = Redis | Cluster;

let _redis: RedisClient | null = null;

function isClusterMode(): boolean {
  const v = process.env.REDIS_CLUSTER?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
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
    tls: parsed.protocol === "rediss:" ? ({} as const) : undefined,
  };
}

const commonOpts = {
  maxRetriesPerRequest: 1,
  connectTimeout: 5_000,
  lazyConnect: true,
} as const;

/**
 * Admin 专用 Redis 客户端。读取 `REDIS_URL`（与 Render 等部署配置一致）。
 * 集群部署时设置 `REDIS_CLUSTER=true`，使用 ioredis Cluster 处理 MOVED 重定向。
 * 未配置时返回 null，调用方降级为 Cosmos-only。
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
