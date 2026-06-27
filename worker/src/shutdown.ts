/** 进程优雅停机标志 —— SIGTERM/SIGINT 时置位，各 worker 应尽快收尾并退出。 */
let shuttingDown = false;

export function beginShutdown(): void {
  shuttingDown = true;
}

export function isShuttingDown(): boolean {
  return shuttingDown;
}
