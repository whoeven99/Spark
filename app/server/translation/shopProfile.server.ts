/**
 * Shop profile & glossary draft blob helpers (app side).
 *
 * Reads/writes:
 *  - Blob    shop-profile/{shop}/profile.json
 *  - Blob    shop-profile/{shop}/glossary-draft.json
 *  - Redis   translate:v4:profile_v:{shop}
 *  - Redis   translate:v4:glossary_v:{shop}
 */

import {
  getTranslateV3BlobContainer,
  translateV3ReadTextFull,
} from "./translateBlobStore.server";
import { getTranslateRedisClient } from "./translateRedis.server";
import type { GlossaryTerm } from "./glossary.server";

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

function profileBlobPath(shopName: string): string {
  return `shop-profile/${shopName}/profile.json`;
}

function draftBlobPath(shopName: string): string {
  return `shop-profile/${shopName}/glossary-draft.json`;
}

export async function readShopProfile(shopName: string): Promise<ShopProfile | null> {
  const raw = await translateV3ReadTextFull(profileBlobPath(shopName));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ShopProfile;
  } catch {
    return null;
  }
}

export async function writeShopProfile(shopName: string, profile: ShopProfile): Promise<void> {
  const container = await getTranslateV3BlobContainer();
  const text = JSON.stringify(profile, null, 2);
  const client = container.getBlockBlobClient(profileBlobPath(shopName));
  await client.upload(text, Buffer.byteLength(text, "utf8"), {
    blobHTTPHeaders: { blobContentType: "application/json; charset=utf-8" },
  });
}

type GlossaryDraftFile = {
  terms: GlossaryTerm[];
  status: string;
  generatedAt?: string;
};

export async function readGlossaryDraft(shopName: string): Promise<GlossaryDraftFile | null> {
  const raw = await translateV3ReadTextFull(draftBlobPath(shopName));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as GlossaryDraftFile;
  } catch {
    return null;
  }
}

export async function bumpProfileVersion(shopName: string): Promise<void> {
  try {
    await getTranslateRedisClient().set(
      `translate:v4:profile_v:${shopName}`,
      Date.now().toString(),
      "EX",
      7 * 86400,
    );
  } catch {
    /* best-effort */
  }
}

export async function bumpGlossaryVersion(shopName: string): Promise<void> {
  try {
    await getTranslateRedisClient().set(
      `translate:v4:glossary_v:${shopName}`,
      Date.now().toString(),
      "EX",
      7 * 86400,
    );
  } catch {
    /* best-effort */
  }
}
