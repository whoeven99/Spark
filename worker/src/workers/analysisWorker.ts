/**
 * Shop Analysis Worker
 *
 * Two-phase pipeline:
 *   Phase 1  SCANNING   — fetch all source-language content from Shopify
 *                         (same mechanism as initWorker, no target-locale filter)
 *   Phase 2  ANALYZING  — send content to LLM in batches, accumulate observations,
 *                         synthesise into ShopProfile + glossary draft
 *
 * Results are written to Blob:
 *   shop-profile/{shopName}/profile.json
 *   shop-profile/{shopName}/glossary-draft.json
 *
 * Raw scan chunks are written to analysis/{shopName}/raw/… during phase 1
 * and deleted after phase 2 completes (to save Blob cost).
 */

import { hostname } from "os";
import { getRedis, HINT_KEYS, type AnalysisHintPayload } from "../services/redisV4.js";
import { blobRead, blobWrite, blobListPaths, blobDelete } from "../services/blobV4.js";
import { fetchTranslatableResources } from "../services/shopifyFetch.js";
import { getShopAccessToken } from "../services/shopAccessToken.js";
import {
  claimAnalysisJob,
  updateAnalysisJob,
  heartbeatAnalysis,
  findAnalysisJobs,
  ANALYSIS_WORKER_ID,
  type ShopAnalysisJob,
} from "../services/cosmosAnalysis.js";
import {
  profileBlobPath,
  glossaryDraftBlobPath,
  analysisRawChunkPath,
  type ShopProfile,
} from "../services/shopProfile.js";
import type { GlossaryTerm } from "../services/glossary.js";

// ── Config ────────────────────────────────────────────────────────────────────

/** Max resources sampled per module during scan (keeps LLM cost reasonable). */
const SAMPLE_PER_MODULE = Math.max(10, Number(process.env.ANALYSIS_SAMPLE_PER_MODULE) || 60);
/** Resources per LLM batch during analysis. */
const ANALYSIS_BATCH_SIZE = Math.max(5, Number(process.env.ANALYSIS_BATCH_SIZE) || 15);
const HEARTBEAT_THROTTLE_MS = 30_000;
const CHUNK_SIZE = 50; // blob chunk size for raw scan data

// ── Entry ─────────────────────────────────────────────────────────────────────

export async function runAnalysisWorker(): Promise<void> {
  // 1. Check Redis hint queue first (fast path) — must claim like initWorker
  const hint = await popAnalysisHint();
  if (hint) {
    const claimed = await claimAnalysisJob(
      hint.shopName,
      "SCAN_QUEUED",
      "SCANNING",
      ANALYSIS_WORKER_ID,
    );
    if (claimed) {
      await processAnalysisJob(claimed).catch(console.error);
      return;
    }
  }

  // 2. Poll Cosmos for queued jobs
  const scanJobs = await findAnalysisJobs("SCAN_QUEUED", 3);
  if (scanJobs.length > 0) {
    console.log(`[analysis] polled ${scanJobs.length} SCAN_QUEUED job(s)`);
  }
  for (const job of scanJobs) {
    const claimed = await claimAnalysisJob(job.shopName, "SCAN_QUEUED", "SCANNING", ANALYSIS_WORKER_ID);
    if (claimed) { await processAnalysisJob(claimed).catch(console.error); return; }
  }

  // 3. Resume interrupted analysis (ANALYZE_QUEUED)
  const analyzeJobs = await findAnalysisJobs("ANALYZE_QUEUED", 3);
  for (const job of analyzeJobs) {
    const claimed = await claimAnalysisJob(job.shopName, "ANALYZE_QUEUED", "ANALYZING", ANALYSIS_WORKER_ID);
    if (claimed) { await processAnalysisJob(claimed).catch(console.error); return; }
  }
}

async function popAnalysisHint(): Promise<AnalysisHintPayload | null> {
  try {
    const redis = getRedis();
    const raw = await redis.lpop(HINT_KEYS.analysis);
    if (!raw) return null;
    return JSON.parse(raw) as AnalysisHintPayload;
  } catch {
    return null;
  }
}

// ── Main pipeline ─────────────────────────────────────────────────────────────

async function processAnalysisJob(job: ShopAnalysisJob): Promise<void> {
  const { shopName } = job;
  let lastHeartbeatAt = 0;

  const throttledHeartbeat = async () => {
    const now = Date.now();
    if (now - lastHeartbeatAt > HEARTBEAT_THROTTLE_MS) {
      lastHeartbeatAt = now;
      await heartbeatAnalysis(shopName);
    }
  };

  try {
    const token = await getShopAccessToken(shopName);
    let metrics = { ...job.metrics };

    // ── Phase 1: SCANNING ──────────────────────────────────────────────────
    if (job.status === "SCANNING") {
      console.log(`[analysis] scanning shop=${shopName} modules=${job.modules.join(",")}`);
      let scannedResources = metrics.scannedResources;

      for (let mi = 0; mi < job.modules.length; mi++) {
        const module = job.modules[mi];
        await throttledHeartbeat();
        console.log(`[analysis] scan module=${module} (${mi + 1}/${job.modules.length})`);

        const chunks = await fetchTranslatableResources(
          shopName, token, module,
          SAMPLE_PER_MODULE,  // limitPerType = sample cap
          CHUNK_SIZE,
          {
            // Analysis reads source content; targetLocale is unused but required by type.
            // isCover/isHandle = true means "include everything" (no key filtering).
            targetLocale: job.sourceLanguage,
            isCover: true,
            isHandle: true,
            onPage: throttledHeartbeat,
          },
        );
        if (chunks.length === 0) {
          metrics = { ...metrics, scannedModules: mi + 1, scannedResources };
          await updateAnalysisJob(shopName, { metrics });
          continue;
        }

        await Promise.all(
          chunks.map((chunk, i) =>
            blobWrite(analysisRawChunkPath(shopName, module, i), chunk),
          ),
        );
        scannedResources += chunks.reduce((s, c) => s + c.length, 0);
        metrics = { ...metrics, scannedModules: mi + 1, scannedResources };
        await updateAnalysisJob(shopName, { metrics });
      }

      console.log(`[analysis] scan done shop=${shopName} resources=${scannedResources}`);
      metrics = {
        ...metrics,
        scannedModules: job.modules.length,
        scannedResources,
      };
      await updateAnalysisJob(shopName, {
        status: "ANALYZE_QUEUED",
        claimedBy: null,
        metrics,
      });
      // Re-claim immediately for phase 2
      const reclaimed = await claimAnalysisJob(shopName, "ANALYZE_QUEUED", "ANALYZING", ANALYSIS_WORKER_ID);
      if (!reclaimed) return; // another worker picked it up — that's fine
      job = reclaimed;
      metrics = { ...job.metrics };
    }

    // ── Phase 2: ANALYZING ─────────────────────────────────────────────────
    if (job.status === "ANALYZING") {
      console.log(`[analysis] analyzing shop=${shopName}`);
      const { profile, draftTerms, analyzedChunks } =
        await runLLMAnalysis(shopName, job, throttledHeartbeat, async (done) => {
          metrics = { ...metrics, analyzedChunks: done };
          await updateAnalysisJob(shopName, { metrics });
        });

      // Write results
      const fullProfile: ShopProfile = {
        ...profile,
        shopName,
        sourceLanguage: job.sourceLanguage,
        analyzedAt: new Date().toISOString(),
        analyzedJobId: job.id,
      };
      await blobWrite(profileBlobPath(shopName), fullProfile);
      await blobWrite(glossaryDraftBlobPath(shopName), {
        status: "draft",
        generatedAt: new Date().toISOString(),
        sourceJobId: job.id,
        terms: draftTerms,
      });

      // Bump Redis version keys so workers/admin notice immediately
      await bumpRedisVersion(shopName);

      // Clean up raw chunks (best-effort)
      await deleteRawChunks(shopName, job.modules);

      await updateAnalysisJob(shopName, {
        status: "COMPLETED",
        completedAt: new Date().toISOString(),
        claimedBy: null,
        metrics: {
          ...metrics,
          analyzedChunks,
          glossaryDraftCount: draftTerms.length,
        },
      });
      console.log(
        `[analysis] done shop=${shopName} profile.industry="${fullProfile.industry}"` +
        ` glossaryDraft=${draftTerms.length}`,
      );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[analysis] failed shop=${shopName}`, e);
    await updateAnalysisJob(shopName, {
      status: "FAILED",
      claimedBy: null,
      errorMessage: msg,
    }).catch(() => {});
  }
}

// ── LLM analysis ──────────────────────────────────────────────────────────────

type ChunkResult = {
  terms: GlossaryTerm[];
  highFreqTerms: string[];
  styleObs: string[];
};

type AnalysisResult = {
  profile: Omit<ShopProfile, "shopName" | "sourceLanguage" | "analyzedAt" | "analyzedJobId">;
  draftTerms: GlossaryTerm[];
  analyzedChunks: number;
};

async function runLLMAnalysis(
  shopName: string,
  job: ShopAnalysisJob,
  heartbeat: () => Promise<void>,
  onBatchDone?: (analyzedChunks: number) => Promise<void>,
): Promise<AnalysisResult> {
  // Collect all raw chunk paths
  const allChunkPaths: string[] = [];
  for (const module of job.modules) {
    const paths = await blobListPaths(`analysis/${shopName}/raw/${module}/`);
    allChunkPaths.push(...paths.filter((p) => p.endsWith(".json")));
  }

  if (allChunkPaths.length === 0) {
    return {
      profile: emptyProfile(),
      draftTerms: [],
      analyzedChunks: 0,
    };
  }

  // Flatten all resources across all chunks, then batch for LLM
  const allResources: Array<{ resourceId: string; fields: Array<{ key: string; value: string }> }> = [];
  for (const path of allChunkPaths) {
    const chunk = await blobRead<typeof allResources>(path);
    if (chunk) allResources.push(...chunk);
  }

  // Accumulate results across all LLM calls
  const accTerms: GlossaryTerm[] = [];
  const accHighFreq: string[] = [];
  const accStyleObs: string[] = [];
  let analyzedChunks = 0;

  // Process in batches
  for (let i = 0; i < allResources.length; i += ANALYSIS_BATCH_SIZE) {
    const batch = allResources.slice(i, i + ANALYSIS_BATCH_SIZE);
    await heartbeat();
    try {
      const result = await analyzeBatch(batch, job.sourceLanguage);
      accTerms.push(...result.terms);
      accHighFreq.push(...result.highFreqTerms);
      accStyleObs.push(...result.styleObs);
      analyzedChunks++;
      await onBatchDone?.(analyzedChunks);
    } catch (e) {
      console.warn(`[analysis] batch ${i}-${i + ANALYSIS_BATCH_SIZE} failed`, e);
    }
  }

  // De-duplicate accumulations
  const mergedTerms = mergeTerms(accTerms);
  const topHighFreq = deduplicateTopN(accHighFreq, 30);
  const topStyleObs = deduplicateTopN(accStyleObs, 10);

  // Final synthesis call
  await heartbeat();
  const profile = await synthesizeProfile({
    highFreqTerms: topHighFreq,
    styleObs: topStyleObs,
    termCount: mergedTerms.length,
    sampleContent: buildSampleContent(allResources.slice(0, 5)),
  });

  return { profile, draftTerms: mergedTerms, analyzedChunks };
}

// ── LLM calls ─────────────────────────────────────────────────────────────────

const CHUNK_ANALYSIS_PROMPT = `You extract e-commerce translation data from product content.

Given product fields (titles, descriptions, tags…), return JSON:
{
  "terms": [
    {"source": "brand/term", "doNotTranslate": true, "note": "brand name"},
    {"source": "闪购", "translations": {"en": "Flash Sale"}, "note": "promo term"}
  ],
  "highFreqTerms": ["Flash Sale", "Limited Edition"],
  "styleObs": ["Uses short punchy titles", "Casual informal tone with emoji"]
}

Rules:
- terms: brand names (doNotTranslate:true), product jargon, promo vocabulary, SKU patterns
- highFreqTerms: words/phrases that repeat across products (strings only, max 10)
- styleObs: 1-3 observations about writing style / tone patterns
- If content appears to already have translations, include them in translations{}
- Return ONLY the JSON object, no markdown`;

const SYNTHESIS_PROMPT = `You are synthesising a shop profile for an e-commerce translation system.

Input data aggregated from scanning the store's products:
{DATA}

Create a concise shop profile in JSON:
{
  "industry": "one-line description of the shop's category/niche",
  "toneOfVoice": "description of brand voice and writing style",
  "targetAudience": "who they sell to",
  "highFrequencyTerms": ["top", "recurring", "terms", "…"],
  "styleNotes": ["actionable note for translators", "…"],
  "translationInstructions": "2-3 sentence guidance for translators covering tone, things to keep unchanged, and special rules"
}

Return ONLY the JSON object, no markdown.`;

async function callAnalysisLLM(systemPrompt: string, userContent: string): Promise<string> {
  const deepseek = (process.env.DEEPSEEK_API_KEYS?.split(",")[0] ?? process.env.DEEPSEEK_API_KEY)?.trim();
  const openai = (process.env.OPENAI_API_KEYS?.split(",")[0] ?? process.env.OPENAI_API_KEY)?.trim();

  let url: string, key: string, model: string;
  const isAzure = Boolean(process.env.AZURE_OPENAI_ENDPOINT?.trim() && !deepseek && !openai);

  if (deepseek) {
    url = "https://api.deepseek.com/v1/chat/completions";
    key = deepseek;
    model = process.env.DEEPSEEK_MODEL?.trim() || "deepseek-chat";
  } else if (openai) {
    url = "https://api.openai.com/v1/chat/completions";
    key = openai;
    model = "gpt-4o-mini";
  } else if (isAzure) {
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT!.trim();
    const deploy = process.env.AZURE_OPENAI_DEPLOYMENT?.trim() || "gpt-4o-mini";
    const ver = process.env.AZURE_OPENAI_API_VERSION?.trim() || "2024-02-01";
    url = `${endpoint}/openai/deployments/${deploy}/chat/completions?api-version=${ver}`;
    key = process.env.AZURE_OPENAI_API_KEY!.trim();
    model = deploy;
  } else {
    throw new Error("No LLM API key configured for analysis");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(isAzure ? { "api-key": key } : { Authorization: `Bearer ${key}` }),
  };

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userContent  },
      ],
      temperature: 0.1,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(90_000),
  });

  if (!res.ok) throw new Error(`LLM ${res.status}: ${await res.text().catch(() => "")}`);
  const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content ?? "{}";
}

async function analyzeBatch(
  resources: Array<{ resourceId: string; fields: Array<{ key: string; value: string }> }>,
  sourceLanguage: string,
): Promise<ChunkResult> {
  const content = resources.map((r) =>
    r.fields.map((f) => f.value).filter(Boolean).join(" | "),
  ).join("\n");

  const userMsg = `Source language: ${sourceLanguage}\n\nContent:\n${content.slice(0, 8_000)}`;
  const raw = await callAnalysisLLM(CHUNK_ANALYSIS_PROMPT, userMsg);

  const parsed = JSON.parse(raw) as Partial<ChunkResult>;
  return {
    terms:         Array.isArray(parsed.terms)         ? sanitiseTerms(parsed.terms)        : [],
    highFreqTerms: Array.isArray(parsed.highFreqTerms) ? parsed.highFreqTerms.map(String)   : [],
    styleObs:      Array.isArray(parsed.styleObs)      ? parsed.styleObs.map(String)        : [],
  };
}

async function synthesizeProfile(input: {
  highFreqTerms: string[];
  styleObs: string[];
  termCount: number;
  sampleContent: string;
}): Promise<AnalysisResult["profile"]> {
  const data = JSON.stringify({
    highFrequencyTerms: input.highFreqTerms,
    styleObservations:  input.styleObs,
    glossaryTermCount:  input.termCount,
    sampleContent:      input.sampleContent,
  }, null, 2);

  const userMsg = SYNTHESIS_PROMPT.replace("{DATA}", data);
  const raw = await callAnalysisLLM("You are an e-commerce localisation expert.", userMsg);

  const parsed = JSON.parse(raw) as Partial<ShopProfile>;
  return {
    industry:               parsed.industry               ?? "E-commerce",
    toneOfVoice:            parsed.toneOfVoice            ?? "",
    targetAudience:         parsed.targetAudience         ?? "",
    highFrequencyTerms:     Array.isArray(parsed.highFrequencyTerms) ? parsed.highFrequencyTerms : input.highFreqTerms,
    styleNotes:             Array.isArray(parsed.styleNotes)         ? parsed.styleNotes         : input.styleObs,
    translationInstructions: parsed.translationInstructions ?? "",
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sanitiseTerms(raw: unknown[]): GlossaryTerm[] {
  return raw.flatMap((t): GlossaryTerm[] => {
    if (!t || typeof t !== "object") return [];
    const item = t as Record<string, unknown>;
    const source = String(item.source ?? "").trim();
    if (!source) return [];
    const out: GlossaryTerm = { source };
    if (item.doNotTranslate) out.doNotTranslate = true;
    if (typeof item.note === "string" && item.note.trim()) out.note = item.note.trim();
    if (item.translations && typeof item.translations === "object") {
      const trans: Record<string, string> = {};
      for (const [k, v] of Object.entries(item.translations as Record<string, unknown>)) {
        if (typeof v === "string" && v.trim()) trans[k] = v.trim();
      }
      if (Object.keys(trans).length) out.translations = trans;
    }
    return [out];
  });
}

function mergeTerms(terms: GlossaryTerm[]): GlossaryTerm[] {
  const map = new Map<string, GlossaryTerm>();
  for (const t of terms) {
    const existing = map.get(t.source);
    if (!existing) { map.set(t.source, { ...t }); continue; }
    if (t.translations) existing.translations = { ...t.translations, ...existing.translations };
    if (!existing.note && t.note) existing.note = t.note;
    if (t.doNotTranslate) existing.doNotTranslate = true;
  }
  return [...map.values()];
}

function deduplicateTopN(items: string[], n: number): string[] {
  const freq = new Map<string, number>();
  for (const item of items) freq.set(item, (freq.get(item) ?? 0) + 1);
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k);
}

function buildSampleContent(
  resources: Array<{ fields: Array<{ key: string; value: string }> }>,
): string {
  return resources
    .map((r) => r.fields.slice(0, 3).map((f) => f.value).join(" | "))
    .join("\n")
    .slice(0, 2_000);
}

function emptyProfile(): AnalysisResult["profile"] {
  return {
    industry: "E-commerce",
    toneOfVoice: "",
    targetAudience: "",
    highFrequencyTerms: [],
    styleNotes: [],
    translationInstructions: "",
  };
}

async function bumpRedisVersion(shopName: string): Promise<void> {
  try {
    const redis = getRedis();
    const now = Date.now().toString();
    const TTL = 7 * 86400;
    await redis.set(`translate:v4:profile_v:${shopName}`, now, "EX", TTL);
    await redis.set(`translate:v4:glossary_draft_v:${shopName}`, now, "EX", TTL);
  } catch { /* best-effort */ }
}

async function deleteRawChunks(shopName: string, modules: string[]): Promise<void> {
  try {
    const paths: string[] = [];
    for (const mod of modules) {
      const p = await blobListPaths(`analysis/${shopName}/raw/${mod}/`);
      paths.push(...p);
    }
    await Promise.all(paths.map((p) => blobDelete(p).catch(() => {})));
    console.log(`[analysis] deleted ${paths.length} raw chunks for shop=${shopName}`);
  } catch { /* best-effort */ }
}
