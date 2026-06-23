/**
 * QPS Logger — records Shopify API + LLM rate snapshots to CosmosDB
 * for per-job speed-history viewing.
 *
 * One document per job (id = jobId, partition key = jobId). Each flush appends
 * a window to `windows[]` via patch. Flush triggers:
 *  - Every FLUSH_INTERVAL_MS (default 30 s)
 *  - On stage transition (setStage)
 *  - On stop() / job completion
 */

import { CosmosClient, type Container } from "@azure/cosmos";
import { getShopifyCallStats, resetShopifyCallStats } from "./shopifyFetch.js";
import { getLlmPoolStats, getLlmErrorBreakdown, type LlmErrorTally } from "./llmTranslate.js";

export type QpsStage = "INIT" | "TRANSLATE" | "WRITEBACK" | "VERIFY";

export type QpsWindow = {
  ts: string;
  t: number;
  st: QpsStage;
  dur: number;
  shopify: {
    calls: number;
    callsPerSec: number;
    retries429: number;
    proactiveThrottleSec: number;
    bucketAvailable: number | null;
    bucketMax: number | null;
  };
  llm: {
    calls: number;
    callsPerSec: number;
    tokens: number;
    avgLatencyMs: number;
    throttleCount: number;
    concurrency: number;
    errors: number;
    errorsByKind: LlmErrorTally;
    terminalFallbacks: number;
  } | null;
};

export type QpsJobLog = {
  id: string;
  jobId: string;
  shopName: string;
  startedAt: string;
  updatedAt: string;
  windows: QpsWindow[];
};

// ── CosmosDB container ────────────────────────────────────────────────────────

let _client: CosmosClient | null = null;
let _containerPromise: Promise<Container> | null = null;

function getCosmosClient(): CosmosClient {
  if (!_client) {
    const endpoint = process.env.COSMOS_ENDPOINT?.trim();
    const key = process.env.COSMOS_KEY?.trim();
    if (!endpoint || !key) throw new Error("COSMOS_ENDPOINT and COSMOS_KEY required");
    _client = new CosmosClient({ endpoint, key });
  }
  return _client;
}

async function getQpsContainer(): Promise<Container> {
  if (_containerPromise) return _containerPromise;
  _containerPromise = (async () => {
    const client = getCosmosClient();
    const dbId = process.env.COSMOS_TRANSLATION_DATABASE_ID?.trim() || "translation";
    const containerId =
      process.env.COSMOS_QPS_LOGS_CONTAINER?.trim() || "translation_v4_qps_logs";
    const { database } = await client.databases.createIfNotExists({ id: dbId });
    const { container } = await database.containers.createIfNotExists({
      id: containerId,
      partitionKey: { paths: ["/jobId"] },
      defaultTtl: 7 * 24 * 3600, // auto-expire after 7 days
    });
    return container;
  })();
  return _containerPromise;
}

async function appendWindow(
  jobId: string,
  shopName: string,
  window: QpsWindow,
  startedAtMs: number,
): Promise<void> {
  const container = await getQpsContainer();
  const startedAt = new Date(startedAtMs).toISOString();
  const updatedAt = new Date().toISOString();

  try {
    await container.item(jobId, jobId).patch([
      { op: "add", path: "/windows/-", value: window },
      { op: "set", path: "/updatedAt", value: updatedAt },
    ]);
    return;
  } catch (e) {
    const code = (e as { code?: number }).code;
    if (code !== 404) throw e;
  }

  const doc: QpsJobLog = {
    id: jobId,
    jobId,
    shopName,
    startedAt,
    updatedAt,
    windows: [window],
  };
  try {
    await container.items.create(doc);
  } catch (e) {
    const code = (e as { code?: number }).code;
    if (code !== 409) throw e;
    await container.item(jobId, jobId).patch([
      { op: "add", path: "/windows/-", value: window },
      { op: "set", path: "/updatedAt", value: updatedAt },
    ]);
  }
}

// ── QpsLogger ─────────────────────────────────────────────────────────────────

const FLUSH_INTERVAL_MS = 30_000;

export class QpsLogger {
  private readonly jobId: string;
  private readonly shopName: string;
  private stage: QpsStage;
  private timer: NodeJS.Timeout | null = null;
  private lastFlushAt: number;
  private stopped = false;
  private writeChain: Promise<void> = Promise.resolve();
  private jobStartedAtMs: number | null = null;
  private jobStartedAtLoaded = false;

  // LLM cumulative baselines (to compute per-window deltas)
  private _llmBaseCalls = 0;
  private _llmBaseTokens = 0;
  private _llmBaseThrottle = 0;
  private _llmBaseErrors = 0;
  private _llmBaseErrKind: LlmErrorTally = { timeout: 0, parse: 0, http: 0, api: 0, other: 0 };
  private _llmBaseTerminal = 0;

  constructor(jobId: string, shopName: string, stage: QpsStage = "INIT") {
    this.jobId = jobId;
    this.shopName = shopName;
    this.stage = stage;
    this.lastFlushAt = Date.now();
    resetShopifyCallStats(shopName);
    this._seedLlmBaseline();
    this.timer = setInterval(() => { this.flush().catch(() => {}); }, FLUSH_INTERVAL_MS);
  }

  /** Call when moving to a new pipeline stage. Flushes current window first. */
  async setStage(stage: QpsStage): Promise<void> {
    await this.flush();
    this.stage = stage;
    this.lastFlushAt = Date.now();
    resetShopifyCallStats(this.shopName);
    this._seedLlmBaseline();
  }

  /** Take a snapshot and append to the job log. Best-effort — errors are logged but not thrown. */
  async flush(): Promise<void> {
    if (this.stopped) return;
    const now = Date.now();
    const durationSec = Math.max(0.1, (now - this.lastFlushAt) / 1_000);
    this.lastFlushAt = now;

    const shopify = getShopifyCallStats(this.shopName);
    resetShopifyCallStats(this.shopName);

    const llm = this._takeLlmDelta(durationSec);

    if (shopify.calls === 0 && (llm === null || llm.calls === 0)) return;

    const startedAtMs = await this._resolveJobStartedAt(now);
    const window: QpsWindow = {
      ts: new Date(now).toISOString(),
      t: Math.round((now - startedAtMs) / 1_000),
      st: this.stage,
      dur: Math.round(durationSec * 10) / 10,
      shopify: {
        calls: shopify.calls,
        callsPerSec: Math.round((shopify.calls / durationSec) * 100) / 100,
        retries429: shopify.retries429,
        proactiveThrottleSec: Math.round((shopify.proactiveWaitMs / 1_000) * 10) / 10,
        bucketAvailable: shopify.lastBucketAvailable,
        bucketMax: shopify.lastBucketMax,
      },
      llm,
    };

    this.writeChain = this.writeChain
      .then(() => appendWindow(this.jobId, this.shopName, window, startedAtMs))
      .catch((e) => {
        console.warn(`[qpsLogger] flush failed job=${this.jobId}: ${(e as Error)?.message}`);
      });
    await this.writeChain;
  }

  /** Final flush then stop the timer. */
  stop(): void {
    this.stopped = true;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this._finalFlush().catch(() => {});
  }

  private async _finalFlush(): Promise<void> {
    this.stopped = false;
    await this.flush();
    this.stopped = true;
  }

  private async _resolveJobStartedAt(now: number): Promise<number> {
    if (this.jobStartedAtLoaded && this.jobStartedAtMs != null) {
      return this.jobStartedAtMs;
    }

    const container = await getQpsContainer();
    try {
      const { resource } = await container.item(this.jobId, this.jobId).read<QpsJobLog>();
      if (resource?.startedAt) {
        this.jobStartedAtMs = new Date(resource.startedAt).getTime();
        this.jobStartedAtLoaded = true;
        return this.jobStartedAtMs;
      }
    } catch (e) {
      const code = (e as { code?: number }).code;
      if (code !== 404) throw e;
    }

    this.jobStartedAtMs = now;
    this.jobStartedAtLoaded = true;
    return this.jobStartedAtMs;
  }

  private _seedLlmBaseline(): void {
    const stats = getLlmPoolStats();
    this._llmBaseCalls    = stats.reduce((s, k) => s + k.calls, 0);
    this._llmBaseTokens   = stats.reduce((s, k) => s + k.tokens, 0);
    this._llmBaseThrottle = stats.reduce((s, k) => s + k.throttleCount, 0);
    this._llmBaseErrors   = stats.reduce((s, k) => s + k.errors, 0);
    const brk = getLlmErrorBreakdown();
    this._llmBaseErrKind  = { ...brk.byKind };
    this._llmBaseTerminal = brk.terminalFallbacks;
  }

  private _takeLlmDelta(durationSec: number): QpsWindow["llm"] {
    const stats = getLlmPoolStats();
    if (stats.length === 0) return null;

    const totalCalls    = stats.reduce((s, k) => s + k.calls, 0);
    const totalTokens   = stats.reduce((s, k) => s + k.tokens, 0);
    const totalThrottle = stats.reduce((s, k) => s + k.throttleCount, 0);
    const totalErrors   = stats.reduce((s, k) => s + k.errors, 0);
    const concurrency   = stats[0]?.poolConcurrency ?? 0;

    const weightedLatency = stats.reduce((s, k) => s + k.avgLatencyMs * k.calls, 0);
    const avgLatencyMs = totalCalls > 0 ? Math.round(weightedLatency / totalCalls) : 0;

    const dCalls    = Math.max(0, totalCalls    - this._llmBaseCalls);
    const dTokens   = Math.max(0, totalTokens   - this._llmBaseTokens);
    const dThrottle = Math.max(0, totalThrottle - this._llmBaseThrottle);
    const dErrors   = Math.max(0, totalErrors   - this._llmBaseErrors);

    const brk = getLlmErrorBreakdown();
    const dErrKind: LlmErrorTally = {
      timeout: Math.max(0, brk.byKind.timeout - this._llmBaseErrKind.timeout),
      parse:   Math.max(0, brk.byKind.parse   - this._llmBaseErrKind.parse),
      http:    Math.max(0, brk.byKind.http    - this._llmBaseErrKind.http),
      api:     Math.max(0, brk.byKind.api     - this._llmBaseErrKind.api),
      other:   Math.max(0, brk.byKind.other   - this._llmBaseErrKind.other),
    };
    const dTerminal = Math.max(0, brk.terminalFallbacks - this._llmBaseTerminal);

    this._llmBaseCalls    = totalCalls;
    this._llmBaseTokens   = totalTokens;
    this._llmBaseThrottle = totalThrottle;
    this._llmBaseErrors   = totalErrors;
    this._llmBaseErrKind  = { ...brk.byKind };
    this._llmBaseTerminal = brk.terminalFallbacks;

    return {
      calls:         dCalls,
      callsPerSec:   Math.round((dCalls / durationSec) * 100) / 100,
      tokens:        dTokens,
      avgLatencyMs,
      throttleCount: dThrottle,
      concurrency,
      errors:        dErrors,
      errorsByKind:  dErrKind,
      terminalFallbacks: dTerminal,
    };
  }
}
