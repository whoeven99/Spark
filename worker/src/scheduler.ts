import { runInitWorker } from "./workers/initWorker.js";
import { runTranslateWorker } from "./workers/translateWorker.js";
import { runWritebackWorker } from "./workers/writebackWorker.js";
import { runVerifyWorker } from "./workers/verifyWorker.js";
import { resetStaleJobs } from "./services/cosmosV4.js";

const INTERVAL_MS = 30_000;
const STALE_RESET_INTERVAL_MS = 5 * 60_000;

const ALL_STAGES = ["init", "translate", "writeback", "verify"] as const;
type Stage = (typeof ALL_STAGES)[number];

/**
 * Which pipeline stages this process runs. Defaults to all. Set WORKER_STAGES
 * to a comma list (e.g. "init,translate") to gate stages — useful for online
 * quality testing where writeback to the live store must be skipped.
 */
function enabledStages(): Set<Stage> {
  const raw = process.env.WORKER_STAGES?.trim();
  if (!raw) return new Set(ALL_STAGES);
  const requested = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is Stage => (ALL_STAGES as readonly string[]).includes(s));
  return new Set(requested.length > 0 ? requested : ALL_STAGES);
}

function safeRun(name: string, fn: () => Promise<void>): void {
  fn().catch((e) => console.error(`[scheduler] ${name} error`, e));
}

export function startScheduler(): void {
  const stages = enabledStages();
  console.log(`[scheduler] starting translation v4 workers (stages: ${[...stages].join(",")})`);

  const runners: Record<Stage, () => Promise<void>> = {
    init: runInitWorker,
    translate: runTranslateWorker,
    writeback: runWritebackWorker,
    verify: runVerifyWorker,
  };

  // resetStale always runs: it only moves processing states back to *_QUEUED,
  // which is harmless even when a stage is gated off.
  safeRun("resetStale", () => resetStaleJobs());
  setInterval(() => safeRun("resetStale", () => resetStaleJobs()), STALE_RESET_INTERVAL_MS);

  for (const stage of ALL_STAGES) {
    if (!stages.has(stage)) {
      console.log(`[scheduler] stage "${stage}" disabled by WORKER_STAGES`);
      continue;
    }
    const run = runners[stage];
    safeRun(stage, run);
    setInterval(() => safeRun(stage, run), INTERVAL_MS);
  }
}
