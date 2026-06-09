import type { TranslationV4Metrics, TranslationV4Status } from "./types";

/** 回写阶段是否仍有资源需要写入（含曾失败待重试的条目）。 */
export function writebackNeedsRetry(metrics: TranslationV4Metrics): boolean {
  const total = metrics.writebackTotal ?? 0;
  if (total <= 0) return false;
  const done = metrics.writebackDone ?? 0;
  const failed = metrics.writebackFailed ?? 0;
  if (done < total) return true;
  if (failed > 0) return true;
  return false;
}

/**
 * 从 PAUSED / FAILED 恢复时应进入的队列状态。
 * 回写未完成时优先 WRITEBACK，避免 errorStage=VERIFY 时跳过未回写资源。
 */
export function resolveResumeV4JobStatus(
  currentStatus: TranslationV4Status,
  errorStage: string | null,
  metrics: TranslationV4Metrics,
): TranslationV4Status | null {
  if (currentStatus !== "PAUSED" && currentStatus !== "FAILED") return null;

  if (writebackNeedsRetry(metrics)) {
    return "WRITEBACK_QUEUED";
  }

  switch (errorStage) {
    case "TRANSLATE":
      return "TRANSLATE_QUEUED";
    case "WRITEBACK":
      return "WRITEBACK_QUEUED";
    case "VERIFY":
      return "VERIFY_QUEUED";
    default:
      return "INIT_QUEUED";
  }
}
