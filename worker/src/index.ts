import { hostname } from "node:os";
import { ensureWorkerEnv } from "./env.js";
import { pingRedis } from "./services/redisV4.js";
import { releaseJobsClaimedBySuffix } from "./services/cosmosV4.js";
import { startScheduler } from "./scheduler.js";
import { beginShutdown, isShuttingDown } from "./shutdown.js";

// 最早执行：加载 Render Secret File + 诊断
ensureWorkerEnv();

console.log("[worker] spark-translation-worker starting");
console.log(`[worker] PID=${process.pid} Node=${process.version}`);

void pingRedis().then((ok) => {
  console.info(`[worker] Redis ping ${ok ? "✅ OK" : "❌ FAILED — check REDIS_URL / Azure firewall"}`);
});

process.on("unhandledRejection", (reason) => {
  console.error("[worker] unhandledRejection", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[worker] uncaughtException", err);
});

// ── 优雅停机 ──────────────────────────────────────────────────────────────────
// 各 worker 的 claimedBy 形如 `${stage}-${host}-${pid}`，本进程统一以此后缀结尾。
// 收到 SIGTERM（Render 重新部署）时，把本进程在飞的任务重新入队，新 worker 立即接管，
// 不必等 10 分钟 stale-reset。带 8s 超时兜底，保证在 SIGKILL 前退出。
const CLAIM_SUFFIX = `-${process.env.HOSTNAME ?? hostname()}-${process.pid}`;
const SHUTDOWN_RELEASE_MS = Math.max(
  3_000,
  Number(process.env.SHUTDOWN_RELEASE_MS) || 15_000,
);
async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown()) return;
  beginShutdown();
  console.log(
    `[worker] ${signal} 收到，释放在飞任务（suffix=${CLAIM_SUFFIX}，最多等 ${SHUTDOWN_RELEASE_MS}ms）…`,
  );
  try {
    const released = await Promise.race([
      releaseJobsClaimedBySuffix(CLAIM_SUFFIX),
      new Promise<number>((r) => setTimeout(() => r(-1), SHUTDOWN_RELEASE_MS)),
    ]);
    if (released === -1) {
      console.warn(`[worker] 释放任务超时（${SHUTDOWN_RELEASE_MS}ms），仍退出`);
    } else {
      console.log(`[worker] 已释放 ${released} 个在飞任务，退出`);
    }
  } catch (e) {
    console.error("[worker] 优雅停机释放失败", e);
  }
  process.exit(0);
}
process.on("SIGTERM", () => void gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => void gracefulShutdown("SIGINT"));

startScheduler();
