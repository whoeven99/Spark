import type { AdsInsightsRangeDays } from "./types.server";

export function parseRangeDays(raw: string | null | undefined): AdsInsightsRangeDays {
  const n = Number(raw);
  if (n === 14) return 14;
  if (n === 30) return 30;
  return 7;
}

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

/** Google Ads GAQL `segments.date DURING ...` 预置区间。 */
export function googleDuringClause(rangeDays: AdsInsightsRangeDays): string {
  if (rangeDays === 14) return "LAST_14_DAYS";
  if (rangeDays === 30) return "LAST_30_DAYS";
  return "LAST_7_DAYS";
}
