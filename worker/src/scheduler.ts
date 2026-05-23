import { runInitWorker } from "./workers/initWorker.js";
import { runTranslateWorker } from "./workers/translateWorker.js";
import { runWritebackWorker } from "./workers/writebackWorker.js";
import { resetStaleJobs } from "./services/cosmosV4.js";

const INTERVAL_MS = 30_000;
const STALE_RESET_INTERVAL_MS = 5 * 60_000;

function safeRun(name: string, fn: () => Promise<void>): void {
  fn().catch((e) => console.error(`[scheduler] ${name} error`, e));
}

export function startScheduler(): void {
  console.log("[scheduler] starting translation v4 workers");

  // On startup: reset stale jobs from before last restart, then run all workers immediately
  safeRun("resetStale", () => resetStaleJobs());
  safeRun("init", runInitWorker);
  safeRun("translate", runTranslateWorker);
  safeRun("writeback", runWritebackWorker);

  setInterval(() => safeRun("init", runInitWorker), INTERVAL_MS);
  setInterval(() => safeRun("translate", runTranslateWorker), INTERVAL_MS);
  setInterval(() => safeRun("writeback", runWritebackWorker), INTERVAL_MS);
  setInterval(() => safeRun("resetStale", () => resetStaleJobs()), STALE_RESET_INTERVAL_MS);
}
