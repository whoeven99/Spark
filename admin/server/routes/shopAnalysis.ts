/**
 * Admin API for shop analysis jobs and their results.
 *
 * POST   /:shopName/trigger            — queue a new analysis
 * GET    /:shopName/status             — current job state + metrics
 * GET    /:shopName/profile            — read ShopProfile from Blob
 * PUT    /:shopName/profile            — manually edit & save ShopProfile
 * GET    /:shopName/glossary-draft     — read draft GlossaryFile from Blob
 * POST   /:shopName/approve-glossary   — promote draft → live glossary
 */

import { Router } from "express";
import { getShopAnalysisContainer, isCosmosConfigured } from "../lib/cosmos.js";
import { blobRead, blobWrite, isBlobConfigured } from "../lib/blob.js";
import { getRedis } from "../lib/redis.js";
import type { GlossaryTerm } from "./glossary.js";

// ── Local type definitions (mirrored from worker) ────────────────────────────

type ShopAnalysisStatus =
  | "SCAN_QUEUED"
  | "SCANNING"
  | "ANALYZE_QUEUED"
  | "ANALYZING"
  | "COMPLETED"
  | "FAILED";

type ShopAnalysisJob = {
  id: string;
  shopName: string;
  status: ShopAnalysisStatus;
  sourceLanguage: string;
  modules: string[];
  triggeredBy: string;
  claimedBy: string | null;
  claimedAt: string | null;
  lastHeartbeat: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  metrics: {
    scannedModules: number;
    scannedResources: number;
    analyzedChunks: number;
    glossaryDraftCount: number;
  };
  errorMessage: string | null;
};

type ShopProfile = {
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

export const shopAnalysisRouter = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function profileBlobPath(shopName: string) { return `shop-profile/${shopName}/profile.json`; }
function draftBlobPath(shopName: string)   { return `shop-profile/${shopName}/glossary-draft.json`; }
function liveBlobPath(shopName: string)    { return `glossary/${shopName}.json`; }

async function bumpRedisKey(key: string): Promise<void> {
  try {
    const redis = getRedis();
    if (!redis) return;
    await redis.set(key, Date.now().toString(), "EX", 7 * 86400);
  } catch { /* best-effort */ }
}

async function getJob(shopName: string): Promise<ShopAnalysisJob | null> {
  try {
    const { resource } = await getShopAnalysisContainer()
      .item(shopName, shopName)
      .read<ShopAnalysisJob>();
    return resource ?? null;
  } catch {
    return null;
  }
}

// ── POST /:shopName/trigger ───────────────────────────────────────────────────

shopAnalysisRouter.post("/:shopName/trigger", async (req, res) => {
  const { shopName } = req.params;

  if (!isCosmosConfigured()) {
    res.status(503).json({ error: "Cosmos not configured" });
    return;
  }

  const sourceLanguage: string = (req.body?.sourceLanguage as string | undefined)?.trim() || "zh-CN";
  const modules: string[] = Array.isArray(req.body?.modules) && req.body.modules.length
    ? req.body.modules
    : ["product", "collection", "article", "blog", "page", "shop"];

  try {
    // Check for an already-running job
    const existing = await getJob(shopName);
    if (existing && ["SCAN_QUEUED", "SCANNING", "ANALYZE_QUEUED", "ANALYZING"].includes(existing.status)) {
      res.status(409).json({ error: `Analysis already running (status: ${existing.status})`, job: existing });
      return;
    }

    const now = new Date().toISOString();
    const job: ShopAnalysisJob = {
      id: shopName,
      shopName,
      status: "SCAN_QUEUED",
      sourceLanguage,
      modules,
      triggeredBy: (req as unknown as { user?: { email?: string } }).user?.email ?? "admin",
      claimedBy: null,
      claimedAt: null,
      lastHeartbeat: null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      metrics: { scannedModules: 0, scannedResources: 0, analyzedChunks: 0, glossaryDraftCount: 0 },
      errorMessage: null,
    };

    await getShopAnalysisContainer().items.upsert<ShopAnalysisJob>(job);

    // Push hint so the worker picks it up on next poll cycle
    const redis = getRedis();
    if (redis) {
      await redis.rpush(
        "translate:v4:hint:analysis",
        JSON.stringify({ shopName, sourceLanguage, modules }),
      );
    }

    res.json({ ok: true, job });
  } catch (err) {
    console.error("[shopAnalysis/trigger]", err);
    res.status(500).json({ error: String(err) });
  }
});

// ── GET /:shopName/status ─────────────────────────────────────────────────────

shopAnalysisRouter.get("/:shopName/status", async (req, res) => {
  if (!isCosmosConfigured()) {
    res.json({ job: null, note: "Cosmos not configured" });
    return;
  }
  try {
    const job = await getJob(req.params.shopName);
    res.json({ job });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── GET /:shopName/profile ────────────────────────────────────────────────────

shopAnalysisRouter.get("/:shopName/profile", async (req, res) => {
  if (!isBlobConfigured()) { res.json({ profile: null }); return; }
  try {
    const profile = await blobRead<ShopProfile>(profileBlobPath(req.params.shopName));
    res.json({ profile });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── PUT /:shopName/profile ────────────────────────────────────────────────────

shopAnalysisRouter.put("/:shopName/profile", async (req, res) => {
  if (!isBlobConfigured()) { res.status(503).json({ error: "Blob not configured" }); return; }
  try {
    const profile = req.body as ShopProfile;
    if (!profile || typeof profile.industry !== "string") {
      res.status(400).json({ error: "Invalid profile body" });
      return;
    }
    profile.shopName = req.params.shopName; // ensure consistency
    await blobWrite(profileBlobPath(req.params.shopName), profile);
    await bumpRedisKey(`translate:v4:profile_v:${req.params.shopName}`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── GET /:shopName/glossary-draft ─────────────────────────────────────────────

shopAnalysisRouter.get("/:shopName/glossary-draft", async (req, res) => {
  if (!isBlobConfigured()) { res.json({ terms: [], status: null }); return; }
  try {
    const draft = await blobRead<{ status: string; terms: GlossaryTerm[]; generatedAt?: string }>(
      draftBlobPath(req.params.shopName),
    );
    res.json({ terms: draft?.terms ?? [], status: draft?.status ?? null, generatedAt: draft?.generatedAt });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── POST /:shopName/approve-glossary ──────────────────────────────────────────
// Promote the draft glossary into the live glossary.
// mode = "merge" (default) | "replace"

shopAnalysisRouter.post("/:shopName/approve-glossary", async (req, res) => {
  if (!isBlobConfigured()) { res.status(503).json({ error: "Blob not configured" }); return; }
  const mode: "merge" | "replace" = req.body?.mode === "replace" ? "replace" : "merge";

  try {
    const draft = await blobRead<{ terms: GlossaryTerm[] }>(draftBlobPath(req.params.shopName));
    if (!draft?.terms?.length) {
      res.status(400).json({ error: "No draft glossary found" });
      return;
    }

    let finalTerms: GlossaryTerm[];
    if (mode === "replace") {
      finalTerms = draft.terms;
    } else {
      const live = await blobRead<{ terms: GlossaryTerm[] }>(liveBlobPath(req.params.shopName));
      finalTerms = mergeTerms(live?.terms ?? [], draft.terms);
    }

    await blobWrite(liveBlobPath(req.params.shopName), { terms: finalTerms });
    await bumpRedisKey(`translate:v4:glossary_v:${req.params.shopName}`);
    res.json({ ok: true, total: finalTerms.length, mode });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Merge helper ──────────────────────────────────────────────────────────────

function mergeTerms(existing: GlossaryTerm[], incoming: GlossaryTerm[]): GlossaryTerm[] {
  const map = new Map(existing.map((t) => [t.source, { ...t }]));
  for (const inc of incoming) {
    const ex = map.get(inc.source);
    if (!ex) { map.set(inc.source, inc); continue; }
    if (inc.translations) ex.translations = { ...inc.translations, ...ex.translations };
    if (!ex.note && inc.note) ex.note = inc.note;
    if (inc.doNotTranslate) ex.doNotTranslate = true;
  }
  return [...map.values()];
}
