/**
 * Admin API for translation style shop profile (Blob).
 *
 * GET    /:shopName/profile            — read ShopProfile from Blob
 * PUT    /:shopName/profile            — manually edit & save ShopProfile
 */

import { Router } from "express";
import { blobRead, blobWrite, isBlobConfigured } from "../lib/blob.js";
import { getRedis } from "../lib/redis.js";

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

export const shopStyleProfileRouter = Router();

function profileBlobPath(shopName: string) {
  return `shop-profile/${shopName}/profile.json`;
}

async function bumpRedisKey(key: string): Promise<void> {
  try {
    const redis = getRedis();
    if (!redis) return;
    await redis.set(key, Date.now().toString(), "EX", 7 * 86400);
  } catch {
    /* best-effort */
  }
}

shopStyleProfileRouter.get("/:shopName/profile", async (req, res) => {
  if (!isBlobConfigured()) {
    res.json({ profile: null });
    return;
  }
  try {
    const profile = await blobRead<ShopProfile>(profileBlobPath(req.params.shopName));
    res.json({ profile });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

shopStyleProfileRouter.put("/:shopName/profile", async (req, res) => {
  if (!isBlobConfigured()) {
    res.status(503).json({ error: "Blob not configured" });
    return;
  }
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
