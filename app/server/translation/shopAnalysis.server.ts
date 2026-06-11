/**
 * Shop Analysis — server-side helpers (app side).
 *
 * Reads/writes:
 *  - Cosmos  shop_analysis_jobs container  (job status)
 *  - Blob    shop-profile/{shop}/profile.json
 *  - Blob    shop-profile/{shop}/glossary-draft.json
 *  - Redis   translate:v4:profile_v:{shop}     (version bump → worker cache bust)
 *  - Redis   translate:v4:hint:analysis        (wake worker immediately)
 */

import { CosmosClient, type Container } from "@azure/cosmos";
import {
  getTranslateV3BlobContainer,
  translateV3ReadTextFull,
} from "./translateBlobStore.server";
import { getTranslateRedisClient } from "./translateRedis.server";
import type { GlossaryTerm } from "./glossary.server";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ShopAnalysisStatus =
  | "SCAN_QUEUED"
  | "SCANNING"
  | "ANALYZE_QUEUED"
  | "ANALYZING"
  | "COMPLETED"
  | "FAILED";

export type ShopAnalysisTarget = "profile" | "glossary" | "both";

export type ShopAnalysisJob = {
  id: string;
  shopName: string;
  status: ShopAnalysisStatus;
  target?: ShopAnalysisTarget;
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

export const ANALYSIS_RUNNING_STATUSES: ShopAnalysisStatus[] = [
  "SCAN_QUEUED",
  "SCANNING",
  "ANALYZE_QUEUED",
  "ANALYZING",
];

// ── Cosmos ────────────────────────────────────────────────────────────────────

let _cosmosClient: CosmosClient | null = null;
let _ensureAnalysisContainerPromise: Promise<Container> | null = null;

function getCosmosClient(): CosmosClient {
  if (!_cosmosClient) {
    const endpoint = process.env.COSMOS_ENDPOINT?.trim();
    const key = process.env.COSMOS_KEY?.trim();
    if (!endpoint || !key) throw new Error("COSMOS_ENDPOINT and COSMOS_KEY are required");
    _cosmosClient = new CosmosClient({ endpoint, key });
  }
  return _cosmosClient;
}

function shopAnalysisDatabaseId(): string {
  return process.env.COSMOS_TRANSLATION_DATABASE_ID?.trim() || "translation";
}

function shopAnalysisContainerId(): string {
  return process.env.COSMOS_SHOP_ANALYSIS_CONTAINER?.trim() || "shop_analysis_jobs";
}

/** Ensures translation DB + shop_analysis_jobs container exist (partition key /shopName). */
async function ensureAnalysisContainer(): Promise<Container> {
  if (_ensureAnalysisContainerPromise) return _ensureAnalysisContainerPromise;

  _ensureAnalysisContainerPromise = (async () => {
    const client = getCosmosClient();
    const { database } = await client.databases.createIfNotExists({
      id: shopAnalysisDatabaseId(),
    });
    const { container } = await database.containers.createIfNotExists({
      id: shopAnalysisContainerId(),
      partitionKey: { paths: ["/shopName"] },
    });
    return container;
  })();

  return _ensureAnalysisContainerPromise;
}

export function isCosmosConfigured(): boolean {
  return Boolean(process.env.COSMOS_ENDPOINT?.trim() && process.env.COSMOS_KEY?.trim());
}

export async function getAnalysisJob(shopName: string): Promise<ShopAnalysisJob | null> {
  if (!isCosmosConfigured()) return null;
  try {
    const container = await ensureAnalysisContainer();
    const { resource } = await container
      .item(shopName, shopName)
      .read<ShopAnalysisJob>();
    return resource ?? null;
  } catch {
    return null;
  }
}

export async function upsertAnalysisJob(job: ShopAnalysisJob): Promise<void> {
  const container = await ensureAnalysisContainer();
  await container.items.upsert<ShopAnalysisJob>(job);
}

// ── Blob ──────────────────────────────────────────────────────────────────────

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

// ── Redis ─────────────────────────────────────────────────────────────────────

export async function bumpProfileVersion(shopName: string): Promise<void> {
  try {
    await getTranslateRedisClient().set(
      `translate:v4:profile_v:${shopName}`,
      Date.now().toString(),
      "EX",
      7 * 86400,
    );
  } catch { /* best-effort */ }
}

export async function bumpGlossaryVersion(shopName: string): Promise<void> {
  try {
    await getTranslateRedisClient().set(
      `translate:v4:glossary_v:${shopName}`,
      Date.now().toString(),
      "EX",
      7 * 86400,
    );
  } catch { /* best-effort */ }
}

export async function pushAnalysisHint(
  shopName: string,
  sourceLanguage: string,
  modules: string[],
  target: ShopAnalysisTarget,
): Promise<void> {
  try {
    await getTranslateRedisClient().rpush(
      "translate:v4:hint:analysis",
      JSON.stringify({ shopName, sourceLanguage, modules, target }),
    );
  } catch { /* best-effort */ }
}
