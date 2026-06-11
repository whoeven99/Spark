/**
 * Shop profile loader for the translate worker.
 *
 * Reads shop-profile/{shopName}/profile.json from Blob, caches in-process
 * for 30 min, invalidated via Redis key translate:v4:profile_v:{shopName}.
 *
 * The profile is injected into the translation system prompt so the LLM
 * understands the shop's industry, tone, and special terminology rules.
 */

import { blobRead } from "./blobV4.js";

// ── Types (also re-exported for admin server) ─────────────────────────────────

export type ShopProfile = {
  shopName: string;
  sourceLanguage: string;
  analyzedAt: string;
  analyzedJobId: string;
  industry: string;
  toneOfVoice: string;
  targetAudience: string;
  highFrequencyTerms: string[];
  styleNotes: string[];
  translationInstructions: string;
};

// ── Blob paths ────────────────────────────────────────────────────────────────

export function profileBlobPath(shopName: string): string {
  return `shop-profile/${shopName}/profile.json`;
}

export function glossaryDraftBlobPath(shopName: string): string {
  return `shop-profile/${shopName}/glossary-draft.json`;
}

export function analysisRawChunkPath(shopName: string, module: string, idx: number): string {
  return `analysis/${shopName}/raw/${module}/chunk-${String(idx).padStart(2, "0")}.json`;
}

// ── In-process cache with Redis-based invalidation ───────────────────────────

type ProfileCacheEntry = { profile: ShopProfile | null; expiresAt: number; version: number };
const _cache = new Map<string, ProfileCacheEntry>();
const CACHE_TTL_MS = 30 * 60_000; // 30 min

function profileVersionKey(shopName: string): string {
  return `translate:v4:profile_v:${shopName}`;
}

async function getProfileVersion(shopName: string): Promise<number> {
  try {
    const { getRedis } = await import("./redisV4.js");
    const redis = getRedis();
    const v = await redis.get(profileVersionKey(shopName));
    return v ? Number(v) : 0;
  } catch {
    return 0;
  }
}

/**
 * Load the shop profile from Blob, with 30-min in-process cache.
 * Returns null when no profile has been generated yet.
 * Redis version key `profile_v:{shopName}` (set by admin on save) busts the cache immediately.
 */
export async function loadShopProfile(shopName: string): Promise<ShopProfile | null> {
  const now = Date.now();
  const cached = _cache.get(shopName);

  if (cached && cached.expiresAt > now) {
    const latest = await getProfileVersion(shopName);
    if (latest <= cached.version) return cached.profile;
    // Admin saved a newer profile — fall through to reload
  }

  let profile: ShopProfile | null = null;
  let version = 0;
  try {
    version = await getProfileVersion(shopName);
    profile = await blobRead<ShopProfile>(profileBlobPath(shopName));
  } catch {
    profile = null;
  }

  _cache.set(shopName, { profile, expiresAt: now + CACHE_TTL_MS, version });
  return profile;
}

export function __clearProfileCache(): void { _cache.clear(); }

// ── System prompt block ───────────────────────────────────────────────────────

/**
 * Formats the shop profile into a concise system prompt block.
 * Kept stable (no ephemeral data) so the LLM's prompt caching prefix is reused.
 */
export function buildProfilePromptBlock(profile: ShopProfile): string {
  const termList = profile.highFrequencyTerms.length
    ? `High-frequency terms: ${profile.highFrequencyTerms.join(", ")}.`
    : "";
  const styleList = profile.styleNotes.length
    ? `Style notes:\n${profile.styleNotes.map((n) => `- ${n}`).join("\n")}`
    : "";

  return `
Shop context:
- Industry: ${profile.industry}
- Tone: ${profile.toneOfVoice}
- Audience: ${profile.targetAudience}
${termList}
${styleList}
Translation instructions: ${profile.translationInstructions}
`.trim();
}
