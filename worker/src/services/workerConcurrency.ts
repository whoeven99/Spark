/**
 * Process-local concurrency gates for worker stages.
 *
 * The scheduler polls every WORKER_POLL_INTERVAL_MS and does not await prior
 * runs, so without caps many shops can each hold a long-running translate job
 * in memory at once (chunks × blob payloads × LLM buffers).
 */

export class StageConcurrencyGate {
  private _inflight = 0;

  constructor(private readonly _max: number) {}

  get max(): number {
    return this._max;
  }

  get inflight(): number {
    return this._inflight;
  }

  hasCapacity(): boolean {
    return this._inflight < this._max;
  }

  /** Returns false when at capacity — caller should skip this poll tick. */
  tryAcquire(): boolean {
    if (this._inflight >= this._max) return false;
    this._inflight++;
    return true;
  }

  release(): void {
    this._inflight = Math.max(0, this._inflight - 1);
  }
}

function readPositiveIntEnv(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return n > 0 ? Math.floor(n) : fallback;
}

/** Max translate jobs processed concurrently in this worker process (default 2). */
export const translateJobGate = new StageConcurrencyGate(
  readPositiveIntEnv("TRANSLATE_JOB_CONCURRENCY", 2),
);
