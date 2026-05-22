import Redis from "ioredis";

let singleton: Redis | undefined;

/**
 * 与 Spring {@code RedisConfig}（Azure Cache SSL 6380）对齐：可用 {@code REDIS_URL}
 * 或 {@code REDIS_HOSTNAME}+{@code REDIS_PASSWORD}。
 */
export function getTranslateRedisClient(): Redis {
  if (singleton) return singleton;

  const url = process.env.REDIS_URL?.trim();
  if (url) {
    singleton = new Redis(url, {
      maxRetriesPerRequest: 2,
      connectTimeout: 10_000,
    });
    return singleton;
  }

  const host =
    process.env.REDIS_HOSTNAME?.trim() ||
    process.env.REDIS_HOST?.trim() ||
    process.env.REDISCACHEHOSTNAME?.trim();
  const password =
    process.env.REDIS_PASSWORD?.trim() ||
    process.env.REDIS_CACHEKEY_VAULT?.trim() ||
    process.env.REDISCACHEKEY?.trim();

  if (!host || !password) {
    throw new Error(
      "Redis 未配置：请设置 REDIS_URL，或 REDIS_HOSTNAME/REDISCACHEHOSTNAME + REDIS_PASSWORD/REDISCACHEKEY",
    );
  }

  const port = Number(process.env.REDIS_PORT?.trim() || "6380");
  const useTls = process.env.REDIS_TLS !== "false";

  singleton = new Redis({
    host,
    port,
    password,
    tls: useTls ? {} : undefined,
    maxRetriesPerRequest: 2,
    connectTimeout: 10_000,
  });
  return singleton;
}
