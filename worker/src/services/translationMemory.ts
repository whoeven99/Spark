import { getRedis } from "./redisV4.js";

/**
 * Translation Memory (TM) — a Redis-backed cache of past translations.
 *
 * Key design: Shopify ships a content `digest` for every translatable field.
 * The digest is a hash of the source content, so it changes exactly when the
 * source text changes. That makes (shopName, target, model, digest) a perfect
 * natural cache key with self-invalidation: edit the source → new digest → miss.
 *
 * Scope is per-shop so that future per-shop glossary/tone never leaks across
 * shops. A generic global tier can be layered on later for theme UI strings.
 */

const TM_PREFIX = "tm:v4";
const DEFAULT_TTL_DAYS = 60;
// Values larger than this are almost always unique (long HTML), so caching them
// burns Redis memory for near-zero hit rate. Skip them.
const MAX_VALUE_BYTES = 8000;

function ttlSeconds(): number {
  const days = Number(process.env.TRANSLATION_TM_TTL_DAYS?.trim() || DEFAULT_TTL_DAYS);
  return (Number.isFinite(days) && days > 0 ? days : DEFAULT_TTL_DAYS) * 24 * 3600;
}

function isDisabled(): boolean {
  return process.env.TRANSLATION_TM_DISABLED === "true";
}

export function tmKey(shopName: string, target: string, model: string, digest: string): string {
  return `${TM_PREFIX}:${shopName}:${target}:${model}:${digest}`;
}

/** Returns the cached translation for a field digest, or null on miss/disabled/error. */
export async function tmGet(
  shopName: string,
  target: string,
  model: string,
  digest: string,
): Promise<string | null> {
  if (isDisabled() || !digest) return null;
  try {
    return await getRedis().get(tmKey(shopName, target, model, digest));
  } catch {
    return null;
  }
}

/** Stores a translation keyed by field digest. Best-effort; never throws. */
export async function tmSet(
  shopName: string,
  target: string,
  model: string,
  digest: string,
  value: string,
): Promise<void> {
  if (isDisabled() || !digest || !value) return;
  if (Buffer.byteLength(value, "utf8") > MAX_VALUE_BYTES) return;
  try {
    await getRedis().set(tmKey(shopName, target, model, digest), value, "EX", ttlSeconds());
  } catch {
    // best-effort
  }
}
