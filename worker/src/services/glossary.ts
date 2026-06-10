import { blobRead } from "./blobV4.js";

/**
 * Per-shop glossary — brand names, product terms, and do-not-translate words
 * injected into the translation system prompt so wording stays consistent.
 *
 * Stored in Blob at `glossary/{shopName}.json`:
 * {
 *   "terms": [
 *     { "source": "闪购", "translations": { "en": "Flash Sale", "fr": "Vente flash" } },
 *     { "source": "Acme", "doNotTranslate": true, "note": "brand" }
 *   ]
 * }
 *
 * The produced lines are sorted deterministically so the system prompt prefix is
 * byte-stable across batches → OpenAI automatic prompt caching can kick in.
 */

export type GlossaryTerm = {
  source: string;
  translations?: Record<string, string>;
  doNotTranslate?: boolean;
  note?: string;
};

export type GlossaryFile = {
  terms: GlossaryTerm[];
};

type CacheEntry = {
  lines: string[];
  expiresAt: number;
  /** Glossary version (Redis timestamp) when this entry was populated. */
  version: number;
};
const cache = new Map<string, CacheEntry>();
const TTL_MS = 5 * 60_000;

/** Redis key written by the admin server whenever the glossary is saved. */
function glossaryVersionKey(shopName: string): string {
  return `translate:v4:glossary_v:${shopName}`;
}

/** Current glossary version from Redis; returns 0 when Redis is unavailable. */
async function getGlossaryVersion(shopName: string): Promise<number> {
  try {
    const { getRedis } = await import("./redisV4.js");
    const redis = getRedis();
    const v = await redis.get(glossaryVersionKey(shopName));
    return v ? Number(v) : 0;
  } catch {
    return 0;
  }
}

function glossaryPath(shopName: string): string {
  return `glossary/${shopName}.json`;
}

/**
 * Returns deterministic, sorted glossary instruction lines for a shop + target
 * locale. Empty array when there is no glossary.
 *
 * Cache strategy:
 *  1. Check Redis `glossary_v:{shopName}` — a timestamp bumped by the admin UI on every save.
 *  2. If the Redis version is newer than the cached entry, bust and reload from Blob.
 *  3. Otherwise serve from in-process cache (TTL 5 min), so hot batches skip the Blob read.
 *
 * Net effect: glossary edits in the admin UI take effect within seconds on running workers.
 * Never throws.
 */
export async function loadGlossaryLines(shopName: string, target: string): Promise<string[]> {
  const cacheKey = `${shopName}::${target}`;
  const now = Date.now();
  const cached = cache.get(cacheKey);

  if (cached && cached.expiresAt > now) {
    // Fast path: still within TTL window — check version lazily only if Redis is quick.
    const latestVersion = await getGlossaryVersion(shopName);
    if (latestVersion <= cached.version) return cached.lines; // not updated since last load
    // Admin saved a newer glossary — fall through to reload
  }

  let lines: string[] = [];
  let version = 0;
  try {
    version = await getGlossaryVersion(shopName);
    const file = await blobRead<GlossaryFile>(glossaryPath(shopName));
    const terms = file?.terms ?? [];
    const collected: string[] = [];
    for (const term of terms) {
      if (!term?.source) continue;
      if (term.doNotTranslate) {
        collected.push(`- Keep "${term.source}" unchanged (do not translate).`);
        continue;
      }
      const translated = term.translations?.[target];
      if (translated) {
        collected.push(`- Translate "${term.source}" as "${translated}".`);
      }
    }
    // Deterministic order keeps the system prompt prefix byte-stable for prompt caching.
    lines = collected.sort();
  } catch {
    lines = [];
  }

  cache.set(cacheKey, { lines, expiresAt: now + TTL_MS, version });
  return lines;
}

/** @internal test helper to reset the in-memory cache. */
export function __clearGlossaryCache(): void {
  cache.clear();
}
