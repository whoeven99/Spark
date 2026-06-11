import { Redis } from "ioredis";

let _redis: Redis | null = null;

/**
 * Returns a shared Redis client for the admin server, or null when Redis
 * is not configured.  Uses the same env-var convention as the worker so both
 * services can share the same Redis instance without extra config.
 */
export function getRedis(): Redis | null {
  if (_redis) return _redis;

  const url = process.env.REDIS_URL?.trim();
  if (url) {
    _redis = new Redis(url, {
      maxRetriesPerRequest: 1,
      connectTimeout: 5_000,
      lazyConnect: true,
    });
    return _redis;
  }

  const host =
    process.env.REDIS_HOSTNAME?.trim() ||
    process.env.REDIS_HOST?.trim() ||
    process.env.REDISCACHEHOSTNAME?.trim();
  const password =
    process.env.REDIS_PASSWORD?.trim() ||
    process.env.REDISCACHEKEY?.trim();

  if (!host || !password) return null; // Redis not configured

  const port = Number(process.env.REDIS_PORT?.trim() || "6380");
  const useTls = process.env.REDIS_TLS !== "false";

  _redis = new Redis({
    host,
    port,
    password,
    tls: useTls ? {} : undefined,
    maxRetriesPerRequest: 1,
    connectTimeout: 5_000,
    lazyConnect: true,
  });
  return _redis;
}
