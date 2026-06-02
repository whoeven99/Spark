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

type CacheEntry = { lines: string[]; expiresAt: number };
const cache = new Map<string, CacheEntry>();
const TTL_MS = 5 * 60_000;

function glossaryPath(shopName: string): string {
  return `glossary/${shopName}.json`;
}

/**
 * Returns deterministic, sorted glossary instruction lines for a shop + target
 * locale. Empty array when there is no glossary. Cached in-memory for 5 min to
 * avoid a Blob read per batch. Never throws.
 */
export async function loadGlossaryLines(shopName: string, target: string): Promise<string[]> {
  const cacheKey = `${shopName}::${target}`;
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.lines;

  let lines: string[] = [];
  try {
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
    // Deterministic order keeps the system prompt prefix byte-stable for caching.
    lines = collected.sort();
  } catch {
    lines = [];
  }

  cache.set(cacheKey, { lines, expiresAt: now + TTL_MS });
  return lines;
}

/** @internal test helper to reset the in-memory cache. */
export function __clearGlossaryCache(): void {
  cache.clear();
}
