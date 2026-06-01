import { ensureWorkerEnv } from "./env.js";
import { startScheduler } from "./scheduler.js";

// 最早执行：加载 Render Secret File + 诊断
ensureWorkerEnv();

console.log("[worker] spark-translation-worker starting");
console.log(`[worker] PID=${process.pid} Node=${process.version}`);

process.on("unhandledRejection", (reason) => {
  console.error("[worker] unhandledRejection", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[worker] uncaughtException", err);
});

startScheduler();
