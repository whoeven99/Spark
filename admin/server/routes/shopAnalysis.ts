/**
 * Admin API for shop analysis jobs and their results.
 *
 * POST   /:shopName/trigger            — queue a new analysis
 * GET    /:shopName/status             — current job state + metrics
 * GET    /:shopName/profile            — read ShopProfile from Blob
 * PUT    /:shopName/profile            — manually edit & save ShopProfile
 */

import { Router } from "express";
import { ensureShopAnalysisContainer, isCosmosConfigured } from "../lib/cosmos.js";
import { blobRead, blobWrite, isBlobConfigured } from "../lib/blob.js";
import { getRedis } from "../lib/redis.js";

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

function profileBlobPath(shopName: string) {
  return `shop-profile/${shopName}/profile.json`;
}

async function bumpRedisKey(key: string): Promise<void> {
  try {
    const redis = getRedis();
    if (!redis) return;
    await redis.set(key, Date.now().toString(), "EX", 7 * 86400);
  } catch { /* best-effort */ }
}

async function getJob(shopName: string): Promise<ShopAnalysisJob | null> {
  try {
    const container = await ensureShopAnalysisContainer();
    const { resource } = await container
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
    : ["PRODUCT", "COLLECTION", "ARTICLE", "BLOG", "PAGE", "SHOP"];

  try {
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

    const container = await ensureShopAnalysisContainer();
    await container.items.upsert<ShopAnalysisJob>(job);

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
    profile.shopName = req.params.shopName;
    await blobWrite(profileBlobPath(req.params.shopName), profile);
    await bumpRedisKey(`translate:v4:profile_v:${req.params.shopName}`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
