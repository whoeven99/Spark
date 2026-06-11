/**
 * GET  /api/translate/v4/shop-analysis  → current job status
 * POST /api/translate/v4/shop-analysis  → trigger a new scan+analyse job
 */
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import { authenticate } from "../shopify.server";
import {
  isCosmosConfigured,
  getAnalysisJob,
  upsertAnalysisJob,
  pushAnalysisHint,
  ANALYSIS_RUNNING_STATUSES,
  type ShopAnalysisTarget,
  type ShopAnalysisJob,
} from "../server/translation/shopAnalysis.server";

const DEFAULT_MODULES = ["PRODUCT", "COLLECTION", "ARTICLE", "BLOG", "PAGE", "SHOP"];

function normalizeAnalysisTarget(value: unknown): ShopAnalysisTarget {
  return value === "profile" || value === "glossary" ? value : "both";
}

/** GET → return current job */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  if (!isCosmosConfigured()) {
    return data({ ok: true, job: null, note: "Cosmos 未配置" });
  }
  const job = await getAnalysisJob(session.shop);
  return data({ ok: true, job });
};

/** POST → trigger new analysis job */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  if (request.method !== "POST") {
    return data({ ok: false, error: "Method not allowed" }, { status: 405 });
  }

  if (!isCosmosConfigured()) {
    return data({ ok: false, error: "Cosmos 未配置，无法创建分析任务" }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    sourceLanguage?: string;
    modules?: string[];
    target?: unknown;
  };

  const sourceLanguage = body.sourceLanguage?.trim() || "zh-CN";
  const target = normalizeAnalysisTarget(body.target);
  const modules =
    Array.isArray(body.modules) && body.modules.length > 0
      ? body.modules
      : DEFAULT_MODULES;

  try {
    // Guard: reject if already running
    const existing = await getAnalysisJob(session.shop);
    if (existing && ANALYSIS_RUNNING_STATUSES.includes(existing.status)) {
      return data(
        { ok: false, error: `分析任务正在运行中（${existing.status}）`, job: existing },
        { status: 409 },
      );
    }

    const now = new Date().toISOString();
    const job: ShopAnalysisJob = {
      id: session.shop,
      shopName: session.shop,
      status: "SCAN_QUEUED",
      target,
      sourceLanguage,
      modules,
      triggeredBy: session.id ?? "user",
      claimedBy: null,
      claimedAt: null,
      lastHeartbeat: null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      metrics: { scannedModules: 0, scannedResources: 0, analyzedChunks: 0, glossaryDraftCount: 0 },
      errorMessage: null,
    };

    await upsertAnalysisJob(job);
    await pushAnalysisHint(session.shop, sourceLanguage, modules, target);

    return data({ ok: true, job });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[shop-analysis/trigger]", err);
    return data({ ok: false, error: msg }, { status: 500 });
  }
};
