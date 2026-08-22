export type AdsInsightsRangeDays = 7 | 14 | 30;

/** UTC 日历日：含今天共 rangeDays 天。 */
export function resolveDateWindow(
  rangeDays: AdsInsightsRangeDays,
  now = new Date(),
): { dateStart: string; dateEnd: string } {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (rangeDays - 1));
  return {
    dateStart: start.toISOString().slice(0, 10),
    dateEnd: end.toISOString().slice(0, 10),
  };
}
