/** Worker 内部 abort 原因 —— 只打日志，不写 Cosmos / Redis pauseReason。 */
export const INTERNAL_ABORT_REASONS = new Set([
  "任务已被其它 worker 接管",
  "任务已不存在",
  "任务已重新排队",
  "已暂停",
]);

export function isInternalAbortReason(reason: string): boolean {
  return INTERNAL_ABORT_REASONS.has(reason);
}

/** 商户可见的暂停原因；内部原因返回 null。 */
export function userFacingPauseMessage(reason: string): string | null {
  if (isInternalAbortReason(reason)) return null;
  return reason;
}
