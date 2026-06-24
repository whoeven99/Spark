import { Redis } from "ioredis";

let _redis: Redis | null = null;

/**
 * Admin 专用 Redis 客户端。仅读取 `REDIS_URL`（与 Render 等部署配置一致）。
 * 未配置时返回 null，调用方降级为 Cosmos-only。
 */
export function getRedis(): Redis | null {
  if (_redis) return _redis;

  const url = process.env.REDIS_URL?.trim();
  if (!url) return null;

  _redis = new Redis(url, {
    maxRetriesPerRequest: 1,
    connectTimeout: 5_000,
    lazyConnect: true,
  });
  return _redis;
}
