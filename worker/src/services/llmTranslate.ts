import { tmGet, tmGetByValue, tmSet, tmSetByValue } from "./translationMemory.js";
import { loadGlossaryLines } from "./glossary.js";
import { loadShopProfile, buildProfilePromptBlock } from "./shopProfile.js";

// ─── LLM Key Pool ─────────────────────────────────────────────────────────────
//
// Multi-key pool with adaptive concurrency:
//   - OpenAI/Azure: X-RateLimit-* headers (Little's Law) or blind AIMD fallback
//   - DeepSeek: account-level in-flight concurrency per official docs (no quota
//     headers on 200); optional user_id per shop for scheduling isolation
//
// Key pool env vars (comma-separated lists override single-key variants):
//   DeepSeek  : DEEPSEEK_API_KEYS=sk-key1,sk-key2     (or single DEEPSEEK_API_KEY)
//   Model     : DEEPSEEK_MODEL (default deepseek-chat)
//
// Adaptive concurrency algorithm:
//   Each successful response carries X-RateLimit-* headers.  The pool reads
//   remaining/reset for both requests and tokens, computes a per-slot safe
//   concurrency via Little's Law (concurrency = rate × latency), and updates
//   an AdaptiveSemaphore that gates callLLMOnce.  On 429 the offending slot is
//   marked throttled and the semaphore cap is immediately recalculated so the
//   pipeline backs off without wasted retries.

type PoolInitOptions = { model?: string };

/**
 * Semaphore whose capacity can be raised or lowered at runtime.
 * Pending acquirers are woken up immediately when capacity increases.
 */
class AdaptiveSemaphore {
  private _max: number;
  private _inflight = 0;
  private readonly _waiters: Array<() => void> = [];

  constructor(initial: number) { this._max = Math.max(1, initial); }

  setMax(n: number): void {
    this._max = Math.max(1, n);
    this._flush();
  }
  get max() { return this._max; }
  get inflight() { return this._inflight; }

  async acquire(): Promise<void> {
    if (this._inflight < this._max) { this._inflight++; return; }
    await new Promise<void>((r) => this._waiters.push(r));
    this._inflight++;
  }

  release(): void {
    this._inflight = Math.max(0, this._inflight - 1);
    this._flush();
  }

  private _flush(): void {
    while (this._waiters.length > 0 && this._inflight < this._max) {
      this._waiters.shift()!();
    }
  }
}

/** Exponentially-weighted moving average (α = 0.2 by default). */
class EWMA {
  constructor(private _v: number, private readonly _a = 0.2) {}
  update(sample: number): void { this._v = this._a * sample + (1 - this._a) * this._v; }
  setValue(v: number): void { this._v = v; }
  get value(): number { return this._v; }
}

/** Copy fetch Response headers into a lowercase-key record for the pool. */
function responseHeadersToRecord(response: Response): Record<string, string> {
  const out: Record<string, string> = {};
  response.headers.forEach((value, name) => {
    out[name.toLowerCase()] = value;
  });
  return out;
}

const LIMIT_HINT_KEY_RE = /limit|rate|quota|throttle|remaining|retry/i;
const LIMIT_HINT_MAX = 24;

function formatLimitHintValue(value: unknown): string {
  if (value == null) return String(value);
  const s = typeof value === "object" ? JSON.stringify(value) : String(value);
  return s.length > 160 ? `${s.slice(0, 160)}…` : s;
}

/** Collect limit/rate/quota-related fields from API JSON (headers are logged separately). */
function collectLimitHints(value: unknown, path = "", out: string[] = [], depth = 0): string[] {
  if (depth > 8 || out.length >= LIMIT_HINT_MAX) return out;
  if (value == null) return out;

  if (Array.isArray(value)) {
    for (let i = 0; i < Math.min(value.length, 6); i++) {
      collectLimitHints(value[i], `${path}[${i}]`, out, depth + 1);
    }
    return out;
  }

  if (typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const nextPath = path ? `${path}.${key}` : key;
      if (LIMIT_HINT_KEY_RE.test(key)) {
        out.push(`${nextPath}=${formatLimitHintValue(child)}`);
      }
      collectLimitHints(child, nextPath, out, depth + 1);
    }
  }

  return out;
}

function formatLimitHintsForLog(hints: string[]): string {
  if (hints.length === 0) return "";
  return `\n  limit-related in response body:\n${hints.map((h) => `    ${h}`).join("\n")}`;
}

function limitLikeHeaderLines(headers: Record<string, string>): string {
  return Object.entries(headers)
    .filter(([k]) =>
      k.includes("ratelimit") ||
      k.includes("rate-limit") ||
      k.includes("retry-after") ||
      k.includes("x-rds-") ||
      LIMIT_HINT_KEY_RE.test(k),
    )
    .map(([k, v]) => `    ${k}: ${v}`)
    .join("\n");
}

/**
 * Normalise provider-specific reset headers.
 * - OpenAI suffixed headers (`x-ratelimit-reset-requests`) → seconds until reset.
 * - DeepSeek bare `x-ratelimit-reset` → Unix epoch seconds (see user-facing docs).
 */
function parseRateLimitResetMs(raw: number | undefined, now: number): number | undefined {
  if (raw == null || Number.isNaN(raw)) return undefined;
  if (raw >= 1_000_000_000_000) return raw;
  if (raw >= 1_000_000_000) return raw * 1_000;
  return now + raw * 1_000;
}

/**
 * Hard ceiling on pool concurrency — emergency brake only.
 * Under normal operation the adaptive semaphore stays well below this because
 * `remaining/reset × latency` is naturally bounded by the API's own capacity.
 * Only hits in pathological cases (e.g. provider returns wildly optimistic headers).
 * Not intended as an operational knob; tune key count instead.
 */
const MAX_POOL_CONCURRENCY = Math.max(1, Number(process.env.LLM_MAX_CONCURRENCY) || 512);

// ── Congestion-guard thresholds (timeout-rate driven backoff) ──────────────────
// DeepSeek 200s carry no quota headers and never 429 here, so the pool needs its
// own pressure signal. The right signal is the TIMEOUT RATE — requests dying
// before they finish — NOT absolute latency: big HTML/JSON batches legitimately
// take 20–30s per request, so an absolute-latency brake just serialised the job
// at the floor while latency stayed high anyway. We back off (same multiplicative
// cut as a 429) when timeouts climb. High avg latency under load is expected (queueing
// at the provider) — use it only to stop ramping, never to shed concurrency.
/** Recent timeout rate (EWMA, 0..1) above this → shed concurrency. Primary brake. */
const LLM_TIMEOUT_RATE_HIGH = Math.min(1, Math.max(0.01, Number(process.env.TRANSLATE_LLM_TIMEOUT_RATE_HIGH) || 0.25));
/** Avg latency above this → hold concurrency steady (no ramp). Does NOT trigger backoff. */
const RAMP_LATENCY_INHIBIT_MS = Math.max(
  10_000,
  Number(process.env.TRANSLATE_RAMP_LATENCY_INHIBIT_MS) ||
    Number(process.env.TRANSLATE_LLM_LATENCY_HIGH_MS) ||
    15_000,
);
/** Min gap between successive soft backoffs (ms) — let the cut take effect first. */
const SOFT_BACKOFF_MIN_INTERVAL_MS = Math.max(500, Number(process.env.TRANSLATE_SOFT_BACKOFF_MIN_INTERVAL_MS) || 3_000);
/** Multiplicative factor applied on each backoff (soft latency/timeout or 429). */
const BACKOFF_FACTOR = 0.7;
/** Soft back-off floor — stay above serial crawl (was 4, too easy to stall). */
const SOFT_BACKOFF_FLOOR = Math.max(1, Number(process.env.TRANSLATE_SOFT_BACKOFF_FLOOR) || 16);
/** Half-life for timeout-rate decay when no new timeouts (wall clock, not success count). */
const TIMEOUT_RATE_HALF_LIFE_MS = Math.max(
  5_000,
  Number(process.env.TRANSLATE_TIMEOUT_RATE_HALF_LIFE_MS) || 30_000,
);
/** If no timeout for this long, allow timed concurrency recovery. */
const RECOVERY_NO_TIMEOUT_MS = Math.max(
  2_000,
  Number(process.env.TRANSLATE_RECOVERY_NO_TIMEOUT_MS) || 8_000,
);
/** Min interval between timed recovery ticks. */
const RECOVERY_RAMP_INTERVAL_MS = Math.max(
  3_000,
  Number(process.env.TRANSLATE_RECOVERY_RAMP_INTERVAL_MS) || 10_000,
);
/** Concurrency added on each timed recovery tick. */
const RECOVERY_RAMP_ADD = Math.max(1, Number(process.env.TRANSLATE_RECOVERY_RAMP_ADD) || 4);

// ── DeepSeek concurrency (official docs: account-level in-flight connections) ──
// https://api-docs.deepseek.com/zh-cn/quick_start/rate_limit
// deepseek-v4-pro: 500, deepseek-v4-flash: 2500; API keys on the same account share quota.

type PoolLimitMode = "headers" | "deepseek-concurrency" | "blind";

/** Map shop domain → DeepSeek `user_id` ([a-zA-Z0-9\-_]+, max 512). */
export function sanitizeDeepSeekUserId(shop: string): string {
  const normalized = shop.trim().toLowerCase().replace(/[^a-zA-Z0-9\-_]/g, "_");
  const id = normalized.slice(0, 512);
  return id.length > 0 ? id : "unknown_shop";
}

/** Per-account concurrent in-flight request cap from DeepSeek docs (overridable). */
export function resolveDeepSeekAccountConcurrencyLimit(model: string): number {
  const override = Number(process.env.DEEPSEEK_CONCURRENCY_LIMIT);
  if (Number.isFinite(override) && override > 0) return Math.floor(override);

  const m = model.trim().toLowerCase();
  if (m.includes("flash")) return 2500;
  return 500;
}

export function resolveDeepSeekPoolConcurrency(model: string): {
  accountLimit: number;
  ceiling: number;
  initial: number;
} {
  const accountLimit = resolveDeepSeekAccountConcurrencyLimit(model);
  const util = Math.min(
    1,
    Math.max(0.1, Number(process.env.DEEPSEEK_CONCURRENCY_UTIL) || 0.45),
  );
  const ceiling = Math.min(
    MAX_POOL_CONCURRENCY,
    Math.max(1, Math.floor(accountLimit * util)),
  );
  const initialOverride = Number(process.env.DEEPSEEK_INITIAL_CONCURRENCY);
  // Start conservatively and let the latency-aware ramp find the throughput knee.
  // The account in-flight limit is large (500 pro / 2500 flash), but a single
  // slow endpoint saturates long before that: opening at ~40% of the ceiling
  // (≈205 for flash) drove per-request latency to 40s+ and a timeout storm.
  // Begin near 6% of the safe ceiling (floor 48) — high enough to parallelise
  // the first wave, low enough that the congestion guard (high latency / timeout
// rate → shed concurrency) can keep us off the cliff while success-based ramp and
// timed recovery (+4 / 15s when quiet) climb back from the soft floor (16).
  const initial = Number.isFinite(initialOverride) && initialOverride > 0
    ? Math.min(Math.floor(initialOverride), ceiling)
    : Math.min(Math.max(48, Math.floor(ceiling * 0.06)), ceiling);
  return { accountLimit, ceiling, initial };
}

// ── Slot / Pool types ────────────────────────────────────────────────────────

type SlotRateLimit = {
  limitReq: number;     // max requests per window (RPM equivalent)
  remainingReq: number; // remaining requests in current window
  resetReqMs: number;   // epoch ms when the request window resets
  limitTok: number;     // max tokens per window (TPM equivalent)
  remainingTok: number;
  resetTokMs: number;
};

type KeySlotStats = {
  calls: number;
  tokens: number;
  totalLatencyMs: number;
  throttleCount: number;
  errors: number;               // total failed call attempts (any kind, incl. retried-then-recovered)
  errorsByKind: LlmErrorTally;  // same total, split by cause for telemetry
};

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

type LlmTransport = { kind: "deepseek-fetch"; apiKey: string; chatUrl: string };

type KeySlot = {
  transport: LlmTransport;
  model: string;         // deployment / model id for this slot
  label: string;         // masked label for logs
  throttledUntil: number; // epoch ms; 0 = not throttled
  rateLimit: SlotRateLimit | null;
  stats: KeySlotStats;
};

/** Thrown by fetch transport on HTTP 429 so the pool can back off. */
class LlmRateLimitError extends Error {
  readonly response: Response;
  constructor(response: Response) {
    super("LLM rate limited");
    this.name = "LlmRateLimitError";
    this.response = response;
  }
}

/**
 * Thrown when a streaming completion stalls (no token for the idle window) or
 * exceeds the hard cap. Distinct from a parse error so callers can react
 * differently: a timeout means "too slow / stuck", not "poison data to isolate".
 */
class LlmTimeoutError extends Error {
  readonly kind: "first-token" | "idle" | "hard";
  constructor(kind: "first-token" | "idle" | "hard") {
    super(`LLM stream ${kind} timeout`);
    this.name = "LlmTimeoutError";
    this.kind = kind;
  }
}

/** Coarse classification of a non-throttle LLM call failure (telemetry + backoff). */
export type LlmErrorKind = "timeout" | "parse" | "http" | "api" | "other";

/** Per-kind tally of failed call attempts. */
export type LlmErrorTally = { timeout: number; parse: number; http: number; api: number; other: number };

function _emptyErrorTally(): LlmErrorTally {
  return { timeout: 0, parse: 0, http: 0, api: 0, other: 0 };
}

/** Bucket a thrown error so we can tell "endpoint too slow" from "bad data" from "5xx". */
function classifyLlmError(e: unknown): LlmErrorKind {
  if (e instanceof LlmTimeoutError) return "timeout";
  const msg = e instanceof Error ? e.message : String(e);
  if (/^DeepSeek HTTP \d/.test(msg)) return "http";
  if (/empty response body/i.test(msg)) return "http";
  if (/DeepSeek API error/i.test(msg)) return "api";
  if (e instanceof SyntaxError || /json|unexpected token|no json object/i.test(msg)) return "parse";
  return "other";
}

/** Map DEEPSEEK_BASE_URL → POST .../chat/completions (DeepSeek native endpoint). */
function resolveDeepSeekChatCompletionsUrl(baseURL: string): string {
  const base = baseURL.trim().replace(/\/+$/, "");
  if (base.endsWith("/chat/completions")) return base;
  return `${base}/chat/completions`;
}

type ChatCompletionInvokeResult = {
  content: string;
  tokens: number;
  response: Response;
  limitHints: string[];
};

async function fetchDeepSeekChatCompletion(
  apiKey: string,
  chatUrl: string,
  model: string,
  messages: ChatMessage[],
  timeoutMs: number,
  firstTokenTimeoutMs: number,
  userId?: string,
): Promise<ChatCompletionInvokeResult> {
  // Stream the completion so a slow-but-progressing response is NOT killed:
  // the timeout is on the *idle gap* between tokens, not the total wall clock.
  // A truly stuck connection still trips (idle), and a runaway response trips the
  // hard cap. This recovers the compute otherwise lost when a non-streaming
  // request is aborted at 90% done and re-sent from scratch.
  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: 0.1,
    response_format: { type: "json_object" },
    stream: true,
    stream_options: { include_usage: true },
  };
  if (userId) body.user_id = userId;

  const controller = new AbortController();
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let gotContent = false; // 收到首个 content token 前用宽松窗口，之后用收紧 idle 窗口
  const armIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(
      () => controller.abort(new LlmTimeoutError(gotContent ? "idle" : "first-token")),
      gotContent ? LLM_IDLE_TIMEOUT_MS : firstTokenTimeoutMs,
    );
  };
  const hardTimer = setTimeout(
    () => controller.abort(new LlmTimeoutError("hard")),
    timeoutMs,
  );
  armIdle();

  try {
    const resp = await fetch(chatUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (resp.status === 429) {
      throw new LlmRateLimitError(resp);
    }
    if (!resp.ok) {
      throw new Error(`DeepSeek HTTP ${resp.status}: ${await resp.text()}`);
    }
    if (!resp.body) {
      throw new Error("DeepSeek stream: empty response body");
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";
    let tokens = 0;
    let apiErrorMsg: string | undefined;

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      armIdle(); // got bytes → reset the idle window
      buffer += decoder.decode(value, { stream: true });

      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "" || data === "[DONE]") continue;
        try {
          const evt = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string | null }; message?: { content?: string | null } }>;
            usage?: { total_tokens?: number };
            error?: { message?: string };
          };
          if (evt.error?.message) apiErrorMsg = evt.error.message;
          const delta = evt.choices?.[0]?.delta?.content ?? evt.choices?.[0]?.message?.content;
          if (typeof delta === "string" && delta.length > 0) {
            content += delta;
            if (!gotContent) {
              gotContent = true; // 开始吐字 → 收紧空闲窗口（中途卡死更快发现）
              armIdle();
            }
          }
          if (evt.usage?.total_tokens) tokens = evt.usage.total_tokens;
        } catch {
          // partial/keepalive line — wait for more bytes
        }
      }
    }

    if (apiErrorMsg) throw new Error(`DeepSeek API error: ${apiErrorMsg}`);

    return {
      content: content || "{}",
      tokens,
      response: resp,
      limitHints: [], // body hints unavailable when streaming; headers still logged separately
    };
  } catch (e) {
    // fetch/reader rejects with the abort reason → surface our typed timeout.
    if (controller.signal.aborted && controller.signal.reason instanceof LlmTimeoutError) {
      throw controller.signal.reason;
    }
    throw e;
  } finally {
    if (idleTimer) clearTimeout(idleTimer);
    clearTimeout(hardTimer);
  }
}

async function invokeChatCompletion(
  transport: LlmTransport,
  model: string,
  messages: ChatMessage[],
  timeoutMs: number,
  firstTokenTimeoutMs: number,
  deepseekUserId?: string,
): Promise<ChatCompletionInvokeResult> {
  return fetchDeepSeekChatCompletion(
    transport.apiKey,
    transport.chatUrl,
    model,
    messages,
    timeoutMs,
    firstTokenTimeoutMs,
    deepseekUserId,
  );
}

function retryAfterMsFromResponse(response: Response, fallbackSec = 10): number {
  const retryAfterSec = Number(response.headers.get("retry-after") ?? String(fallbackSec));
  return Math.max(retryAfterSec * 1_000, 10_000);
}

// ── Pool ─────────────────────────────────────────────────────────────────────

function formatSlotQuota(rl: SlotRateLimit): string {
  const tpm =
    rl.limitTok === Infinity
      ? "TPM n/a"
      : `TPM ${rl.remainingTok}/${rl.limitTok}`;
  return `RPM ${rl.remainingReq}/${rl.limitReq}, ${tpm}`;
}

class LLMKeyPool {
  private readonly slots: KeySlot[];
  private cursor = 0;
  private readonly sem: AdaptiveSemaphore;
  /** EWMA of LLM call durations (ms). Seed at 3 s — conservative starting point. */
  private readonly latency = new EWMA(3_000);
  /** EWMA of tokens consumed per request. Used for TPM-based concurrency calc. */
  private readonly tokPerReq = new EWMA(1_000);
  /** Per-slot quota log throttle (epoch ms). */
  private readonly _quotaLogAt = new Map<string, number>();
  /** Last logged quota snapshot per slot — skip duplicate lines. */
  private readonly _lastQuotaSnap = new Map<string, string>();
  /** Slots that have logged their first successful response. */
  private readonly _firstResponseLogged = new Set<string>();
  private static readonly QUOTA_LOG_INTERVAL_MS = 10_000;

  // ── Blind AIMD (used when the provider returns no rate-limit headers) ───────
  /** True once any slot has reported recognised rate-limit headers. */
  private _hasSeenAnyHeaders = false;
  /** Successful call counter — drives additive-increase ramp in blind mode. */
  private _blindSuccesses = 0;
  /**
   * Max concurrency per key in blind mode.
   * Default 8; override with LLM_BLIND_PER_KEY_MAX env var.
   * With N keys the hard ceiling is N × this value (also bounded by MAX_POOL_CONCURRENCY).
   */
  private readonly _blindPerKeyCap =
    Math.max(1, Number(process.env.LLM_BLIND_PER_KEY_MAX) || 8);

  /** DeepSeek: account-level in-flight cap. */
  private readonly _limitMode: PoolLimitMode;
  private _deepseekConcCeiling = 0;
  private _deepseekRampSuccesses = 0;
  /** EWMA of recent timeout occurrences (1=timeout, 0=ok). Congestion signal. */
  private readonly _timeoutRate = new EWMA(0, 0.1);
  /** Wall-clock anchor for time-based timeout-rate decay (not success-driven). */
  private _timeoutRateDecayedAt = Date.now();
  /** Epoch ms of last LLM timeout — drives timed recovery. */
  private _lastTimeoutAt = 0;
  /** Epoch ms of last timed +N recovery step. */
  private _lastTimedRecoveryAt = 0;
  /** Epoch ms of last soft backoff — rate-limits successive cuts. */
  private _lastSoftBackoffAt = 0;
  /** Pool-level count of fields that exhausted retries and fell back to original. */
  private _terminalFallbacks = 0;

  constructor(slots: KeySlot[], options?: PoolInitOptions) {
    if (slots.length === 0) throw new Error("[llm-pool] no LLM API keys configured");
    this.slots = slots;

    const model = options?.model ?? (process.env.DEEPSEEK_MODEL?.trim() || "deepseek-chat");
    const slotLabels = slots.map((s) => s.label).join(", ");

    this._limitMode = "deepseek-concurrency";
    const cfg = resolveDeepSeekPoolConcurrency(model);
    this._deepseekConcCeiling = cfg.ceiling;
    this.sem = new AdaptiveSemaphore(cfg.initial);
    console.log(
      `[llm-pool] initialised — ${slots.length} slot(s): ${slotLabels}, ` +
      `deepseek concurrency mode (model=${model}, accountLimit=${cfg.accountLimit}, ` +
      `ceiling=${cfg.ceiling}, initial=${cfg.initial}; keys share account quota)`,
    );
  }

  get size(): number { return this.slots.length; }

  /**
   * Acquire a key slot + semaphore slot for one LLM call.
   * Blocks if at max concurrency or if all slots are throttled.
   *
   * Caller MUST call `release()` in a finally block.
   * Caller SHOULD call `onResponse()` on success and `onThrottle()` on 429.
   */
  async acquire(): Promise<{
    transport: LlmTransport;
    model: string;
    label: string;
    onThrottle: (waitMs: number) => void;
    onResponse: (
      headers: Record<string, string>,
      durationMs: number,
      tokens: number,
      limitHints?: string[],
    ) => void;
    onError: (kind: LlmErrorKind) => void;
    release: () => void;
  }> {
    await this.sem.acquire();

    const now = Date.now();
    for (let i = 0; i < this.slots.length; i++) {
      const idx = (this.cursor + i) % this.slots.length;
      const slot = this.slots[idx];
      if (slot.throttledUntil <= now) {
        this.cursor = (idx + 1) % this.slots.length;
        return {
          transport: slot.transport,
          model: slot.model,
          label: slot.label,
          onResponse: (
            headers: Record<string, string>,
            durationMs: number,
            tokens: number,
            limitHints: string[] = [],
          ) => {
            const headersApplied = this._applyHeaders(slot, headers);
            if (headersApplied) this._hasSeenAnyHeaders = true;
            this.latency.update(durationMs);
            if (tokens > 0) this.tokPerReq.update(tokens);
            slot.stats.calls++;
            slot.stats.tokens += tokens;
            slot.stats.totalLatencyMs += Math.round(durationMs);
            this._logResponseQuota(slot, headers, headersApplied, durationMs, tokens, limitHints);
            this._recalc();
            this._blindOnSuccess(); // no-op once headers are seen
          },
          onThrottle: (waitMs: number) => {
            slot.throttledUntil = Date.now() + waitMs;
            slot.stats.throttleCount++;
            this._recalc();
            this._blindOnThrottle(); // no-op once headers are seen
            console.warn(`[llm-pool] slot ${slot.label} throttled for ${(waitMs / 1_000).toFixed(1)}s`);
          },
          onError: (kind: LlmErrorKind) => {
            slot.stats.errors++;
            slot.stats.errorsByKind[kind]++;
            this._onAttemptError(kind);
          },
          release: () => this.sem.release(),
        };
      }
    }

    // All slots throttled: release semaphore, wait for earliest recovery, retry.
    this.sem.release();
    const earliest = Math.min(...this.slots.map((s) => s.throttledUntil));
    const waitMs = Math.max(earliest - now, 200);
    console.warn(`[llm-pool] all ${this.slots.length} slot(s) throttled — waiting ${(waitMs / 1_000).toFixed(1)}s`);
    await new Promise((r) => setTimeout(r, waitMs));
    return this.acquire();
  }

  // ── Header parsing ─────────────────────────────────────────────────────────

  private _applyHeaders(slot: KeySlot, h: Record<string, string>): boolean {
    const n = (key: string): number | undefined => {
      const v = h[key];
      return v !== undefined ? Number(v) : undefined;
    };

    // Prefer the more specific -requests/-tokens suffixed form
    const limitReq  = n("x-ratelimit-limit-requests")    ?? n("x-ratelimit-limit");
    const remReq    = n("x-ratelimit-remaining-requests") ?? n("x-ratelimit-remaining");
    const resetReqS = n("x-ratelimit-reset-requests")     ?? n("x-ratelimit-reset");
    const limitTok  = n("x-ratelimit-limit-tokens");
    const remTok    = n("x-ratelimit-remaining-tokens");
    const resetTokS = n("x-ratelimit-reset-tokens");

    if (limitReq == null || remReq == null || resetReqS == null) return false; // incomplete headers

    const now = Date.now();
    const resetReqMs = parseRateLimitResetMs(resetReqS, now);
    const resetTokMs = resetTokS != null
      ? parseRateLimitResetMs(resetTokS, now)
      : undefined;
    slot.rateLimit = {
      limitReq,
      remainingReq: remReq,
      resetReqMs:   resetReqMs ?? (slot.rateLimit?.resetReqMs ?? now + 60_000),
      limitTok:     limitTok  ?? (slot.rateLimit?.limitTok  ?? Infinity),
      remainingTok: remTok    ?? (slot.rateLimit?.remainingTok ?? Infinity),
      resetTokMs:   resetTokMs ?? (slot.rateLimit?.resetTokMs ?? now + 60_000),
    };
    return true;
  }

  /** Log first response per slot, then quota changes (throttled). */
  private _logResponseQuota(
    slot: KeySlot,
    allHeaders: Record<string, string>,
    headersApplied: boolean,
    durationMs: number,
    tokens: number,
    limitHints: string[] = [],
  ): void {
    const headerRlLines = limitLikeHeaderLines(allHeaders);
    const bodyLimitBlock = formatLimitHintsForLog(limitHints);

    if (!this._firstResponseLogged.has(slot.label)) {
      this._firstResponseLogged.add(slot.label);
      if (headersApplied && slot.rateLimit) {
        const bare = [
          allHeaders["x-ratelimit-limit"] != null
            ? `limit=${allHeaders["x-ratelimit-limit"]}`
            : null,
          allHeaders["x-ratelimit-remaining"] != null
            ? `remaining=${allHeaders["x-ratelimit-remaining"]}`
            : null,
          allHeaders["x-ratelimit-reset"] != null
            ? `reset=${allHeaders["x-ratelimit-reset"]}`
            : null,
        ].filter(Boolean).join(", ");
        console.log(
          `[llm-pool] ${slot.label} first response — ${formatSlotQuota(slot.rateLimit)}` +
          ` (${durationMs.toFixed(0)}ms, ${tokens} tok)` +
          (bare ? ` [${bare}]` : "") +
          (headerRlLines ? `\n  rate-limit-like headers:\n${headerRlLines}` : "") +
          bodyLimitBlock,
        );
        this._lastQuotaSnap.set(slot.label, formatSlotQuota(slot.rateLimit));
        this._quotaLogAt.set(slot.label, Date.now());
      } else if (this._limitMode === "deepseek-concurrency") {
        console.log(
          `[llm-pool] ${slot.label} first response — deepseek concurrency mode` +
          ` (${durationMs.toFixed(0)}ms, ${tokens} tok; no quota headers on 200 — expected per DeepSeek docs)` +
          `\n  pool concurrency=${this.sem.max}/${this._deepseekConcCeiling} (account in-flight limit)` +
          bodyLimitBlock,
        );
      } else {
        const blindCeil = this.slots.length * this._blindPerKeyCap;
        console.log(
          `[llm-pool] ${slot.label} first response — no recognized rate-limit headers` +
          ` (${durationMs.toFixed(0)}ms, ${tokens} tok)` +
          (headerRlLines
            ? `\n  rate-limit-like headers found (different names?):\n${headerRlLines}`
            : `\n  no rate-limit-like headers at all — using blind AIMD (target ceil=${blindCeil})`) +
          bodyLimitBlock,
        );
      }
      return;
    }

    if (headersApplied && slot.rateLimit) {
      this._maybeLogQuota(slot, "updated");
    }
  }

  private _maybeLogQuota(slot: KeySlot, reason: "updated" | "recalc"): void {
    const rl = slot.rateLimit;
    if (!rl) return;

    const snap = formatSlotQuota(rl);
    const now = Date.now();
    const lastAt = this._quotaLogAt.get(slot.label) ?? 0;
    const prevSnap = this._lastQuotaSnap.get(slot.label);
    const lowQuota =
      rl.limitReq > 0 && rl.remainingReq / rl.limitReq < 0.2 ||
      (rl.limitTok !== Infinity && rl.limitTok > 0 && rl.remainingTok / rl.limitTok < 0.2);
    const changed = snap !== prevSnap;
    const intervalElapsed = now - lastAt >= LLMKeyPool.QUOTA_LOG_INTERVAL_MS;

    if (!changed && !lowQuota && !intervalElapsed) return;

    this._quotaLogAt.set(slot.label, now);
    this._lastQuotaSnap.set(slot.label, snap);
    console.log(
      `[llm-pool] ${slot.label} quota ${reason} — ${snap}, pool concurrency=${this.sem.max}` +
      (lowQuota ? " (low remaining)" : ""),
    );
  }

  // ── Blind AIMD methods ─────────────────────────────────────────────────────
  //
  // Called after every successful response (_blindOnSuccess) and every 429
  // (_blindOnThrottle).  Both are no-ops once real rate-limit headers have been
  // seen, because the Little's Law path in _recalc() takes over.

  /**
   * Additive increase: after every RAMP_STEP successful calls without a 429,
   * increment the semaphore cap by 1.  The ceiling is slots × _blindPerKeyCap
   * (default 8 per key, so 24 total with 3 keys).
   */
  private _blindOnSuccess(): void {
    if (this._limitMode === "deepseek-concurrency") {
      this._deepseekOnSuccess();
      return;
    }
    if (this._hasSeenAnyHeaders) return;
    this._blindSuccesses++;
    const RAMP_STEP = 2; // add 1 concurrency unit every 2 successful calls
    const blindCeil = Math.min(this.slots.length * this._blindPerKeyCap, MAX_POOL_CONCURRENCY);
    if (this._blindSuccesses % RAMP_STEP === 0 && this.sem.max < blindCeil) {
      const newMax = this.sem.max + 1;
      this.sem.setMax(newMax);
      console.log(
        `[llm-pool] blind ramp → concurrency=${newMax}/${blindCeil}` +
        ` (${this._blindSuccesses} total successes, no rate-limit headers)`,
      );
    }
  }

  /**
   * Multiplicative decrease: on a 429, halve the concurrency cap and reset the
   * success counter so the ramp restarts from the new lower baseline.
   */
  /**
   * DeepSeek docs: limit = concurrent in-flight requests per account.
   * Ramp toward documented ceiling; back off on 429.
   */
  private _deepseekOnSuccess(): void {
    if (this._hasSeenAnyHeaders) return;
    const now = Date.now();
    this._applyTimeoutRateTimeDecay(now);
    this._maybeTimedRecovery(now);

    // ── Congestion guard (timeout-rate driven) ────────────────────────────────
    // Brake on timeouts, not on absolute latency: a slow-but-completing endpoint
    // (big HTML batches at 60–120s under load) is fine and should keep its
    // concurrency. High latency only stops the ramp — shedding on latency alone
    // caused a death spiral (concurrency 77→4 while timeoutRate stayed 0%).
    if (this._timeoutRate.value > LLM_TIMEOUT_RATE_HIGH) {
      this._softBackoff("timeout rate");
      return;
    }
    // Ramp up only while timeouts are rare (well under the brake threshold), so
    // we grow when requests are completing cleanly and hold steady near the knee.
    if (this._timeoutRate.value > LLM_TIMEOUT_RATE_HIGH / 2) return;
    if (this.latency.value > RAMP_LATENCY_INHIBIT_MS) return;

    // ── Adaptive ramp: add amount decays as latency climbs; step count scales
    //     with current concurrency so the ramp naturally plateaus at the knee.
    //     Produces a sigmoid-shaped QPS curve instead of spike-then-crash.
    const lat = this.latency.value;
    let rampAdd: number;
    if (lat < 3000)       rampAdd = 8;   // fast climb — plenty of headroom
    else if (lat < 6000)  rampAdd = 4;   // normal
    else if (lat < 10000) rampAdd = 2;   // slow — approaching the knee
    else if (lat < 15000) rampAdd = 1;   // crawl — near capacity
    else                  rampAdd = 0;   // hold — already at inhibit threshold

    if (rampAdd === 0) return;

    // Ramp step grows with concurrency: at higher concurrency, require more
    // successful calls between increments to avoid overshooting the knee.
    //   conc=32 → step≈8  (fast initial ramp)
    //   conc=64 → step≈16 (moderate)
    //   conc=96 → step≈24 (slow, deliberate)
    const rampStep = Math.max(4, Math.ceil(this.sem.max / 4));

    this._deepseekRampSuccesses++;
    if (
      this._deepseekRampSuccesses % rampStep === 0 &&
      this.sem.max < this._deepseekConcCeiling
    ) {
      const newMax = Math.min(this._deepseekConcCeiling, this.sem.max + rampAdd);
      if (newMax !== this.sem.max) {
        this.sem.setMax(newMax);
        console.log(
          `[llm-pool] deepseek ramp → concurrency=${newMax}/${this._deepseekConcCeiling}` +
          ` (${this._deepseekRampSuccesses} successes, latency=${lat.toFixed(0)}ms, add=${rampAdd}, step=${rampStep})`,
        );
      }
    }
  }

  /** Feed a failed attempt into the congestion guard. Timeouts drive the brake. */
  private _onAttemptError(kind: LlmErrorKind): void {
    if (this._limitMode !== "deepseek-concurrency" || this._hasSeenAnyHeaders) return;
    const now = Date.now();
    // A timed-out request never reaches onResponse, so its (huge) latency is NOT
    // in the latency EWMA — the timeout rate is the only signal that catches it.
    this._applyTimeoutRateTimeDecay(now);
    if (kind === "timeout") {
      this._timeoutRate.update(1);
      this._lastTimeoutAt = now;
      this._timeoutRateDecayedAt = now;
    }
    if (kind === "timeout" && this._timeoutRate.value > LLM_TIMEOUT_RATE_HIGH) {
      this._softBackoff("timeout rate");
    }
  }

  /**
   * Decay timeout-rate EWMA toward 0 on wall clock — avoids staying "guilty" at
   * floor 4 when successes are sparse (40s+ latency) and success-count decay stalls.
   */
  private _applyTimeoutRateTimeDecay(now = Date.now()): void {
    const elapsed = now - this._timeoutRateDecayedAt;
    if (elapsed <= 0) return;
    const factor = Math.pow(0.5, elapsed / TIMEOUT_RATE_HALF_LIFE_MS);
    if (factor >= 0.999) return;
    this._timeoutRate.setValue(this._timeoutRate.value * factor);
    this._timeoutRateDecayedAt = now;
  }

  /**
   * Timed recovery: if no recent timeouts, add concurrency on an interval.
   * Recovery speed adapts to conditions — fast when healthy, cautious when near
   * the ceiling or when latency is elevated. This ensures the pool climbs back
   * from a backoff-induced floor without waiting for the success-count ramp
   * (which stalls when concurrency is very low and successes are sparse).
   */
  private _maybeTimedRecovery(now = Date.now()): void {
    if (this.sem.max >= this._deepseekConcCeiling) return;
    if (now - this._lastTimedRecoveryAt < RECOVERY_RAMP_INTERVAL_MS) return;
    if (this._lastTimeoutAt > 0 && now - this._lastTimeoutAt < RECOVERY_NO_TIMEOUT_MS) return;
    if (this._timeoutRate.value > LLM_TIMEOUT_RATE_HIGH / 2) return;

    this._lastTimedRecoveryAt = now;

    const lat = this.latency.value;
    const gap = this._deepseekConcCeiling - this.sem.max;
    const isQuiet = this._timeoutRate.value === 0;

    // Adaptive recovery step — timeout rate is the only true safety signal.
    // High latency without timeouts means "slow but healthy": safe to push more.
    let add: number;
    if (isQuiet && lat < 3000 && gap > 40) {
      add = Math.max(RECOVERY_RAMP_ADD * 2, Math.ceil(gap / 2));   // fast catch-up
    } else if (isQuiet && lat < 8000) {
      add = RECOVERY_RAMP_ADD * 3;                                  // aggressive: +12
    } else if (isQuiet) {
      add = RECOVERY_RAMP_ADD * 2;                                  // quiet but slow: +8
    } else if (lat < 10000) {
      add = RECOVERY_RAMP_ADD;                                      // normal: +4
    } else {
      add = Math.max(1, Math.floor(RECOVERY_RAMP_ADD / 2));        // cautious: +2
    }

    const newMax = Math.min(this._deepseekConcCeiling, this.sem.max + add);
    if (newMax === this.sem.max) return;
    this.sem.setMax(newMax);

    const quietSec =
      this._lastTimeoutAt > 0 ? Math.round((now - this._lastTimeoutAt) / 1000) : null;
    console.log(
      `[llm-pool] timed recovery → concurrency=${newMax}/${this._deepseekConcCeiling}` +
      ` (+${add}, timeoutRate=${(this._timeoutRate.value * 100).toFixed(0)}%` +
      `, latency=${lat.toFixed(0)}ms` +
      `${quietSec != null ? `, quiet=${quietSec}s` : ""})`,
    );
  }

  /** Multiplicative concurrency cut from a soft (latency/timeout) congestion signal. */
  private _softBackoff(reason: string): void {
    const now = Date.now();
    if (now - this._lastSoftBackoffAt < SOFT_BACKOFF_MIN_INTERVAL_MS) return;
    this._lastSoftBackoffAt = now;
    const floor = Math.max(this.slots.length, SOFT_BACKOFF_FLOOR);
    const newMax = Math.max(floor, Math.floor(this.sem.max * BACKOFF_FACTOR));
    this._deepseekRampSuccesses = 0;
    if (newMax !== this.sem.max) {
      this.sem.setMax(newMax);
      console.warn(
        `[llm-pool] soft back-off → concurrency=${newMax} (${reason}; ` +
        `latency=${this.latency.value.toFixed(0)}ms, timeoutRate=${(this._timeoutRate.value * 100).toFixed(0)}%)`,
      );
    }
  }

  /**
   * Adaptive "wait for first token" budget (ms). When the endpoint is slow or
   * queued, the first token legitimately takes longer; being patient here turns
   * a premature abort + retry (which wastes work AND adds load) into a slow
   * success. Scales with observed latency, clamped to a sane floor/ceiling.
   */
  firstTokenBudgetMs(): number {
    const fromLatency = this.latency.value * LLM_FIRST_TOKEN_LATENCY_FACTOR;
    return Math.min(
      LLM_FIRST_TOKEN_TIMEOUT_MAX_MS,
      Math.max(LLM_FIRST_TOKEN_TIMEOUT_MS, Math.round(fromLatency)),
    );
  }

  /** Record fields that exhausted retries and fell back to the original text. */
  recordTerminalFallback(n = 1): void {
    this._terminalFallbacks += Math.max(0, n);
  }

  /** Aggregate failed-attempt counts by cause + terminal fallbacks across slots. */
  getErrorBreakdown(): { byKind: LlmErrorTally; terminalFallbacks: number } {
    const byKind = _emptyErrorTally();
    for (const slot of this.slots) {
      byKind.timeout += slot.stats.errorsByKind.timeout;
      byKind.parse   += slot.stats.errorsByKind.parse;
      byKind.http    += slot.stats.errorsByKind.http;
      byKind.api     += slot.stats.errorsByKind.api;
      byKind.other   += slot.stats.errorsByKind.other;
    }
    return { byKind, terminalFallbacks: this._terminalFallbacks };
  }

  private _deepseekOnThrottle(): void {
    const floor = Math.max(this.slots.length, SOFT_BACKOFF_FLOOR);
    const newMax = Math.max(floor, Math.floor(this.sem.max * BACKOFF_FACTOR));
    this._deepseekRampSuccesses = 0;
    if (newMax !== this.sem.max) {
      this.sem.setMax(newMax);
      console.log(`[llm-pool] deepseek back-off → concurrency=${newMax} (429, account quota)`);
    }
  }

  private _blindOnThrottle(): void {
    if (this._limitMode === "deepseek-concurrency") {
      this._deepseekOnThrottle();
      return;
    }
    if (this._hasSeenAnyHeaders) return;
    const floor  = this.slots.length;          // never go below 1 per slot
    const newMax = Math.max(floor, Math.floor(this.sem.max * 0.5));
    this._blindSuccesses = 0;
    if (newMax !== this.sem.max) {
      this.sem.setMax(newMax);
      console.log(`[llm-pool] blind back-off → concurrency=${newMax} (429, ramp reset)`);
    }
  }

  private _quotaSummary(): string {
    const now = Date.now();
    return this.slots
      .filter((s) => s.throttledUntil <= now && s.rateLimit)
      .map((s) => `${s.label}[${formatSlotQuota(s.rateLimit!)}]`)
      .join("; ") || "no quota headers yet";
  }

  // ── Adaptive concurrency (Little's Law) ───────────────────────────────────

  /**
   * Recalculate the safe concurrency ceiling based on current rate-limit state.
   *
   * For each active slot:
   *   safeRPS   = remainingRequests / windowRemainSeconds   (sustainable req/s)
   *   safeConc  = safeRPS × avgLatencySeconds               (Little's Law)
   *
   * Both the requests dimension and the token dimension are evaluated; the
   * stricter constraint wins.  Results are summed across slots and clamped to
   * [1, MAX_POOL_CONCURRENCY].
   */
  private _recalc(): void {
    // DeepSeek 200 responses omit quota headers — concurrency is managed separately.
    if (this._limitMode === "deepseek-concurrency" && !this._hasSeenAnyHeaders) {
      return;
    }

    const now = Date.now();
    const latS = this.latency.value / 1_000;    // avg call duration in seconds
    const avgTok = this.tokPerReq.value;         // avg tokens per call

    let totalConc = 0;
    for (const slot of this.slots) {
      if (slot.throttledUntil > now) continue; // 429'd — skip

      const rl = slot.rateLimit;
      if (!rl) {
        totalConc += 1; // no data yet — contribute 1 to avoid starvation
        continue;
      }

      // ── Requests dimension ──────────────────────────────────────────────
      const reqRemainS = Math.max((rl.resetReqMs - now) / 1_000, 0.5);
      // If the window already reset, treat as full bucket
      const effRemReq  = rl.resetReqMs <= now ? rl.limitReq : rl.remainingReq;
      const safeRPS_req = effRemReq / reqRemainS;
      const concByReq   = safeRPS_req * latS;

      // ── Tokens dimension ────────────────────────────────────────────────
      const tokRemainS  = Math.max((rl.resetTokMs - now) / 1_000, 0.5);
      const effRemTok   = rl.resetTokMs <= now ? rl.limitTok : rl.remainingTok;
      // Safe req/s derived from token budget
      const safeRPS_tok = effRemTok / tokRemainS / Math.max(avgTok, 100);
      const concByTok   = safeRPS_tok * latS;

      // Most conservative dimension wins; 0.5 floor so throttled-but-not-zero
      // slots still contribute fractionally when they recover
      const slotConc = rl.limitTok === Infinity ? concByReq : Math.min(concByReq, concByTok);
      totalConc += Math.max(0.5, slotConc);
    }

    const newMax = Math.max(1, Math.min(MAX_POOL_CONCURRENCY, Math.round(totalConc)));
    if (newMax !== this.sem.max) {
      const active = this.slots.filter((s) => s.throttledUntil <= now).length;
      console.log(
        `[llm-pool] concurrency ${this.sem.max} → ${newMax}` +
        ` (latency=${this.latency.value.toFixed(0)}ms, tok/req=${this.tokPerReq.value.toFixed(0)},` +
        ` active=${active}/${this.slots.length}, ${this._quotaSummary()})`,
      );
      this.sem.setMax(newMax);
      return;
    }

    // Concurrency unchanged — still log quota drift on a throttled interval.
    for (const slot of this.slots) {
      if (slot.throttledUntil > now || !slot.rateLimit) continue;
      this._maybeLogQuota(slot, "recalc");
    }
  }

  // ── Key stats snapshot ─────────────────────────────────────────────────────

  getKeyStats(): Array<{
    label: string;
    calls: number;
    tokens: number;
    avgLatencyMs: number;
    throttleCount: number;
    errors: number;
    errorsByKind: LlmErrorTally;
    poolConcurrency: number;
    rateLimit: SlotRateLimit | null;
  }> {
    return this.slots.map((slot) => ({
      label: slot.label,
      calls: slot.stats.calls,
      tokens: slot.stats.tokens,
      avgLatencyMs: slot.stats.calls > 0
        ? Math.round(slot.stats.totalLatencyMs / slot.stats.calls)
        : 0,
      throttleCount: slot.stats.throttleCount,
      errors: slot.stats.errors,
      errorsByKind: { ...slot.stats.errorsByKind },
      poolConcurrency: this.sem.max,
      rateLimit: slot.rateLimit,
    }));
  }
}

// ─── Pool construction ────────────────────────────────────────────────────────

function buildKeySlots(): KeySlot[] {
  const multi = process.env.DEEPSEEK_API_KEYS?.trim();
  const single = process.env.DEEPSEEK_API_KEY?.trim();
  const keys = multi
    ? multi.split(",").map((k) => k.trim()).filter(Boolean)
    : single ? [single] : [];
  if (keys.length === 0) throw new Error("DEEPSEEK_API_KEY / DEEPSEEK_API_KEYS required");
  const baseURL = process.env.DEEPSEEK_BASE_URL?.trim() || "https://api.deepseek.com";
  const chatUrl = resolveDeepSeekChatCompletionsUrl(baseURL);
  const model = process.env.DEEPSEEK_MODEL?.trim() || "deepseek-chat";
  return keys.map((apiKey, i) => ({
    transport: { kind: "deepseek-fetch" as const, apiKey, chatUrl },
    model,
    label: `deepseek-${i + 1}(…${apiKey.slice(-4)})`,
    throttledUntil: 0,
    rateLimit: null,
    stats: _initStats(),
  }));
}

/** Zero-fill a fresh slot stats counter. */
function _initStats(): KeySlotStats {
  return {
    calls: 0,
    tokens: 0,
    totalLatencyMs: 0,
    throttleCount: 0,
    errors: 0,
    errorsByKind: _emptyErrorTally(),
  };
}

let _pool: LLMKeyPool | null = null;

function getPool(): LLMKeyPool {
  if (_pool) return _pool;
  const model = resolveModel();
  _pool = new LLMKeyPool(buildKeySlots(), { model });
  return _pool;
}

/** 仅测试用：切换 provider/env 后重建 key pool */
export function resetLlmPoolForTests(): void {
  _pool = null;
}

// ── Key-stats flush to Redis ─────────────────────────────────────────────────
//
// Called from translateWorker's progress callback (already runs on every batch
// completion). The module-level timestamp throttles actual Redis writes to
// once per STAT_FLUSH_INTERVAL_MS regardless of how often callers invoke it.
// Errors are silently swallowed — stats are strictly best-effort telemetry.

let _lastStatFlush = 0;
const STAT_FLUSH_INTERVAL_MS = 10_000;

/**
 * Tracks the cumulative call/token counts as of the previous flush for each
 * slot, so we can compute per-interval deltas for the history log.
 */
const _slotFlushState = new Map<string, { flushedCalls: number; flushedTokens: number }>();

/**
 * Write the current key-pool stats snapshot to Redis.
 * Throttled internally to at most one write per 10 seconds.
 * Safe to call in a hot path (progress callback, etc.).
 */
/** Synchronous snapshot of LLM key pool stats. Returns [] if pool not yet initialised. */
export function getLlmPoolStats(): ReturnType<LLMKeyPool["getKeyStats"]> {
  return _pool?.getKeyStats() ?? [];
}

/** Aggregate failed-attempt counts by cause + terminal fallbacks. For QPS telemetry. */
export function getLlmErrorBreakdown(): { byKind: LlmErrorTally; terminalFallbacks: number } {
  return _pool?.getErrorBreakdown() ?? { byKind: _emptyErrorTally(), terminalFallbacks: 0 };
}

/** Record that `n` fields exhausted retries and fell back to the original text. */
export function recordLlmTerminalFallback(n = 1): void {
  _pool?.recordTerminalFallback(n);
}

export async function flushKeyStats(): Promise<void> {
  const now = Date.now();
  if (now - _lastStatFlush < STAT_FLUSH_INTERVAL_MS) return;
  _lastStatFlush = now;
  if (!_pool) return;

  const stats = _pool.getKeyStats();
  if (stats.length === 0) return;

  try {
    const { getRedis } = await import("./redisV4.js");
    const redis = getRedis();
    const SNAP_TTL = 24 * 3600; // 24 h for current snapshot
    const LOG_TTL  =  2 * 3600; //  2 h for history log
    const LOG_MAX  = 180;        // 180 × 10 s = 30 min of history
    const pipe = redis.pipeline();

    for (const s of stats) {
      // ── Current snapshot (overwrites previous) ─────────────────────────────
      const snapKey = `translate:v4:keystat:${s.label}`;
      const remTok  = s.rateLimit?.remainingTok === Infinity ? -1 : (s.rateLimit?.remainingTok ?? -1);
      const limTok  = s.rateLimit?.limitTok      === Infinity ? -1 : (s.rateLimit?.limitTok      ?? -1);
      pipe.hset(snapKey, {
        label:           s.label,
        calls:           s.calls,
        tokens:          s.tokens,
        avgLatencyMs:    s.avgLatencyMs,
        throttleCount:   s.throttleCount,
        errors:          s.errors,
        poolConcurrency: s.poolConcurrency,
        limitReq:        s.rateLimit?.limitReq     ?? -1,
        remainingReq:    s.rateLimit?.remainingReq ?? -1,
        limitTok:        limTok,
        remainingTok:    remTok,
        updatedAt:       now,
      });
      pipe.expire(snapKey, SNAP_TTL);

      // ── History log entry (incremental delta + snapshot fields) ────────────
      // Delta calls/tokens since last flush lets the UI chart throughput over time.
      const prev = _slotFlushState.get(s.label) ?? { flushedCalls: 0, flushedTokens: 0 };
      const dCalls  = Math.max(0, s.calls  - prev.flushedCalls);
      const dTokens = Math.max(0, s.tokens - prev.flushedTokens);
      _slotFlushState.set(s.label, { flushedCalls: s.calls, flushedTokens: s.tokens });

      // Compact field names keep each entry small (< 100 bytes).
      const entry = JSON.stringify({
        t:    now,
        dC:   dCalls,
        dT:   dTokens,
        lat:  s.avgLatencyMs,
        conc: s.poolConcurrency,
        rR:   s.rateLimit?.remainingReq ?? -1,
        lR:   s.rateLimit?.limitReq     ?? -1,
        rT:   remTok,
        lT:   limTok,
      });
      const logKey = `translate:v4:keystatlog:${s.label}`;
      pipe.rpush(logKey, entry);
      pipe.ltrim(logKey, -LOG_MAX, -1); // keep last 30 min
      pipe.expire(logKey, LOG_TTL);
    }
    await pipe.exec();
  } catch {
    // Redis unavailable or not configured — stats are best-effort, ignore
  }
}

// ─── Model resolution ───────────────────────────────────────────────────────────

/** DeepSeek 模型 id 白名单（含将弃用的旧名）。 */
const KNOWN_DEEPSEEK_MODELS = new Set([
  "deepseek-v4-flash",
  "deepseek-v4-pro",
  "deepseek-chat",
  "deepseek-reasoner",
]);

/** 是否为可直接发送的 DeepSeek 模型 id。 */
function isDeepSeekModelId(s?: string): boolean {
  return KNOWN_DEEPSEEK_MODELS.has((s ?? "").trim().toLowerCase());
}

/**
 * 解析实际发送给 DeepSeek 的模型 id：优先用任务自带的 `aiModel`（前提是已知 DeepSeek 模型），
 * 否则回退 `DEEPSEEK_MODEL` env（默认 deepseek-chat）。非 DeepSeek 值（如 "google-translate"）被忽略。
 */
function resolveModel(preferred?: string): string {
  const p = (preferred ?? "").trim();
  if (isDeepSeekModelId(p)) return p;
  return process.env.DEEPSEEK_MODEL?.trim() || "deepseek-chat";
}

// ─── Per-shop quota concurrency gate ─────────────────────────────────────────
// 按 shopName 限流：相同 shop 的 LLM 调用共用一个闸（与全局限流池叠加 min），
// 不同 shop 互不影响。默认容量极大(不限)，仅当额度逻辑显式 setShopQuotaCap 时收紧。
// 额度越少 → cap 越小 → 在飞批次越少 → 最大透支被锁死。
const _shopQuotaGates = new Map<string, AdaptiveSemaphore>();

function getShopQuotaGate(shop: string): AdaptiveSemaphore {
  let g = _shopQuotaGates.get(shop);
  if (!g) {
    g = new AdaptiveSemaphore(MAX_POOL_CONCURRENCY);
    _shopQuotaGates.set(shop, g);
  }
  return g;
}

/** 由额度逻辑调用：设置某 shop 的 LLM 并发上限（最小 1；硬停由调用方 abort 负责）。 */
export function setShopQuotaCap(shop: string, cap: number): void {
  getShopQuotaGate(shop).setMax(cap);
}

// ─── Engine router ──────────────────────────────────────────────────────────────
//
// Two engine *families*: "llm" (DeepSeek) and "google" (Google Translate).
// Cost-tiered routing applies unless the job requests google-translate only.

type Engine = "llm" | "google";

function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_TRANSLATE_API_KEY?.trim());
}

function llmConfigured(): boolean {
  return Boolean(
    process.env.DEEPSEEK_API_KEY?.trim() ||
      process.env.DEEPSEEK_API_KEYS?.trim(),
  );
}

/** A single forced engine family, or null when auto-routing should apply. */
function forcedEngine(aiModel?: string): Engine | null {
  if (aiModel?.trim().toLowerCase() === "google-translate") return "google";
  return null;
}

// Plain fields at or above this length are treated as "rich" content.
const SHORT_PLAIN_THRESHOLD = 80;

function fieldTier(
  key: string,
  value: string,
  klass: "skip" | "html" | "json" | "plain",
): "trivial" | "rich" {
  if (klass === "html" || klass === "json") return "rich";
  if (key === "meta_description") return "rich";
  return value.length >= SHORT_PLAIN_THRESHOLD ? "rich" : "trivial";
}

/** Ordered engine candidates for a tier (primary first, then fallback). */
function engineOrderFor(tier: "trivial" | "rich", aiModel?: string): Engine[] {
  const forced = forcedEngine(aiModel);
  if (forced) return [forced];

  const g = googleConfigured();
  const l = llmConfigured();
  const order: Engine[] = [];
  if (tier === "trivial") {
    if (g) order.push("google");
    if (l) order.push("llm");
  } else {
    if (l) order.push("llm");
    if (g) order.push("google");
  }
  // Always have at least one candidate.
  if (order.length === 0) order.push(l ? "llm" : "google");
  return order;
}

/** The model/label recorded for a chosen engine (used for TM cache + Cosmos). */
function engineModel(engine: Engine, aiModel: string): string {
  return engine === "google" ? "google-translate" : resolveModel(aiModel);
}

/**
 * The engine actually used for a job — real data for Cosmos. With routing on, it
 * reports "auto" plus the configured engines; when forced, the single engine.
 */
export function resolveEngine(aiModel: string): { provider: string; model: string } {
  const forced = forcedEngine(aiModel);
  if (forced === "google") return { provider: "google", model: "google-translate" };
  const model = resolveModel(aiModel);
  const parts: string[] = [];
  if (googleConfigured()) parts.push("google");
  if (llmConfigured()) parts.push(model);
  return { provider: "auto", model: parts.length ? `auto(${parts.join("+")})` : "none" };
}

export type TranslateItem = {
  key: string;
  value: string;
  digest: string;
};

export type TranslateResult = {
  key: string;
  translatedValue: string;
  digest: string;
  /** "translated" = produced by the engine; "fallback" = engine failed, original text returned. */
  status: "translated" | "fallback";
};

// ─── Field classification ──────────────────────────────────────────────────────

// These fields must not be translated (Shopify uses them as URL segments)
const SKIP_KEYS = new Set(["handle"]);

/**
 * Returns true if `text` appears to already be written in the target language,
 * meaning it does not need translation.
 *
 * Strategy:
 *  - For English target: if source is a non-Latin script language AND the text
 *    contains no source-script characters, it is almost certainly already in
 *    English → skip.  (A zh-CN store's product titled "Standard" is English.)
 *  - For other targets with a distinctive script (zh, ja, ko, ar, ru, pl, de …):
 *    skip only when the text already contains target-script characters.
 *  - Conservative fall-through: return false (always translate) for unknown
 *    combinations to avoid accidentally suppressing content.
 *
 * This correctly handles the common case of a zh-CN store that has mostly
 * English product data and is being translated to:
 *   • en  → English content is the target, skip it (saves ~94% of LLM calls)
 *   • pl  → English content still needs translation to Polish, don't skip
 */
export function alreadyInTarget(text: string, source: string, target: string): boolean {
  const tl = target.toLowerCase().split(/[-_]/)[0];
  const sl = source.toLowerCase().split(/[-_]/)[0];

  // ── English target ──────────────────────────────────────────────────────────
  // If source is a CJK / non-Latin language and text has no source-script chars,
  // the content is already in a Latin-script language (overwhelmingly English).
  if (tl === "en") {
    return !containsSourceScript(text, source);
  }

  // ── Non-Latin script targets ────────────────────────────────────────────────
  // We can only be sure content is "already translated" if it contains the
  // target script's characteristic characters.
  switch (tl) {
    case "zh": return /[一-鿿㐀-䶿]/u.test(text);
    case "ja": return /[ぁ-ゖァ-ヶ一-鿿]/u.test(text);
    case "ko": return /[가-힣ᄀ-ᇿ]/u.test(text);
    case "ar": return /[؀-ۿ]/u.test(text);
    case "ru": case "uk": case "bg": return /[Ѐ-ӿ]/u.test(text);
    case "th": return /[฀-๿]/u.test(text);
    case "hi": case "mr": case "ne": return /[ऀ-ॿ]/u.test(text);
    // Latin-script targets with strongly distinctive diacritics
    case "pl": return /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/u.test(text);
    case "de": return /[äöüÄÖÜß]/u.test(text);
    case "fr": return /[àâçèéêëîïôùûüœÀÂÇÈÉÊËÎÏÔÙÛÜŒ]/u.test(text);
    case "es": case "pt": return /[áéíóúüñÁÉÍÓÚÜÑãõÃÕ]/u.test(text);
    case "cs": case "sk": return /[áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]/u.test(text);
    case "hu": return /[áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/u.test(text);
    case "tr": return /[çğışöüÇĞİŞÖÜ]/u.test(text);
    case "vi": return /[àáâãèéêìíòóôõùúýăđơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/u.test(text);
    default: return false; // unknown target → conservative, always translate
  }
}

/**
 * Returns true if `text` contains at least one character from the source
 * language's script. Used internally by alreadyInTarget.
 */
export function containsSourceScript(text: string, source: string): boolean {
  const lang = source.toLowerCase().split(/[-_]/)[0];
  switch (lang) {
    case "zh":
      return /[一-鿿㐀-䶿]/u.test(text);
    case "ja":
      return /[ぁ-ゖァ-ヶ一-鿿]/u.test(text);
    case "ko":
      return /[가-힣ᄀ-ᇿ]/u.test(text);
    case "ar":
      return /[؀-ۿ]/u.test(text);
    case "ru": case "uk": case "bg":
      return /[Ѐ-ӿ]/u.test(text);
    case "th":
      return /[฀-๿]/u.test(text);
    case "hi": case "mr": case "ne":
      return /[ऀ-ॿ]/u.test(text);
    default:
      return true; // unknown source locale → conservative, always translate
  }
}

const HTML_TAG_RE = /<\/?[a-z][^>]*>/i;

function isHtml(value: string): boolean {
  return HTML_TAG_RE.test(value);
}

export function classifyField(key: string, value?: string): "skip" | "html" | "json" | "plain" {
  if (SKIP_KEYS.has(key)) return "skip";
  // JSON must be detected before HTML: a JSON blob can contain an HTML string in
  // one of its leaves, which would otherwise trip the isHtml() check.
  if (value !== undefined && tryParseJsonContainer(value) !== undefined) return "json";
  if (value !== undefined && isHtml(value)) return "html";
  return "plain";
}

/**
 * Number of translation units (nodes) a field expands into: HTML → text-node
 * count, plain → split-part count, skip → 0. Used for node-level progress so the
 * total computed at init matches what translate processes.
 */
export function countFieldUnits(key: string, value: string): number {
  const klass = classifyField(key, value);
  if (klass === "skip") return 0;
  if (klass === "html")
    return htmlNodePartsOf(value).nodeParts.reduce((n, parts) => n + parts.length, 0);
  if (klass === "json") {
    const root = tryParseJsonContainer(value);
    if (root === undefined) return splitPlainText(value).length;
    const leaves: string[] = [];
    collectJsonLeaves(root, leaves);
    return leaves.length;
  }
  return splitPlainText(value).length;
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Max total chars sent to the translation API in one request.
// Override via TRANSLATE_MAX_CHARS_PER_BATCH env var (default 3000).
//
// Smaller batches trade a few extra requests (cheap — DeepSeek/OpenAI prompt
// caching makes the repeated system prompt nearly free) for much lower per-request
// latency and far better fan-out: a big field's many units split into several
// short parallel requests instead of one ~40s monolith. Combined with the high
// chunk concurrency in translateWorker, this collapses the "few large slow
// requests" tail that otherwise dominates the back half of a job.
const MAX_CHARS_PER_BATCH = Math.max(
  500,
  Number(process.env.TRANSLATE_MAX_CHARS_PER_BATCH) || 3_000,
);
/** Max items per LLM request — avoids 80+ key payloads that routinely hit the timeout. */
const MAX_ITEMS_PER_BATCH = Math.max(
  1,
  Number(process.env.TRANSLATE_MAX_ITEMS_PER_BATCH) || 25,
);
/** Rich (HTML/JSON/LLM-first) pools use smaller batches — fewer keys per request, less idle-timeout tail. */
const RICH_MAX_CHARS_PER_BATCH = Math.max(
  500,
  Number(process.env.TRANSLATE_RICH_MAX_CHARS_PER_BATCH) || 1_500,
);
const RICH_MAX_ITEMS_PER_BATCH = Math.max(
  1,
  Number(process.env.TRANSLATE_RICH_MAX_ITEMS_PER_BATCH) || 8,
);

/** LLM-first engine order ⇒ rich tier (HTML/JSON/long plain). Google-first ⇒ trivial. */
export function resolveBatchLimits(order: Engine[]): {
  maxChars: number;
  maxItems: number;
} {
  if (order[0] === "llm") {
    return { maxChars: RICH_MAX_CHARS_PER_BATCH, maxItems: RICH_MAX_ITEMS_PER_BATCH };
  }
  return { maxChars: MAX_CHARS_PER_BATCH, maxItems: MAX_ITEMS_PER_BATCH };
}
// ── LLM timeouts (defaults tuned lenient for diagnosis — override via env in prod) ──
// Total wall-clock hard cap: base + per-item scaling, capped at MAX.
const LLM_TIMEOUT_BASE_MS = Math.max(
  60_000,
  Number(process.env.TRANSLATE_LLM_TIMEOUT_MS) || 300_000,
);
const LLM_TIMEOUT_PER_ITEM_MS = Math.max(
  500,
  Number(process.env.TRANSLATE_LLM_TIMEOUT_PER_ITEM_MS) || 5_000,
);
const LLM_TIMEOUT_MAX_MS = Math.max(
  LLM_TIMEOUT_BASE_MS,
  Number(process.env.TRANSLATE_LLM_TIMEOUT_MAX_MS) || 600_000,
);
/** Streaming idle: no token for this long after generation started → abort. */
const LLM_IDLE_TIMEOUT_MS = Math.max(
  10_000,
  Number(process.env.TRANSLATE_LLM_IDLE_TIMEOUT_MS) || 300_000,
);
/**
 * 「等首个 token」窗口下限；实际上限由 `firstTokenBudgetMs()` 自适应，不超过
 * `LLM_FIRST_TOKEN_TIMEOUT_MAX_MS`。默认与 idle 对齐，避免排队中被过早砍掉。
 */
const LLM_FIRST_TOKEN_TIMEOUT_MS = Math.max(
  LLM_IDLE_TIMEOUT_MS,
  Number(process.env.TRANSLATE_LLM_FIRST_TOKEN_TIMEOUT_MS) || 180_000,
);
/** Multiplier on observed avg latency for the adaptive first-token budget. */
const LLM_FIRST_TOKEN_LATENCY_FACTOR = Math.max(
  1,
  Number(process.env.TRANSLATE_LLM_FIRST_TOKEN_LATENCY_FACTOR) || 6,
);
/** Hard ceiling on the adaptive first-token wait (ms). */
const LLM_FIRST_TOKEN_TIMEOUT_MAX_MS = Math.max(
  LLM_FIRST_TOKEN_TIMEOUT_MS,
  Number(process.env.TRANSLATE_LLM_FIRST_TOKEN_TIMEOUT_MAX_MS) || 300_000,
);
/** On timeout, re-chunk a large batch straight to this size (skip the slow cascade). */
const TIMEOUT_RESPLIT_SIZE = Math.max(
  1,
  Number(process.env.TRANSLATE_TIMEOUT_RESPLIT_SIZE) || 3,
);
/** First-token timeouts: same-batch retries before re-chunking (queue drain). */
const FIRST_TOKEN_DRAIN_RETRIES = Math.max(
  0,
  Number(process.env.TRANSLATE_FIRST_TOKEN_DRAIN_RETRIES) || 3,
);
/** Drain delay before a first-token same-batch retry (lets the server queue clear). */
const FIRST_TOKEN_DRAIN_MS = Math.max(
  0,
  Number(process.env.TRANSLATE_FIRST_TOKEN_DRAIN_MS) || 5_000,
);
/** Base backoff between single-item leaf retries (grows linearly per attempt). */
const LEAF_RETRY_BACKOFF_MS = Math.max(
  0,
  Number(process.env.TRANSLATE_LEAF_RETRY_BACKOFF_MS) || 2_000,
);

/** Scale timeout with batch size so large (but capped) batches get more wall clock. */
export function llmTimeoutMsForBatch(itemCount: number): number {
  const n = Math.max(1, itemCount);
  return Math.min(
    LLM_TIMEOUT_MAX_MS,
    LLM_TIMEOUT_BASE_MS + Math.max(0, n - 1) * LLM_TIMEOUT_PER_ITEM_MS,
  );
}
// Batch fan-out: all batches within a resource pool are launched simultaneously.
// The pool's AdaptiveSemaphore is the only concurrency gate — no separate knob needed.

// Plain text / HTML text nodes longer than this get split before translation.
const LONG_TEXT_THRESHOLD = Math.max(
  500,
  Number(process.env.TRANSLATE_LONG_TEXT_THRESHOLD) || 3_000,
);
const LONG_TEXT_CHUNK_CHARS = Math.max(
  400,
  Number(process.env.TRANSLATE_LONG_TEXT_CHUNK_CHARS) || 2_500,
);

// ─── Concurrency helper ───────────────────────────────────────────────────────

/**
 * Run `fn` over `items` with at most `concurrency` tasks in-flight at a time.
 * Preserves ordering in the returned array. Exported so translateWorker can
 * reuse it for chunk-level parallelism.
 */
export async function pAll<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  if (concurrency <= 1) return Promise.all(items.map((item, i) => fn(item, i)));
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

// ─── HTML text-node extraction ────────────────────────────────────────────────

// Tags whose content we never translate
const SKIP_BLOCK_RE = /<(script|style|pre|code)(\s[^>]*)?>[\s\S]*?<\/\1>/gi;

// Attributes that carry user-visible text and should be translated.
// Handles both double-quoted (common) and single-quoted attribute values.
const TRANSLATABLE_ATTR_RE = /\b(alt|title|aria-label|placeholder)=("([^"]*)"|(\'([^\']*)\'))/g;

// Attr values we must NOT translate
const ATTR_URL_RE = /^https?:\/\//;
// Hash-based filenames like "7910ff297e4-Max-Origin" or bare image filenames
const ATTR_HASH_FILENAME_RE =
  /^[a-fA-F0-9]{8,}(-[a-zA-Z0-9]+)*$|^\S+\.(jpg|jpeg|png|gif|bmp|webp|svg|mp4|pdf)$/i;

function isTranslatableAttrValue(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (ATTR_URL_RE.test(v)) return false;
  if (ATTR_HASH_FILENAME_RE.test(v)) return false;
  return true;
}

/**
 * Replaces every visible text node AND translatable attribute values (alt, title,
 * aria-label, placeholder) in an HTML string with numeric placeholders.
 * Returns the rewritten template and the ordered array of extracted texts.
 * Whitespace-only gaps between tags are left in place.
 */
function extractHtmlTextNodes(html: string): { template: string; texts: string[] } {
  const texts: string[] = [];
  const skipped = new Map<string, string>();
  let sIdx = 0;

  // Protect non-translatable blocks (script/style/pre/code)
  const withSkips = html.replace(SKIP_BLOCK_RE, (match) => {
    const key = `\x00S${sIdx++}\x00`;
    skipped.set(key, match);
    return key;
  });

  // Extract translatable attribute values before touching text nodes so the
  // two passes don't interfere (attributes live inside tags, text nodes outside).
  const withAttrs = withSkips.replace(
    TRANSLATABLE_ATTR_RE,
    (_match, attrName: string, _quotedFull: string, dqVal: string, _sqFull: string, sqVal: string) => {
      const attrValue = dqVal ?? sqVal ?? "";
      const quote = dqVal !== undefined ? '"' : "'";
      if (!isTranslatableAttrValue(attrValue)) return _match;
      const idx = texts.length;
      texts.push(attrValue.trim());
      return `${attrName}=${quote}\x00T${idx}\x00${quote}`;
    },
  );

  // Replace each text node between tags with an indexed marker
  const template = withAttrs.replace(/>([^<]+)</g, (_match, raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return `>${raw}<`;
    const idx = texts.length;
    texts.push(trimmed);
    // Preserve leading/trailing whitespace around the marker
    const start = raw.indexOf(trimmed);
    const end = start + trimmed.length;
    return `>${raw.slice(0, start)}\x00T${idx}\x00${raw.slice(end)}<`;
  });

  // Restore skipped blocks
  let out = template;
  for (const [k, v] of skipped) out = out.replaceAll(k, v);
  return { template: out, texts };
}

function restoreHtmlTextNodes(template: string, translations: string[]): string {
  return template.replace(/\x00T(\d+)\x00/g, (_, idx) => translations[Number(idx)] ?? "");
}

/**
 * HTML text nodes, with any oversized node further split into parts (same as plain
 * text). Without this a single huge paragraph/description node is one un-splittable
 * unit: if its translation times out it can only fall back to the original. Each
 * marker maps to a list of parts; the node's translation is the parts joined back.
 */
function htmlNodePartsOf(value: string): { template: string; nodeParts: string[][] } {
  const { template, texts } = extractHtmlTextNodes(value);
  const nodeParts = texts.map((t) =>
    t.length > LONG_TEXT_THRESHOLD ? splitPlainText(t) : [t],
  );
  return { template, nodeParts };
}

// ─── JSON leaf extraction ──────────────────────────────────────────────────────
//
// Metafield values are frequently JSON config blobs (theme settings, cart copy,
// language-switcher config…). Translating the whole blob as one opaque string is
// bad three ways: (a) a 30KB+ value is a single huge request that strands the
// tail of a job; (b) splitPlainText would cut it at word boundaries and corrupt
// the JSON → fallback; (c) the model rewrites structural tokens it shouldn't
// ("center" → "zentriert"). Instead we parse the JSON, translate only the
// human-readable string leaves as independent units, and re-serialise.

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

const JSON_HEX_RE = /^#[0-9a-fA-F]{3,8}$/;
const JSON_NUMBERISH_RE = /^[+-]?\d+(\.\d+)?$/;
// Lowercase single tokens with no whitespace are overwhelmingly CSS/layout enums
// or config keys ("center", "flex", "bottom_right", "dropdown_vertical") — never
// user-facing copy, which is Capitalised or multi-word. Skipping them keeps the
// JSON's structural values intact and avoids over-translation.
const JSON_TOKEN_RE = /^[a-z][a-z0-9_+./:-]*$/;

/** True if a JSON string leaf looks like human-readable copy worth translating. */
function isTranslatableJsonLeaf(s: string): boolean {
  const v = s.trim();
  if (!v) return false;
  if (ATTR_URL_RE.test(v)) return false;          // urls
  if (JSON_HEX_RE.test(v)) return false;          // hex colours (#fff, #000000)
  if (JSON_NUMBERISH_RE.test(v)) return false;    // numeric strings
  if (JSON_TOKEN_RE.test(v)) return false;        // lowercase enum / key tokens
  if (ATTR_HASH_FILENAME_RE.test(v)) return false; // hash filenames / image names
  return /\p{L}/u.test(v);                         // require at least one letter
}

/** Parse only JSON objects/arrays; returns undefined for anything else. */
function tryParseJsonContainer(value: string): JsonValue | undefined {
  const t = value.trim();
  if (t.length < 2) return undefined;
  const c = t[0];
  if (c !== "{" && c !== "[") return undefined;
  try {
    const parsed = JSON.parse(t) as JsonValue;
    if (parsed !== null && typeof parsed === "object") return parsed;
  } catch {
    /* not JSON — caller falls back to plain handling */
  }
  return undefined;
}

/** Collect translatable string leaves in deterministic DFS order (with repeats). */
function collectJsonLeaves(node: JsonValue, out: string[]): void {
  if (typeof node === "string") {
    if (isTranslatableJsonLeaf(node)) out.push(node);
    return;
  }
  if (Array.isArray(node)) {
    for (const v of node) collectJsonLeaves(v, out);
    return;
  }
  if (node !== null && typeof node === "object") {
    for (const k of Object.keys(node)) collectJsonLeaves(node[k], out);
  }
}

/** Rebuild the JSON tree, swapping each translatable leaf for its translation. */
function rebuildJson(node: JsonValue, translated: Map<string, string>): JsonValue {
  if (typeof node === "string") {
    return isTranslatableJsonLeaf(node) ? translated.get(node) ?? node : node;
  }
  if (Array.isArray(node)) return node.map((v) => rebuildJson(v, translated));
  if (node !== null && typeof node === "object") {
    const out: { [k: string]: JsonValue } = {};
    for (const k of Object.keys(node)) out[k] = rebuildJson(node[k], translated);
    return out;
  }
  return node;
}

// ─── Plain text splitting ─────────────────────────────────────────────────────

/**
 * Splits a long plain-text string into chunks at natural boundaries
 * (paragraphs → sentences → words). Parts can be joined with "" after translation.
 */
function splitPlainText(text: string): string[] {
  if (text.length <= LONG_TEXT_THRESHOLD) return [text];

  const parts: string[] = [];
  let remaining = text;

  while (remaining.length > LONG_TEXT_CHUNK_CHARS) {
    let splitIdx = -1;

    const paraIdx = remaining.lastIndexOf("\n\n", LONG_TEXT_CHUNK_CHARS);
    if (paraIdx >= LONG_TEXT_CHUNK_CHARS * 0.4) splitIdx = paraIdx + 2;

    if (splitIdx < 0) {
      const sentIdx = remaining.lastIndexOf(". ", LONG_TEXT_CHUNK_CHARS);
      if (sentIdx >= LONG_TEXT_CHUNK_CHARS * 0.4) splitIdx = sentIdx + 2;
    }

    if (splitIdx <= 0) {
      const wordIdx = remaining.lastIndexOf(" ", LONG_TEXT_CHUNK_CHARS);
      splitIdx = wordIdx > 0 ? wordIdx : LONG_TEXT_CHUNK_CHARS;
    }

    parts.push(remaining.slice(0, splitIdx));
    remaining = remaining.slice(splitIdx).trimStart();
  }

  if (remaining.length > 0) parts.push(remaining);
  return parts;
}

// ─── Char-based batching ──────────────────────────────────────────────────────

function chunkArray<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function batchByChars(
  items: TranslateItem[],
  maxChars: number,
  maxItems = MAX_ITEMS_PER_BATCH,
): TranslateItem[][] {
  const batches: TranslateItem[][] = [];
  let current: TranslateItem[] = [];
  let currentChars = 0;

  for (const item of items) {
    const len = item.value.length;
    if (
      current.length > 0 &&
      (currentChars + len > maxChars || current.length >= maxItems)
    ) {
      batches.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(item);
    currentChars += len;
  }

  if (current.length > 0) batches.push(current);
  return batches;
}

// ─── Google Translate engine ──────────────────────────────────────────────────

async function callGoogleTranslate(
  texts: string[],
  target: string,
  format: "html" | "text",
): Promise<string[]> {
  const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY?.trim();
  if (!apiKey) throw new Error("GOOGLE_TRANSLATE_API_KEY is required");

  const resp = await fetch(
    `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Omit `source` so Google auto-detects — the catalog is multilingual.
      body: JSON.stringify({ q: texts, target, format }),
    },
  );

  if (!resp.ok) throw new Error(`Google Translate HTTP ${resp.status}: ${await resp.text()}`);

  const data = (await resp.json()) as {
    data: { translations: Array<{ translatedText: string }> };
  };
  return data.data.translations.map((t) => t.translatedText);
}

// ─── Routed translation (engine-agnostic) ──────────────────────────────────────

/**
 * Translate a set of items trying each engine in `order` until resolved.
 * Placeholders are masked once up front and restored/verified at the end, so the
 * protection applies to every engine (LLM and Google alike). Returns a map of
 * key → { value, status }; items unresolved by all engines get status "fallback".
 */
type RoutedResult = { value: string; status: "translated" | "fallback"; engine: Engine | null; tokens: number };

async function translateItemsRouted(
  items: TranslateItem[],
  source: string,
  target: string,
  aiModel: string,
  shopName: string,
  order: Engine[],
): Promise<{ results: Map<string, RoutedResult>; llmTokens: number }> {
  // placeholdersByKey: variable tokens (string[]) extracted from each item's value.
  const placeholdersByKey = new Map<string, string[]>();
  const masked = items.map((it) => {
    const { masked: m, tokens } = maskPlaceholders(it.value);
    placeholdersByKey.set(it.key, tokens);
    return { key: it.key, value: m, digest: it.digest };
  });

  const collected = new Map<string, string>(); // masked translations
  const engineByKey = new Map<string, Engine>(); // which engine resolved each key
  const llmTokensByKey = new Map<string, number>(); // LLM API tokens charged per key
  let systemPrompt: string | null = null;
  const tokenAccum = { value: 0 }; // accumulates LLM token usage across all retries

  for (const engine of order) {
    const missing = masked.filter((i) => !collected.has(i.key));
    if (missing.length === 0) break;

    if (engine === "llm") {
      if (!llmConfigured()) continue;
      if (systemPrompt === null) {
        const [glossary, profile] = await Promise.all([
          loadGlossaryLines(shopName, target),
          loadShopProfile(shopName),
        ]);
        systemPrompt = buildSystemPrompt(target, glossary, profile ? buildProfilePromptBlock(profile) : "");
      }
      try {
        await gatherTranslations(missing, aiModel, systemPrompt, collected, tokenAccum, shopName);
      } catch (e) {
        console.warn(`[route] llm engine error`, e);
      }
      // Attribute newly-resolved keys to the LLM; distribute tokens evenly across keys.
      const newlyResolved = missing.filter((i) => collected.has(i.key) && !engineByKey.has(i.key));
      const tokensEach = newlyResolved.length > 0 ? Math.ceil(tokenAccum.value / newlyResolved.length) : 0;
      for (const i of newlyResolved) {
        engineByKey.set(i.key, "llm");
        llmTokensByKey.set(i.key, tokensEach);
      }
    } else {
      if (!googleConfigured()) continue;
      for (const batch of batchByChars(missing, MAX_CHARS_PER_BATCH)) {
        try {
          const out = await callGoogleTranslate(batch.map((b) => b.value), target, "text");
          batch.forEach((b, i) => {
            if (out[i] != null && !collected.has(b.key)) {
              collected.set(b.key, out[i]);
              engineByKey.set(b.key, "google");
            }
          });
        } catch (e) {
          console.warn(`[route] google engine error`, e);
          break; // stop this engine; remaining items cascade to the next
        }
      }
    }
  }

  const result = new Map<string, RoutedResult>();
  for (const it of items) {
    const raw = collected.get(it.key);
    const placeholders = placeholdersByKey.get(it.key) ?? [];
    if (raw === undefined) {
      result.set(it.key, { value: it.value, status: "fallback", engine: null, tokens: 0 });
      continue;
    }
    const decoded = decodeQuoteEntities(raw);
    if (placeholders.length > 0 && !placeholdersIntact(decoded, placeholders)) {
      console.warn(`[route] placeholder corrupted for key=${it.key}, using original`);
      result.set(it.key, { value: it.value, status: "fallback", engine: null, tokens: 0 });
      continue;
    }
    result.set(it.key, {
      value: restorePlaceholders(decoded, placeholders),
      status: "translated",
      engine: engineByKey.get(it.key) ?? null,
      tokens: llmTokensByKey.get(it.key) ?? 0,
    });
  }
  return { results: result, llmTokens: tokenAccum.value };
}

// Retries for a single (un-splittable) item that fails transiently.
const LEAF_RETRIES = Math.max(
  1,
  Number(process.env.TRANSLATE_LEAF_RETRIES) || 5,
);

/**
 * Pull the JSON object out of a model response that may be wrapped in markdown
 * fences or surrounded by prose. Still throws downstream if the inner text is
 * genuinely malformed.
 */
function extractJsonObject(raw: string): string {
  let s = raw.trim();
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) s = fence[1].trim();
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first >= 0 && last > first) s = s.slice(first, last + 1);
  return s;
}

/**
 * LLMs sometimes HTML-escape quotes/apostrophes in their output (`won't` →
 * `won&#39;t`). In HTML text nodes and plain fields these characters are valid
 * literals, so the escaping is pure noise (and can double-escape on re-runs).
 * Decode ONLY quotes/apostrophes — never &amp;/&lt;/&gt;, which must stay escaped
 * to keep HTML well-formed.
 */
function decodeQuoteEntities(text: string): string {
  return text
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&#0*34;|&quot;/g, '"');
}

// ─── Placeholder masking ───────────────────────────────────────────────────────

/**
 * Variables that must survive translation verbatim. LLMs otherwise translate the
 * word inside them (e.g. {{quantity}} → {{quantité}}, [qty] → [qté]), which
 * breaks Shopify's variable substitution. We mask them before sending and restore
 * after, instead of trusting the model to leave them alone.
 *
 * Covered: Liquid/handlebars `{{ x }}`, Ruby i18n `%{x}`, template `${x}`,
 * printf `%s/%d/%1$s`, numbered `{0}`, and bracket vars `[name]` (but NOT
 * markdown links `[text](url)`).
 */
const PLACEHOLDER_RE =
  /\{\{[^{}]*\}\}|%\{[^}]+\}|\$\{[^}]+\}|%\d*\$?[sd]|\{\d+\}|\[[A-Za-z_][\w-]*\](?!\()/g;

// Rare bracket pair the model treats as an opaque token and won't translate.
const SENT_OPEN = "⟦"; // ⟦
const SENT_CLOSE = "⟧"; // ⟧
const SENT_RE = /⟦(\d+)⟧/g;

function maskPlaceholders(text: string): { masked: string; tokens: string[] } {
  const tokens: string[] = [];
  const masked = text.replace(PLACEHOLDER_RE, (m) => {
    const i = tokens.length;
    tokens.push(m);
    return `${SENT_OPEN}${i}${SENT_CLOSE}`;
  });
  return { masked, tokens };
}

function restorePlaceholders(text: string, tokens: string[]): string {
  return text.replace(SENT_RE, (_m, d: string) => tokens[Number(d)] ?? "");
}

/** True if every masked token's sentinel survived intact in the model output. */
function placeholdersIntact(text: string, tokens: string[]): boolean {
  for (let i = 0; i < tokens.length; i++) {
    if (!text.includes(`${SENT_OPEN}${i}${SENT_CLOSE}`)) return false;
  }
  return true;
}

/**
 * Build the static system prompt. Everything here is stable for a given
 * (source, target, glossary) → it forms a byte-identical prefix across batches
 * so OpenAI automatic prompt caching applies. The variable payload goes in the
 * user message instead.
 */
function buildSystemPrompt(target: string, glossaryLines: string[], profileBlock = ""): string {
  const glossaryBlock = glossaryLines.length
    ? `\nGlossary (apply consistently):\n${glossaryLines.join("\n")}\n`
    : "";
  const shopContextBlock = profileBlock ? `\n${profileBlock}\n` : "";
  return `You are a professional e-commerce translator.${shopContextBlock}
Detect the input language automatically and translate the content into "${target}".
Rules:
- Be accurate and natural for e-commerce
- Translate ALL content into "${target}", no matter what language the input is in (English, Chinese, Spanish, etc.)
- If a value is already entirely in "${target}", return it unchanged
- Keep any ⟦number⟧ tokens exactly as they appear; never translate, modify, reorder, or drop them
- Output literal characters; do NOT HTML-escape. Use ' and " directly — never &#39; or &quot;
- Do NOT add or remove leading or trailing whitespace
- If the value is empty, return it unchanged
- You MUST return an entry for every key in the input
${glossaryBlock}
The user message is a JSON array of {"key","value"} objects to translate.
Return ONLY a JSON object {"translations":[{"key":"<key>","translatedValue":"<text>"}]}, no markdown.`;
}

/**
 * One LLM round-trip. Uses opaque numeric IDs (f0, f1, …) in the payload so the
 * model cannot accidentally swap values based on semantic key names (P1 fix).
 * Returns a map from original keys → translated values, plus the token count.
 * Throws on unparseable JSON so the caller can retry.
 */
/**
 * One LLM round-trip via the adaptive key pool.
 *
 * Concurrency is gated by the pool's AdaptiveSemaphore, which auto-tunes
 * after every response based on X-RateLimit-* headers (Little's Law).
 * On 429 the slot is throttled, the semaphore cap drops, and
 * gatherTranslations' retry loop picks a fresh slot automatically.
 */
async function callLLMOnce(
  items: TranslateItem[],
  aiModel: string,
  systemPrompt: string,
  shopName?: string,
): Promise<{ map: Map<string, string>; tokens: number }> {
  // Opaque IDs prevent the model from confusing semantic key names with content.
  const idToKey = new Map(items.map((it, idx) => [`f${idx}`, it.key]));
  const payload  = items.map((it, idx) => ({ key: `f${idx}`, value: it.value }));

  // 按 shop 的额度并发闸：与全局限流池叠加，额度越少该 shop 并发越低。
  const quotaGate = shopName ? getShopQuotaGate(shopName) : null;
  if (quotaGate) await quotaGate.acquire();

  const acq   = await getPool().acquire();
  // 任务自带的 aiModel 优先（已知 DeepSeek 模型时），否则回退 env。
  const model = resolveModel(aiModel) || acq.model;
  const t0    = Date.now();

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: JSON.stringify(payload) },
  ];

  try {
    const deepseekUserId =
      acq.transport.kind === "deepseek-fetch" && shopName
        ? sanitizeDeepSeekUserId(shopName)
        : undefined;
    const { content: raw, tokens, response, limitHints } = await invokeChatCompletion(
      acq.transport,
      model,
      messages,
      llmTimeoutMsForBatch(items.length),
      getPool().firstTokenBudgetMs(),
      deepseekUserId,
    );

    const rawHeaders = responseHeadersToRecord(response);
    acq.onResponse(rawHeaders, Date.now() - t0, tokens, limitHints);

    // JSON.parse throws on malformed output → propagated to caller for retry/splitting.
    const obj    = JSON.parse(extractJsonObject(raw)) as { translations?: unknown };
    const parsed = Array.isArray(obj.translations)
      ? (obj.translations as Array<{ key?: unknown; translatedValue?: unknown }>)
      : [];

    const map = new Map<string, string>();
    for (const r of parsed) {
      if (typeof r?.key === "string" && typeof r?.translatedValue === "string") {
        const origKey = idToKey.get(r.key);
        if (origKey !== undefined) map.set(origKey, r.translatedValue);
      }
    }
    return { map, tokens };
  } catch (e: unknown) {
    if (e instanceof LlmRateLimitError) {
      acq.onThrottle(retryAfterMsFromResponse(e.response));
    } else {
      // Count + classify non-throttle failures (timeout / parse / http / api).
      // Timeouts also feed the congestion guard so concurrency sheds under load.
      acq.onError(classifyLlmError(e));
    }
    throw e;
  } finally {
    acq.release(); // always release pool semaphore slot
    if (quotaGate) quotaGate.release(); // release per-shop quota gate
  }
}

/**
 * Translate a set of (already masked) items, writing results into `collected`.
 * On an unparseable/failed response the batch is split in half and retried, so a
 * single item that makes the model emit invalid JSON cannot poison the whole
 * batch. A lone failing item is retried a few times, then left for fallback.
 */
async function gatherTranslations(
  items: TranslateItem[],
  aiModel: string,
  systemPrompt: string,
  collected: Map<string, string>,
  tokenAccum: { value: number },
  shopName?: string,
  firstTokenRetriesLeft = FIRST_TOKEN_DRAIN_RETRIES,
): Promise<void> {
  const pend = items.filter((i) => !collected.has(i.key));
  if (pend.length === 0) return;

  // Proactively split before calling the API — avoids burning a full timeout on 80+ keys.
  if (pend.length > MAX_ITEMS_PER_BATCH) {
    const mid = Math.ceil(pend.length / 2);
    console.log(
      `[llm] batch of ${pend.length} items exceeds cap ${MAX_ITEMS_PER_BATCH}; splitting proactively`,
    );
    await gatherTranslations(pend.slice(0, mid), aiModel, systemPrompt, collected, tokenAccum, shopName);
    await gatherTranslations(pend.slice(mid), aiModel, systemPrompt, collected, tokenAccum, shopName);
    return;
  }

  try {
    const { map, tokens } = await callLLMOnce(pend, aiModel, systemPrompt, shopName);
    tokenAccum.value += tokens;
    let progressed = false;
    for (const [k, v] of map) {
      if (!collected.has(k)) {
        collected.set(k, v);
        progressed = true;
      }
    }
    const missing = pend.filter((i) => !collected.has(i.key));
    // Model parsed OK but dropped some keys → retry just those, but only while
    // making progress (avoids looping on a key the model refuses to return).
    if (missing.length > 0 && progressed && missing.length < pend.length) {
      await gatherTranslations(missing, aiModel, systemPrompt, collected, tokenAccum, shopName);
    }
    return;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const timeoutKind = e instanceof LlmTimeoutError ? e.kind : null;
    const isTimeout = timeoutKind !== null;
    if (pend.length > 1) {
      // First-token timeout = the request sat queued server-side before emitting
      // anything. Re-chunking into MORE requests makes the queue worse and re-sends
      // the same work as more calls. The congestion guard has already cut
      // concurrency on this timeout; wait a beat for the queue to drain, then retry
      // the SAME batch. Only fall through to re-chunk if it times out again.
      if (timeoutKind === "first-token" && firstTokenRetriesLeft > 0) {
        console.warn(
          `[llm] batch of ${pend.length} timed out waiting for first token; ` +
          `draining ${(FIRST_TOKEN_DRAIN_MS / 1_000).toFixed(1)}s then retrying same batch ` +
          `(${firstTokenRetriesLeft} retr${firstTokenRetriesLeft === 1 ? "y" : "ies"} left)`,
        );
        if (FIRST_TOKEN_DRAIN_MS > 0) {
          await new Promise((res) => setTimeout(res, FIRST_TOKEN_DRAIN_MS));
        }
        await gatherTranslations(
          pend, aiModel, systemPrompt, collected, tokenAccum, shopName, firstTokenRetriesLeft - 1,
        );
        return;
      }
      // Timeout ≠ poison data. Halving a timed-out batch re-pays the base timeout
      // at every level (25→12→6→3…). Instead jump straight to small chunks so each
      // retry is fast. Parse errors keep the binary split (isolates the bad item).
      if (isTimeout && pend.length > TIMEOUT_RESPLIT_SIZE) {
        console.warn(
          `[llm] batch of ${pend.length} timed out (${msg}); re-chunking to ${TIMEOUT_RESPLIT_SIZE}`,
        );
        for (const chunk of chunkArray(pend, TIMEOUT_RESPLIT_SIZE)) {
          await gatherTranslations(chunk, aiModel, systemPrompt, collected, tokenAccum, shopName);
        }
        return;
      }
      const mid = Math.ceil(pend.length / 2);
      console.warn(
        `[llm] batch of ${pend.length} ${isTimeout ? "timed out" : "unparseable"} (${msg}); splitting`,
      );
      await gatherTranslations(pend.slice(0, mid), aiModel, systemPrompt, collected, tokenAccum, shopName);
      await gatherTranslations(pend.slice(mid), aiModel, systemPrompt, collected, tokenAccum, shopName);
      return;
    }
    // Single item: retry transient failures with backoff, then give up (→ fallback).
    for (let r = 0; r < LEAF_RETRIES; r++) {
      if (LEAF_RETRY_BACKOFF_MS > 0) {
        await new Promise((res) => setTimeout(res, LEAF_RETRY_BACKOFF_MS * (r + 1)));
      }
      try {
        const { map, tokens } = await callLLMOnce(pend, aiModel, systemPrompt, shopName);
        tokenAccum.value += tokens;
        for (const [k, v] of map) if (!collected.has(k)) collected.set(k, v);
        if (collected.has(pend[0].key)) return;
      } catch {
        // keep retrying up to the cap
      }
    }
    // Terminal: this field exhausted retries and will fall back to the original.
    // Recorded separately from per-attempt errors so telemetry can tell
    // "wasted attempts that recovered" from "user-visible fallbacks".
    getPool().recordTerminalFallback(1);
    console.warn(`[llm] item ${pend[0].key} failed after retries (${msg}); using original`);
  }
}

// ─── Main exported functions ────────────────────────────────────────────────────

export type ResourceInput = { resourceId: string; fields: TranslateItem[] };
export type ResourceResult = { resourceId: string; results: TranslateResult[] };
/** Per-engine-model tally of how much content each engine translated. */
export type EngineUsage = Record<string, { units: number; chars: number; tokens: number }>;
export type TranslateChunkResult = { resources: ResourceResult[]; usage: EngineUsage };

export function mergeEngineUsage(into: EngineUsage, from: EngineUsage): void {
  for (const [model, u] of Object.entries(from)) {
    const acc = (into[model] ??= { units: 0, chars: 0, tokens: 0 });
    acc.units += u.units;
    acc.chars += u.chars;
    acc.tokens += u.tokens;
  }
}

// Reconstruction plan for a field whose translation spans one or more text units.
type FieldPlan = {
  resourceId: string;
  key: string;
  digest: string;
  order: Engine[];
  cacheModel: string;
} & (
  | { kind: "plain"; parts: string[] }
  | { kind: "html"; template: string; nodeParts: string[][] }
  | { kind: "json"; root: JsonValue; leaves: string[] }
);

type LookupFn = (order: Engine[], text: string) => RoutedResult | undefined;

function planTextsReady(plan: FieldPlan, lookup: LookupFn): boolean {
  const texts =
    plan.kind === "plain"
      ? plan.parts
      : plan.kind === "html"
        ? plan.nodeParts.flat()
        : [...new Set(plan.leaves)];
  return texts.every((t) => lookup(plan.order, t) !== undefined);
}

function reconstructPlan(
  plan: FieldPlan,
  rm: Map<string, TranslateResult>,
  lookup: LookupFn,
  tmWrites: Promise<void>[],
  shopName: string,
  target: string,
  source: string,
): void {
  if (plan.kind === "plain") {
    const pieces = plan.parts.map((p) => lookup(plan.order, p) ?? { value: p, status: "fallback" as const });
    const value = pieces.map((p) => p.value).join("");
    const status = pieces.some((p) => p.status === "fallback") ? "fallback" : "translated";
    const originalValue = plan.parts.join("");
    rm.set(plan.key, { key: plan.key, translatedValue: value, digest: plan.digest, status });
    if (status === "translated") {
      tmWrites.push(tmSet(shopName, target, plan.cacheModel, plan.digest, value));
      tmWrites.push(tmSetByValue(originalValue, source, target, plan.cacheModel, value));
    }
  } else if (plan.kind === "html") {
    let anyFallback = false;
    // Each marker = its parts joined back. A single oversized node was split into
    // several parts; rejoin them (preserving inner boundaries) for that marker.
    const out = plan.nodeParts.map((parts) => {
      const pieces = parts.map((p) => {
        const r = lookup(plan.order, p);
        if (!r || r.status === "fallback") {
          anyFallback = true;
          return p;
        }
        return r.value;
      });
      return pieces.join("").trim();
    });
    const value = restoreHtmlTextNodes(plan.template, out);
    const status = anyFallback ? "fallback" : "translated";
    rm.set(plan.key, { key: plan.key, translatedValue: value, digest: plan.digest, status });
    if (status === "translated") tmWrites.push(tmSet(shopName, target, plan.cacheModel, plan.digest, value));
  } else {
    let anyFallback = false;
    const tmap = new Map<string, string>();
    for (const t of plan.leaves) {
      if (tmap.has(t)) continue;
      const r = lookup(plan.order, t);
      if (!r || r.status === "fallback") {
        anyFallback = true;
        tmap.set(t, t);
      } else {
        tmap.set(t, r.value.trim());
      }
    }
    const value = JSON.stringify(rebuildJson(plan.root, tmap));
    const status = anyFallback ? "fallback" : "translated";
    rm.set(plan.key, { key: plan.key, translatedValue: value, digest: plan.digest, status });
    if (status === "translated") tmWrites.push(tmSet(shopName, target, plan.cacheModel, plan.digest, value));
  }
}

/**
 * Translate every field across a whole chunk of resources in one pass.
 *
 * Key optimizations over per-resource translation:
 *  - Cross-resource batching: identical-engine text units from all resources are
 *    translated together (fewer round-trips, better prompt-cache amortization).
 *  - Dedup: each unique (engine-order, text) is translated once and reused
 *    everywhere it occurs in the chunk.
 *
 * Engine selection: cost-tiered routing (Google for short/simple, DeepSeek for rich)
 * with cross-engine fallback, unless the job sets aiModel=google-translate.
 * Placeholders are masked across all engines; TM cache keyed by tier model.
 */
export type TranslatedResourceOutput = {
  resourceId: string;
  results: TranslateResult[];
};

export async function translateResources(
  resources: ResourceInput[],
  source: string,
  target: string,
  aiModel: string,
  shopName: string,
  onProgress?: (doneUnitsDelta: number, tokensDelta: number) => Promise<void>,
  onResourceDone?: (resource: TranslatedResourceOutput) => Promise<void>,
  shouldAbort?: () => boolean | Promise<boolean>,
): Promise<TranslateChunkResult> {
  const abortRequested = async (): Promise<boolean> =>
    shouldAbort ? Boolean(await shouldAbort()) : false;

  const resultMaps = new Map<string, Map<string, TranslateResult>>();
  const plans: FieldPlan[] = [];
  // orderSig → (unique text → occurrence count across the chunk).
  const pools = new Map<string, Map<string, number>>();
  const addUnit = (order: Engine[], text: string) => {
    const sig = order.join(",");
    const occ = pools.get(sig) ?? pools.set(sig, new Map()).get(sig)!;
    occ.set(text, (occ.get(text) ?? 0) + 1);
  };

  // Units resolved without hitting an engine (cache hits) — credited immediately.
  let cacheUnits = 0;

  // Opt-in: skip fields that contain none of the source-language script.
  const skipNonSourceScript = /^(1|true|yes)$/i.test(
    process.env.TRANSLATE_SKIP_NON_SOURCE_SCRIPT ?? "",
  );

  // 1. Plan every field: resolve skip/cache directly; collect units to translate.
  //    TM lookups are fired in parallel across all fields to minimise Redis RTTs.
  for (const res of resources) {
    resultMaps.set(res.resourceId, new Map<string, TranslateResult>());
  }

  // 1a. Separate skip fields (no TM needed) from fields that need a cache check.
  type FieldWork = {
    resourceId: string;
    f: TranslateItem;
    klass: "html" | "json" | "plain";
    order: Engine[];
    cacheModel: string;
  };
  const fieldWorks: FieldWork[] = [];

  for (const res of resources) {
    const rm = resultMaps.get(res.resourceId)!;
    for (const f of res.fields) {
      const klass = classifyField(f.key, f.value);
      if (klass === "skip") {
        rm.set(f.key, { key: f.key, translatedValue: f.value, digest: f.digest, status: "translated" });
        continue;
      }
      const order = engineOrderFor(fieldTier(f.key, f.value, klass), aiModel);
      const cacheModel = engineModel(order[0], aiModel);
      fieldWorks.push({ resourceId: res.resourceId, f, klass, order, cacheModel });
    }
  }

  const tmWrites: Promise<void>[] = [];

  // 1b. Fire all TM digest lookups in parallel.
  const cacheHits = await Promise.all(
    fieldWorks.map(({ f, cacheModel }) => tmGet(shopName, target, cacheModel, f.digest)),
  );

  // 1c. Process results: hit → credit immediately; miss → value cache or add to plan.
  for (let wi = 0; wi < fieldWorks.length; wi++) {
    const { resourceId, f, klass, order, cacheModel } = fieldWorks[wi];
    const rm = resultMaps.get(resourceId)!;
    const cached = cacheHits[wi];
    if (cached !== null) {
      rm.set(f.key, { key: f.key, translatedValue: cached, digest: f.digest, status: "translated" });
      cacheUnits += countFieldUnits(f.key, f.value);
      continue;
    }

    // Secondary: value-based cache for short plain-text fields.
    if (klass === "plain") {
      const cachedByValue = await tmGetByValue(f.value, source, target, cacheModel);
      if (cachedByValue !== null) {
        rm.set(f.key, { key: f.key, translatedValue: cachedByValue, digest: f.digest, status: "translated" });
        tmWrites.push(tmSet(shopName, target, cacheModel, f.digest, cachedByValue));
        cacheUnits += countFieldUnits(f.key, f.value);
        continue;
      }
    }

    // Already-in-target check: if the value appears to already be in the target
    // language, skip it — the LLM would just echo it back unchanged.
    // For zh-CN→en: English content (no CJK) is skipped (it's already the target).
    // For zh-CN→pl: English content is NOT skipped (it still needs translation to Polish).
    //
    // Opt-in TRANSLATE_SKIP_NON_SOURCE_SCRIPT extends this: when the operator
    // knows the store's real source language, any field that contains none of
    // the source script is treated as already-done and skipped (saves the tokens
    // otherwise spent re-translating non-source content). Off by default because
    // for a mixed-language store with a non-English target, skipping non-source
    // content would leave it untranslated.
    if (
      alreadyInTarget(f.value, source, target) ||
      (skipNonSourceScript && !containsSourceScript(f.value, source))
    ) {
      rm.set(f.key, { key: f.key, translatedValue: f.value, digest: f.digest, status: "translated" });
      cacheUnits += countFieldUnits(f.key, f.value);
      continue;
    }

    if (klass === "html") {
      const { template, nodeParts } = htmlNodePartsOf(f.value);
      if (nodeParts.length === 0) {
        rm.set(f.key, { key: f.key, translatedValue: f.value, digest: f.digest, status: "translated" });
        continue;
      }
      nodeParts.forEach((parts) => parts.forEach((p) => addUnit(order, p)));
      plans.push({ kind: "html", resourceId, key: f.key, digest: f.digest, order, cacheModel, template, nodeParts });
    } else if (klass === "json") {
      const root = tryParseJsonContainer(f.value);
      const leaves: string[] = [];
      if (root !== undefined) collectJsonLeaves(root, leaves);
      if (root === undefined) {
        // Re-classified between init and here, or unparseable now — fall back to
        // plain handling so the field is still translated, just not structurally.
        const parts = splitPlainText(f.value);
        parts.forEach((p) => addUnit(order, p));
        plans.push({ kind: "plain", resourceId, key: f.key, digest: f.digest, order, cacheModel, parts });
      } else if (leaves.length === 0) {
        // Pure structural/config JSON with no human-readable copy — keep verbatim.
        rm.set(f.key, { key: f.key, translatedValue: f.value, digest: f.digest, status: "translated" });
        continue;
      } else {
        leaves.forEach((t) => addUnit(order, t));
        plans.push({ kind: "json", resourceId, key: f.key, digest: f.digest, order, cacheModel, root, leaves });
      }
    } else {
      const parts = splitPlainText(f.value);
      parts.forEach((p) => addUnit(order, p));
      plans.push({ kind: "plain", resourceId, key: f.key, digest: f.digest, order, cacheModel, parts });
    }
  }

  // Credit cache hits immediately so the bar reflects them (0 LLM tokens for TM hits).
  if (cacheUnits > 0 && onProgress) await onProgress(cacheUnits, 0);

  const plansByResource = new Map<string, FieldPlan[]>();
  for (const plan of plans) {
    const list = plansByResource.get(plan.resourceId) ?? [];
    list.push(plan);
    plansByResource.set(plan.resourceId, list);
  }

  const reconstructedResources = new Set<string>();

  const buildResourceOutput = (res: ResourceInput): TranslatedResourceOutput => {
    const rm = resultMaps.get(res.resourceId)!;
    return {
      resourceId: res.resourceId,
      results: res.fields.map(
        (f) =>
          rm.get(f.key) ?? {
            key: f.key,
            translatedValue: f.value,
            digest: f.digest,
            status: "fallback" as const,
          },
      ),
    };
  };

  let finishLock: Promise<void> = Promise.resolve();
  const finishReadyResources = async (lookup: LookupFn): Promise<void> => {
    await (finishLock = finishLock.then(async () => {
      if (await abortRequested()) return;
      for (const res of resources) {
        if (reconstructedResources.has(res.resourceId)) continue;
        const resourcePlans = plansByResource.get(res.resourceId);
        if (!resourcePlans) {
          reconstructedResources.add(res.resourceId);
          if (onResourceDone) await onResourceDone(buildResourceOutput(res));
          continue;
        }
        if (!resourcePlans.every((plan) => planTextsReady(plan, lookup))) continue;
        const rm = resultMaps.get(res.resourceId)!;
        for (const plan of resourcePlans) {
          reconstructPlan(plan, rm, lookup, tmWrites, shopName, target, source);
        }
        reconstructedResources.add(res.resourceId);
        if (onResourceDone) await onResourceDone(buildResourceOutput(res));
      }
    }));
  };

  // Resources fully resolved in step 1 (skip/cache only) count immediately.
  await finishReadyResources(() => undefined);

  // 2. Translate unique texts per engine order, in char-bounded batches.
  //    All batches are launched concurrently — the pool's AdaptiveSemaphore
  //    (driven by X-RateLimit-* headers) is the only throttle.
  const usage: EngineUsage = {};
  const translated = new Map<string, Map<string, RoutedResult>>();
  for (const [sig, occ] of pools) {
    const order = sig.split(",") as Engine[];
    const texts = [...occ.keys()];
    const tmap = new Map<string, RoutedResult>();
    const items: TranslateItem[] = texts.map((t, i) => ({ key: String(i), value: t, digest: "" }));
    const { maxChars, maxItems } = resolveBatchLimits(order);
    const batches = batchByChars(items, maxChars, maxItems);
    await Promise.all(batches.map(async (batch) => {
      if (await abortRequested()) return;
      const { results: m, llmTokens } = await translateItemsRouted(batch, source, target, aiModel, shopName, order);
      let batchUnits = 0;
      for (const [k, v] of m) {
        const text = texts[Number(k)];
        tmap.set(text, v);
        batchUnits += occ.get(text) ?? 1;
        if (v.status === "translated" && v.engine) {
          const model = engineModel(v.engine, aiModel);
          const acc = (usage[model] ??= { units: 0, chars: 0, tokens: 0 });
          acc.units += 1;
          acc.chars += text.length;
          acc.tokens += v.tokens;
        }
      }
      translated.set(sig, tmap);
      if (onProgress) await onProgress(batchUnits, llmTokens);
      const lookup: LookupFn = (planOrder, text) => translated.get(planOrder.join(","))?.get(text);
      await finishReadyResources(lookup);
    }));
  }

  const lookup: LookupFn = (planOrder, text) => translated.get(planOrder.join(","))?.get(text);
  await finishReadyResources(lookup);
  if (tmWrites.length > 0) await Promise.all(tmWrites);

  // 4. Assemble per-resource results aligned to input field order.
  const out = resources.map((res) => {
    const rm = resultMaps.get(res.resourceId)!;
    return {
      resourceId: res.resourceId,
      results: res.fields.map(
        (f) =>
          rm.get(f.key) ?? { key: f.key, translatedValue: f.value, digest: f.digest, status: "fallback" as const },
      ),
    };
  });
  return { resources: out, usage };
}

/**
 * Translate all fields for a single resource. Thin wrapper over translateResources.
 */
export async function translateBatch(
  items: TranslateItem[],
  source: string,
  target: string,
  aiModel: string,
  shopName: string,
): Promise<TranslateResult[]> {
  const { resources } = await translateResources(
    [{ resourceId: "__single__", fields: items }],
    source,
    target,
    aiModel,
    shopName,
  );
  return resources[0].results;
}
