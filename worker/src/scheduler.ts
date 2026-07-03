import { runInitWorker } from "./workers/initWorker.js";
import { runTranslateWorker } from "./workers/translateWorker.js";
import { runWritebackWorker } from "./workers/writebackWorker.js";
import { runEmailWorker } from "./workers/emailWorker.js";
import { resetStaleJobs, wakeQueuedJobsAfterDeploy } from "./services/cosmosV4.js";
import { completeLegacyVerifyJobs } from "./services/finalizeJobAfterWriteback.js";
import { runAutoTranslateScan } from "./services/autoTranslate.js";
import { cleanupStaleEmptyAutoJobs } from "./services/cleanupEmptyAutoJobs.js";
import { isShuttingDown } from "./shutdown.js";
import { hostname } from "os";
import {
  getAutoTranslateIntervalMs,
  getAutoTranslateScheduleMinute,
  getAutoTranslateScheduleTimezone,
  msUntilNextClockAlignedScan,
  resolveNextClockAlignedScanAt,
} from "./services/autoScanSchedule.js";

/** 各 stage 轮询间隔；hint 队列有任务时仍靠上一阶段 wake 立即触发。 */
const POLL_INTERVAL_MS = Math.max(
  500,
  Number(process.env.WORKER_POLL_INTERVAL_MS) || 2_000,
);
const STALE_RESET_INTERVAL_MS = 5 * 60_000;
/** 空自动任务定时清理间隔（默认 6 小时）。 */
const AUTO_EMPTY_JOB_CLEANUP_INTERVAL_MS =
  Number(process.env.AUTO_EMPTY_JOB_CLEANUP_INTERVAL_MS) || 6 * 60 * 60_000;
/** 邮件通知发送间隔（默认 30 秒，可用 EMAIL_WORKER_INTERVAL_MS 覆盖）。 */
const EMAIL_WORKER_INTERVAL_MS = (() => {
  const n = Number(process.env.EMAIL_WORKER_INTERVAL_MS);
  return n > 0 ? n : 30_000;
})();

const ALL_STAGES = ["init", "translate", "writeback"] as const;
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
  if (isShuttingDown()) return;
  fn().catch((e) => console.error(`[scheduler] ${name} error`, e));
}

function scheduleAutoTranslateScan(): void {
  const tz = getAutoTranslateScheduleTimezone();
  const intervalMs = getAutoTranslateIntervalMs();
  const minute = getAutoTranslateScheduleMinute();

  const scheduleNext = () => {
    const waitMs = msUntilNextClockAlignedScan();
    const nextAt = resolveNextClockAlignedScanAt();
    console.log(
      `[scheduler] autoTranslate 下次扫描 ${nextAt.toISOString()} (tz=${tz}, :${String(minute).padStart(2, "0")}, interval=${intervalMs}ms)`,
    );
    setTimeout(() => {
      safeRun("autoTranslate", async () => {
        await runAutoTranslateScan();
        scheduleNext();
      });
    }, waitMs);
  };

  scheduleNext();
}

export function startScheduler(): void {
  const stages = enabledStages();
  const claimSuffix = `-${process.env.HOSTNAME ?? hostname()}-${process.pid}`;
  console.log(`[scheduler] starting translation v4 workers (stages: ${[...stages].join(",")}, poll=${POLL_INTERVAL_MS}ms)`);

  const runners: Record<Stage, () => Promise<void>> = {
    init: runInitWorker,
    translate: runTranslateWorker,
    writeback: runWritebackWorker,
  };

  // resetStale always runs — harmless when a stage is disabled.
  safeRun("deployWake", async () => {
    await wakeQueuedJobsAfterDeploy(claimSuffix);
    await completeLegacyVerifyJobs();
  });
  safeRun("resetStale", () => resetStaleJobs());
  setInterval(() => safeRun("resetStale", () => resetStaleJobs()), STALE_RESET_INTERVAL_MS);

  // 自动翻译：按整点调度（默认北京时间每小时 :00），启动时不立即扫描
  if (stages.has("init")) {
    scheduleAutoTranslateScan();
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

  // 邮件通知：翻译任务完成后发送通知邮件（独立于 pipeline stages，始终运行）。
  safeRun("emailWorker", () => runEmailWorker());
  setInterval(() => safeRun("emailWorker", () => runEmailWorker()), EMAIL_WORKER_INTERVAL_MS);

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
