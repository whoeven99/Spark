import { runInitWorker } from "./workers/initWorker.js";
import { runTranslateWorker } from "./workers/translateWorker.js";
import { runWritebackWorker } from "./workers/writebackWorker.js";
import { runVerifyWorker } from "./workers/verifyWorker.js";
import { runAnalysisWorker } from "./workers/analysisWorker.js";
import { resetStaleJobs } from "./services/cosmosV4.js";
import { resetStaleAnalysisJobs } from "./services/cosmosAnalysis.js";
import { runAutoTranslateScan } from "./services/autoTranslate.js";
import { cleanupStaleEmptyAutoJobs } from "./services/cleanupEmptyAutoJobs.js";

/** 各 stage 轮询间隔；hint 队列有任务时仍靠上一阶段 wake 立即触发。 */
const POLL_INTERVAL_MS = Math.max(
  500,
  Number(process.env.WORKER_POLL_INTERVAL_MS) || 2_000,
);
const STALE_RESET_INTERVAL_MS = 5 * 60_000;
/** 自动翻译扫描间隔：默认 1 小时；不配 AUTO_TRANSLATE_INTERVAL_MS 即用此值。 */
const AUTO_TRANSLATE_INTERVAL_MS_DEFAULT = 60 * 60_000;
const AUTO_TRANSLATE_INTERVAL_MS = (() => {
  const n = Number(process.env.AUTO_TRANSLATE_INTERVAL_MS);
  return n > 0 ? n : AUTO_TRANSLATE_INTERVAL_MS_DEFAULT;
})();
/** 空自动任务定时清理间隔（默认 6 小时）。 */
const AUTO_EMPTY_JOB_CLEANUP_INTERVAL_MS =
  Number(process.env.AUTO_EMPTY_JOB_CLEANUP_INTERVAL_MS) || 6 * 60 * 60_000;

const ALL_STAGES = ["init", "translate", "writeback", "verify", "analysis"] as const;
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
  console.log(`[scheduler] starting translation v4 workers (stages: ${[...stages].join(",")}, poll=${POLL_INTERVAL_MS}ms)`);

  const runners: Record<Stage, () => Promise<void>> = {
    init: runInitWorker,
    translate: runTranslateWorker,
    writeback: runWritebackWorker,
    verify: runVerifyWorker,
    analysis: runAnalysisWorker,
  };

  // resetStale always runs — harmless when a stage is disabled.
  safeRun("resetStale", () => resetStaleJobs());
  safeRun("resetStaleAnalysis", () => resetStaleAnalysisJobs());
  setInterval(() => safeRun("resetStale", () => resetStaleJobs()), STALE_RESET_INTERVAL_MS);
  setInterval(() => safeRun("resetStaleAnalysis", () => resetStaleAnalysisJobs()), STALE_RESET_INTERVAL_MS);

  // 自动翻译扫描：定时为开启自动翻译的店创建增量任务（gated by init stage）。
  if (stages.has("init")) {
    safeRun("autoTranslate", () => runAutoTranslateScan());
    setInterval(
      () => safeRun("autoTranslate", () => runAutoTranslateScan()),
      AUTO_TRANSLATE_INTERVAL_MS,
    );
  } else {
    console.log('[scheduler] init stage 关闭，跳过 autoTranslate 扫描');
  }

  if (stages.has("init")) {
    safeRun("autoJobCleanup", () => cleanupStaleEmptyAutoJobs());
    setInterval(
      () => safeRun("autoJobCleanup", () => cleanupStaleEmptyAutoJobs()),
      AUTO_EMPTY_JOB_CLEANUP_INTERVAL_MS,
    );
  }

  for (const stage of ALL_STAGES) {
    if (!stages.has(stage)) {
      console.log(`[scheduler] stage "${stage}" disabled by WORKER_STAGES`);
      continue;
    }
    const run = runners[stage];
    safeRun(stage, run);
    setInterval(() => safeRun(stage, run), POLL_INTERVAL_MS);
  }
}
