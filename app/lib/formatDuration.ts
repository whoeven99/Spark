/**
 * 将预估秒数格式化为人类可读字符串（使用 i18n）。
 * - seconds == null：返回 t("common.durationUnknown")（数据不足）
 * - seconds < 90：返回 t("common.durationSeconds", { value })
 * - seconds >= 90：返回 t("common.durationMinutes", { value: Math.round(seconds/60) })
 */
export function formatEstimatedDuration(
  seconds: number | null | undefined,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  if (seconds == null) return t("common.durationUnknown");
  if (seconds < 90) return t("common.durationSeconds", { value: Math.round(seconds) });
  return t("common.durationMinutes", { value: Math.round(seconds / 60) });
}
