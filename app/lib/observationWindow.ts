/**
 * 经营页与健康度共用的观察窗口。
 *
 * 存储 / 计算：UTC 完整日历日、半开区间 [start, end)，不含今天（UTC）。
 * 展示：把上述 UTC 日期按店铺时区格式化，并标注「不含今天」。
 */

export type ObservationWindowView = {
  days: number;
  /** 含当天 00:00 UTC */
  startAt: string;
  /** 不含当天，等于今日 UTC 00:00 */
  endAt: string;
  timeZone: string;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

/** 最近 `days` 个完整 UTC 日，不含今天。[start, end) */
export function resolveCompleteUtcWindow(
  days: number,
  now: Date = new Date(),
): { start: Date; end: Date } {
  const end = startOfUtcDay(now);
  return { start: addUtcDays(end, -days), end };
}

export function resolveDisplayTimeZone(timeZone: string | null | undefined): string {
  const candidate = timeZone?.trim();
  if (!candidate) return "UTC";
  try {
    Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return "UTC";
  }
}

export function toObservationWindowView(
  days: number,
  now: Date = new Date(),
  timeZone?: string | null,
): ObservationWindowView {
  const { start, end } = resolveCompleteUtcWindow(days, now);
  return {
    days,
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    timeZone: resolveDisplayTimeZone(timeZone),
  };
}

export function isInCompleteUtcWindow(date: Date, start: Date, end: Date): boolean {
  return date >= start && date < end;
}

/**
 * 用 UTC 当日正午再按店铺时区格式化，避免把 UTC 日界换算成前一天。
 * 展示的是 UTC 完整日的日历日期，时区只影响文案习惯和 GMT 标注。
 */
function utcCalendarNoon(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12));
}

export function formatWindowDate(date: Date, timeZone: string, locale: string): string {
  const noon = utcCalendarNoon(date);
  const numericParts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "numeric",
    day: "numeric",
  }).formatToParts(noon);
  const month = numericParts.find((part) => part.type === "month")?.value;
  const day = numericParts.find((part) => part.type === "day")?.value;
  if (locale.toLowerCase().startsWith("zh") && month && day) {
    return `${month}月${day}日`;
  }
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
  }).format(noon);
}

export function formatGmtOffset(timeZone: string, now: Date = new Date()): string {
  const resolved = resolveDisplayTimeZone(timeZone);
  const readOffset = (timeZoneName: "shortOffset" | "short") => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: resolved,
      timeZoneName,
    }).formatToParts(now);
    return parts.find((part) => part.type === "timeZoneName")?.value;
  };

  try {
    const offset = readOffset("shortOffset") ?? readOffset("short");
    if (offset) return offset.replace(/^UTC/, "GMT");
  } catch {
    // ignore unsupported timeZoneName
  }
  return resolved === "UTC" ? "UTC" : resolved;
}

export function formatCompleteUtcWindowParts(
  window: ObservationWindowView,
  locale: string,
): { start: string; end: string; tz: string } {
  const start = new Date(window.startAt);
  const endExclusive = new Date(window.endAt);
  const lastInclusive = addUtcDays(endExclusive, -1);
  const timeZone = resolveDisplayTimeZone(window.timeZone);
  return {
    start: formatWindowDate(start, timeZone, locale),
    end: formatWindowDate(lastInclusive, timeZone, locale),
    tz: formatGmtOffset(timeZone, start),
  };
}
