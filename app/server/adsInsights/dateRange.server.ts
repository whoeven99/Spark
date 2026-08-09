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

/**
 * Google Ads GAQL 日期过滤子句。
 *
 * 用显式区间而不是 `LAST_N_DAYS` 预置：预置区间不含当天，会和
 * `resolveDateWindow` 报出的窗口差一天，落库后按日期切窗口就会缺当天。
 */
export function googleDateClause(dateStart: string, dateEnd: string): string {
  return `segments.date BETWEEN '${dateStart}' AND '${dateEnd}'`;
}
