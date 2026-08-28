import type { TFunction } from "i18next";

export const THINKING_I18N_PREFIX = "workspace.shell.chat.thinking";

/** 思考耗时格式化：优先秒，超过 60s 用分秒 */
export function formatThinkingDuration(ms: number, t: TFunction): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  if (totalSeconds < 60) {
    return t(`${THINKING_I18N_PREFIX}.durationSeconds`, { seconds: totalSeconds });
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return t(`${THINKING_I18N_PREFIX}.durationMinutes`, { minutes, seconds });
}
